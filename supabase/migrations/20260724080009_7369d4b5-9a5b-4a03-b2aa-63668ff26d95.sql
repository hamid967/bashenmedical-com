
CREATE OR REPLACE FUNCTION public.list_ai_incident_events(_incident_id uuid)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  event_type text,
  actor_user_id uuid,
  actor_role text,
  payload jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv uuid;
  _owner uuid;
  _item uuid;
  _is_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT i.conversation_id, i.inbox_item_id
    INTO _conv, _item
  FROM public.ai_safety_incidents i
  WHERE i.id = _incident_id;

  IF _conv IS NULL AND _item IS NULL THEN
    RAISE EXCEPTION 'incident not found';
  END IF;

  IF _conv IS NOT NULL THEN
    SELECT c.user_id INTO _owner FROM public.ai_conversations c WHERE c.id = _conv;
  END IF;

  _is_staff := public.has_role(auth.uid(), 'admin'::app_role)
            OR public.has_role(auth.uid(), 'super_admin'::app_role)
            OR public.has_role(auth.uid(), 'reception'::app_role);

  IF (_owner IS NULL OR _owner <> auth.uid()) AND NOT _is_staff THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _item IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.item_id,
    e.event_type::text,
    e.actor_user_id,
    e.actor_role::text,
    e.payload,
    e.created_at
  FROM public.inbox_events e
  WHERE e.item_id = _item
  ORDER BY e.created_at ASC
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.list_ai_incident_events(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_ai_incident_events(uuid) TO authenticated;
