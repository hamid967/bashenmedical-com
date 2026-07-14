
-- 1) Enhance set_role_permission to log previous/new state
CREATE OR REPLACE FUNCTION public.set_role_permission(_role app_role, _permission_key text, _enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _prev boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _role IN ('super_admin','admin') AND NOT public.has_role(auth.uid(),'super_admin') THEN
    RAISE EXCEPTION 'only super_admin may modify this role' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = _permission_key) THEN
    RAISE EXCEPTION 'unknown permission %', _permission_key USING ERRCODE='foreign_key_violation';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.role_permissions
    WHERE role = _role AND permission_key = _permission_key
  ) INTO _prev;

  IF _enabled THEN
    INSERT INTO public.role_permissions(role, permission_key, created_by)
    VALUES (_role, _permission_key, auth.uid())
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.role_permissions WHERE role = _role AND permission_key = _permission_key;
  END IF;

  -- Only log if state actually changed
  IF _prev IS DISTINCT FROM _enabled THEN
    PERFORM public.log_security_event(
      CASE WHEN _enabled THEN 'role_permission_granted' ELSE 'role_permission_revoked' END,
      NULL, NULL, NULL, NULL,
      jsonb_build_object(
        'role', _role,
        'permission', _permission_key,
        'previous_enabled', _prev,
        'new_enabled', _enabled
      )
    );
  END IF;
END $function$;

-- 2) Reader RPC — returns joined audit rows for the permissions page
CREATE OR REPLACE FUNCTION public.list_role_permission_audit(_limit integer DEFAULT 100, _offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  action text,
  actor_id uuid,
  actor_name text,
  actor_email text,
  role_key text,
  permission_key text,
  permission_label_ar text,
  permission_label_en text,
  previous_enabled boolean,
  new_enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
STABLE
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_permission(auth.uid(),'rbac.manage')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.created_at,
    s.action,
    s.actor,
    p.full_name,
    u.email::text,
    (s.metadata->>'role')::text            AS role_key,
    (s.metadata->>'permission')::text      AS permission_key,
    perm.label_ar                          AS permission_label_ar,
    perm.label_en                          AS permission_label_en,
    NULLIF(s.metadata->>'previous_enabled','')::boolean AS previous_enabled,
    NULLIF(s.metadata->>'new_enabled','')::boolean      AS new_enabled
  FROM public.security_audit_log s
  LEFT JOIN public.profiles    p    ON p.id = s.actor
  LEFT JOIN auth.users         u    ON u.id = s.actor
  LEFT JOIN public.permissions perm ON perm.key = (s.metadata->>'permission')
  WHERE s.action IN ('role_permission_granted','role_permission_revoked')
  ORDER BY s.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500))
  OFFSET GREATEST(0, _offset);
END $function$;

GRANT EXECUTE ON FUNCTION public.list_role_permission_audit(integer, integer) TO authenticated;
