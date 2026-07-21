
-- Resource-scoped permissions: allow super_admin to grant per-service or per-page access
DO $$ BEGIN
  CREATE TYPE public.resource_kind AS ENUM ('service', 'page');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.resource_permission AS ENUM ('view', 'edit', 'manage');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_resource_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_kind public.resource_kind NOT NULL,
  resource_id UUID NOT NULL,
  permission public.resource_permission NOT NULL DEFAULT 'edit',
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_kind, resource_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_urp_user ON public.user_resource_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_urp_resource ON public.user_resource_permissions(resource_kind, resource_id);

GRANT SELECT ON public.user_resource_permissions TO authenticated;
GRANT ALL ON public.user_resource_permissions TO service_role;

ALTER TABLE public.user_resource_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "urp_self_read" ON public.user_resource_permissions;
CREATE POLICY "urp_self_read" ON public.user_resource_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "urp_owner_write" ON public.user_resource_permissions;
CREATE POLICY "urp_owner_write" ON public.user_resource_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Helper: does user have at least the given permission on a resource?
CREATE OR REPLACE FUNCTION public.has_resource_permission(
  _user_id UUID,
  _kind public.resource_kind,
  _resource_id UUID,
  _min public.resource_permission
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_resource_permissions
    WHERE user_id = _user_id
      AND resource_kind = _kind
      AND resource_id = _resource_id
      AND (
        (_min = 'view')
        OR (_min = 'edit'   AND permission IN ('edit','manage'))
        OR (_min = 'manage' AND permission = 'manage')
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_resource_permission(UUID, public.resource_kind, UUID, public.resource_permission) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_resource_permission(UUID, public.resource_kind, UUID, public.resource_permission) TO authenticated;

-- Convenience wrappers
CREATE OR REPLACE FUNCTION public.can_edit_service(_user_id UUID, _service_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin')
      OR public.has_role(_user_id, 'content_manager')
      OR public.has_resource_permission(_user_id, 'service'::public.resource_kind, _service_id, 'edit'::public.resource_permission);
$$;

CREATE OR REPLACE FUNCTION public.can_edit_page(_user_id UUID, _page_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin')
      OR public.has_role(_user_id, 'content_manager')
      OR public.has_resource_permission(_user_id, 'page'::public.resource_kind, _page_id, 'edit'::public.resource_permission);
$$;

REVOKE EXECUTE ON FUNCTION public.can_edit_service(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_page(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_edit_service(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_page(UUID, UUID) TO authenticated;
