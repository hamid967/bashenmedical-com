CREATE OR REPLACE FUNCTION public.list_ai_safety_incidents(_conversation_id uuid)
RETURNS TABLE (
  id uuid,
  kind text,
  severity text,
  action_taken text,
  details jsonb,
  created_at timestamptz,
  inbox_item_id uuid,
  request_number text,
  inbox_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _is_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT user_id INTO _owner FROM public.ai_conversations WHERE id = _conversation_id;
  IF _owner IS NULL THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;

  _is_staff := public.has_role(auth.uid(), 'admin'::app_role)
            OR public.has_role(auth.uid(), 'super_admin'::app_role)
            OR public.has_role(auth.uid(), 'reception'::app_role);

  IF _owner <> auth.uid() AND NOT _is_staff THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.kind,
    i.severity,
    i.action_taken,
    i.details,
    i.created_at,
    i.inbox_item_id,
    it.request_number,
    it.status::text AS inbox_status
  FROM public.ai_safety_incidents i
  LEFT JOIN public.inbox_items it ON it.id = i.inbox_item_id
  WHERE i.conversation_id = _conversation_id
  ORDER BY i.created_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_ai_safety_incidents(uuid) TO authenticated;