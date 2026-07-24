CREATE OR REPLACE FUNCTION public.admin_list_data_contracts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok  boolean;
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT (public.has_role(v_uid, 'admin'::public.app_role)
       OR public.has_role(v_uid, 'super_admin'::public.app_role))
    INTO v_ok;

  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH tabs AS (
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),
  cols AS (
    SELECT table_name,
           jsonb_agg(jsonb_build_object(
             'name', column_name,
             'type', data_type,
             'nullable', (is_nullable = 'YES'),
             'default', column_default
           ) ORDER BY ordinal_position) AS columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
    GROUP BY table_name
  ),
  pols AS (
    SELECT tablename AS table_name,
           jsonb_agg(jsonb_build_object(
             'name', policyname,
             'cmd', cmd,
             'roles', roles,
             'qual', qual,
             'with_check', with_check
           ) ORDER BY policyname) AS policies
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'table', t.table_name,
             'rls_enabled', t.rls_enabled,
             'columns', COALESCE(c.columns, '[]'::jsonb),
             'policies', COALESCE(p.policies, '[]'::jsonb)
           ) ORDER BY t.table_name
         )
    INTO v_res
  FROM tabs t
  LEFT JOIN cols c ON c.table_name = t.table_name
  LEFT JOIN pols p ON p.table_name = t.table_name;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_data_contracts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_data_contracts() TO authenticated;