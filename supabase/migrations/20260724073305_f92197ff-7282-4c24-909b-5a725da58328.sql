
-- 1) Extend inbox_channel with an AI-assistant escalation source.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'inbox_channel' AND e.enumlabel = 'ai_assistant'
  ) THEN
    ALTER TYPE public.inbox_channel ADD VALUE 'ai_assistant';
  END IF;
END $$;

-- 2) Link an AI safety incident to the operational ticket it produced.
ALTER TABLE public.ai_safety_incidents
  ADD COLUMN IF NOT EXISTS inbox_item_id uuid REFERENCES public.inbox_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_safety_incidents_inbox_item
  ON public.ai_safety_incidents(inbox_item_id);

-- 3) One-shot escalation RPC: creates the inbox ticket, logs the incident,
--    and records the audit event atomically. SECURITY DEFINER lets an
--    authenticated caller (patient / staff) write to inbox_items even
--    though their base RLS may not allow direct INSERTs there.
CREATE OR REPLACE FUNCTION public.escalate_ai_to_inbox(
  _conversation_id uuid,
  _reason          text,
  _severity        text DEFAULT 'medium',
  _lang            text DEFAULT 'ar',
  _summary         text DEFAULT NULL,
  _last_user_msg   text DEFAULT NULL,
  _last_ai_msg     text DEFAULT NULL
)
RETURNS TABLE (inbox_item_id uuid, request_number text, incident_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _conv  RECORD;
  _item  RECORD;
  _incident_id uuid;
  _priority public.inbox_priority;
  _req text;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason too short' USING ERRCODE = '22023';
  END IF;

  -- Verify caller owns the conversation OR is staff (any role in user_roles).
  SELECT id, user_id, scope, title, lang
    INTO _conv
    FROM public.ai_conversations
   WHERE id = _conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = 'P0002';
  END IF;

  IF _conv.user_id IS DISTINCT FROM _actor
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _actor)
  THEN
    RAISE EXCEPTION 'not authorized to escalate this conversation' USING ERRCODE = '42501';
  END IF;

  _priority := CASE lower(coalesce(_severity,'medium'))
                 WHEN 'critical' THEN 'urgent'::public.inbox_priority
                 WHEN 'high'     THEN 'high'::public.inbox_priority
                 WHEN 'low'      THEN 'low'::public.inbox_priority
                 ELSE                 'normal'::public.inbox_priority
               END;

  _req := 'AI-' || to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYMMDD') || '-'
          || upper(substring(replace(gen_random_uuid()::text,'-',''),1,6));

  INSERT INTO public.inbox_items (
    request_number, source_table, source_id, channel, patient_id,
    subject, department, priority, status, required_action, metadata
  )
  VALUES (
    _req, 'ai_conversations', _conversation_id, 'ai_assistant', _conv.user_id,
    coalesce(nullif(btrim(left(_reason, 180)), ''), 'AI escalation'),
    'ai_escalation', _priority, 'new',
    'مراجعة تصعيد المساعد الذكي والرد على المريض',
    jsonb_build_object(
      'source', 'baeshen_ai_assistant',
      'lang', coalesce(_lang, _conv.lang, 'ar'),
      'scope', _conv.scope,
      'severity', lower(coalesce(_severity,'medium')),
      'summary', _summary,
      'last_user_message', left(coalesce(_last_user_msg,''), 2000),
      'last_ai_message',   left(coalesce(_last_ai_msg,''),   2000),
      'reason', _reason
    )
  )
  RETURNING id, request_number INTO _item;

  INSERT INTO public.ai_safety_incidents (
    conversation_id, actor, kind, severity, action_taken, details, inbox_item_id
  )
  VALUES (
    _conversation_id, _actor, 'human_escalation',
    lower(coalesce(_severity,'medium')),
    'escalated_to_inbox',
    jsonb_build_object(
      'reason', _reason,
      'summary', _summary,
      'request_number', _item.request_number,
      'lang', coalesce(_lang, _conv.lang, 'ar')
    ),
    _item.id
  )
  RETURNING id INTO _incident_id;

  -- Immutable audit event on the inbox ticket itself.
  INSERT INTO public.inbox_events (item_id, actor_user_id, action, from_value, to_value, note)
  VALUES (
    _item.id, _actor, 'created', NULL,
    jsonb_build_object(
      'source', 'ai_assistant',
      'incident_id', _incident_id,
      'severity', lower(coalesce(_severity,'medium'))
    ),
    left(_reason, 500)
  );

  inbox_item_id := _item.id;
  request_number := _item.request_number;
  incident_id := _incident_id;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.escalate_ai_to_inbox(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.escalate_ai_to_inbox(uuid, text, text, text, text, text, text) TO authenticated;
