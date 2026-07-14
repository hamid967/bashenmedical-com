CREATE OR REPLACE FUNCTION public.assign_user_role(_user_id uuid, _role app_role, _branch_id uuid DEFAULT NULL::uuid, _ip text DEFAULT NULL::text, _ua text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_super boolean := public.has_role(auth.uid(),'super_admin');
  _before jsonb;
  _after jsonb;
  _action text;
BEGIN
  IF auth.uid() IS NULL OR NOT (_is_super OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _role IN ('super_admin','admin') AND NOT _is_super THEN
    RAISE EXCEPTION 'only super_admin may grant this role' USING ERRCODE='42501';
  END IF;

  IF NOT _is_super THEN
    IF _branch_id IS NULL THEN
      RAISE EXCEPTION 'branch_id required for branch-scoped admins' USING ERRCODE='42501';
    END IF;
    IF NOT public.has_branch_access(auth.uid(), _branch_id) THEN
      RAISE EXCEPTION 'no access to target branch' USING ERRCODE='42501';
    END IF;
  END IF;

  -- Capture previous role assignment (if any) for audit
  SELECT jsonb_build_object(
           'user_id', user_id,
           'role', role,
           'branch_id', branch_id,
           'is_global', is_global
         )
  INTO _before
  FROM public.user_roles
  WHERE user_id = _user_id AND role = _role;

  INSERT INTO public.user_roles (user_id, role, branch_id, is_global)
  VALUES (_user_id, _role, _branch_id, _is_super AND _branch_id IS NULL)
  ON CONFLICT (user_id, role) DO UPDATE
    SET branch_id = EXCLUDED.branch_id,
        is_global = EXCLUDED.is_global;

  SELECT jsonb_build_object(
           'user_id', user_id,
           'role', role,
           'branch_id', branch_id,
           'is_global', is_global
         )
  INTO _after
  FROM public.user_roles
  WHERE user_id = _user_id AND role = _role;

  _action := CASE WHEN _before IS NULL THEN 'role_assigned' ELSE 'role_updated' END;

  -- Structured audit log (who / when / before / after)
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id,
    before_data, after_data, ip_address, user_agent, metadata
  ) VALUES (
    auth.uid(),
    CASE WHEN _is_super THEN 'super_admin' ELSE 'admin' END,
    _action,
    'user_role',
    _user_id::text,
    _before,
    _after,
    _ip,
    _ua,
    jsonb_build_object(
      'target_user', _user_id,
      'role', _role,
      'branch_id', _branch_id,
      'performed_at', now()
    )
  );

  -- Keep existing security event stream in sync
  PERFORM public.log_security_event(
    _action, NULL, NULL, NULL, NULL,
    jsonb_build_object(
      'target_user', _user_id,
      'role', _role,
      'branch_id', _branch_id,
      'previous', _before,
      'current', _after
    ),
    _ip, _ua
  );
END $function$;