
CREATE OR REPLACE FUNCTION public.get_ai_escalation_status(_conversation_id uuid)
RETURNS TABLE (
  inbox_item_id uuid,
  request_number text,
  status public.inbox_status,
  priority public.inbox_priority,
  created_at timestamptz,
  updated_at timestamptz,
  incident_severity text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_is_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT user_id INTO v_owner
  FROM public.ai_conversations
  WHERE id = _conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;

  v_is_staff := public.has_role(v_uid, 'admin')
    OR public.has_role(v_uid, 'super_admin')
    OR public.has_role(v_uid, 'reception');

  IF v_owner IS DISTINCT FROM v_uid AND NOT v_is_staff THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    i.id AS inbox_item_id,
    i.request_number,
    i.status,
    i.priority,
    i.created_at,
    i.updated_at,
    s.severity::text AS incident_severity
  FROM public.ai_safety_incidents s
  JOIN public.inbox_items i ON i.id = s.inbox_item_id
  WHERE s.conversation_id = _conversation_id
    AND s.kind = 'human_escalation'
    AND s.inbox_item_id IS NOT NULL
  ORDER BY i.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_escalation_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_escalation_status(uuid) TO authenticated;
