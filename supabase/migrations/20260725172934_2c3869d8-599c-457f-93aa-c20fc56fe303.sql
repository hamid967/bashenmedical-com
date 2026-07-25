
REVOKE ALL ON FUNCTION public.user_org_ids(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_in_org(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_org_ids(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_in_org(UUID, UUID) TO authenticated, service_role;
