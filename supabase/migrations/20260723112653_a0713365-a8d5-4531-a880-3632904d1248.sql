
-- ============================================================
-- Phase 3 Batch 3A: RBAC catalog, scope helpers, audit immutability
-- ============================================================

-- ---- 1. Permission catalog additions ------------------------

INSERT INTO public.permissions (key, category, description_ar, description_en) VALUES
  -- User & role administration
  ('users.manage',              'المستخدمون', 'إدارة حسابات المستخدمين',        'Manage users'),
  ('users.roles.assign',        'الصلاحيات',  'إسناد الأدوار للمستخدمين',       'Assign roles to users'),
  -- Appointment lifecycle verbs
  ('appointments.approve',      'المواعيد',   'اعتماد المواعيد',                'Approve appointments'),
  ('appointments.cancel',       'المواعيد',   'إلغاء المواعيد',                 'Cancel appointments'),
  ('appointments.assign',       'المواعيد',   'إسناد المواعيد للأطباء',         'Assign appointments'),
  ('appointments.export',       'المواعيد',   'تصدير قوائم المواعيد',           'Export appointment lists'),
  -- Patient lifecycle verbs
  ('patients.export',           'المرضى',     'تصدير قوائم المرضى',             'Export patient lists'),
  ('patients.archive',          'المرضى',     'أرشفة ملفات المرضى',             'Archive patient records'),
  -- Medical reports
  ('reports.medical.approve',   'التقارير الطبية', 'اعتماد التقارير الطبية',    'Approve medical reports'),
  ('reports.medical.export',    'التقارير الطبية', 'تصدير التقارير الطبية',     'Export medical reports'),
  -- Financial / operational exports
  ('reports.export',            'التقارير',   'تصدير التقارير الإدارية',        'Export operational reports'),
  ('billing.export',            'الفوترة',    'تصدير بيانات الفوترة',           'Export billing data'),
  ('insurance.export',          'التأمين',    'تصدير بيانات التأمين',           'Export insurance data'),
  ('audit.export',              'التدقيق',    'تصدير سجل التدقيق',              'Export audit log'),
  -- AI
  ('ai.tools.use',              'الذكاء الاصطناعي', 'استخدام أدوات الذكاء الاصطناعي', 'Use AI tools'),
  ('ai.actions.execute',        'الذكاء الاصطناعي', 'تنفيذ إجراءات الذكاء الاصطناعي', 'Execute AI actions')
ON CONFLICT (key) DO NOTHING;

-- ---- 2. Backfill role_permissions ---------------------------
-- super_admin owns every permission (auto-elevation only covers has_role,
-- has_permission requires an explicit mapping row).

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'super_admin'::app_role, p.key FROM public.permissions p
ON CONFLICT DO NOTHING;

-- center_admin (aka admin/Medical Center Administrator) — full operational
-- powers minus super_admin-only surface (permissions.manage, users.roles.assign).
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('center_admin', 'users.manage'),
  ('center_admin', 'appointments.approve'),
  ('center_admin', 'appointments.cancel'),
  ('center_admin', 'appointments.assign'),
  ('center_admin', 'appointments.export'),
  ('center_admin', 'patients.export'),
  ('center_admin', 'patients.archive'),
  ('center_admin', 'reports.export'),
  ('center_admin', 'reports.medical.approve'),
  ('center_admin', 'reports.medical.export'),
  ('center_admin', 'billing.export'),
  ('center_admin', 'insurance.export'),
  ('center_admin', 'audit.export'),
  ('center_admin', 'ai.tools.use')
ON CONFLICT DO NOTHING;

-- branch_manager — approve/cancel/assign inside their branch, export ops reports
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('branch_manager', 'appointments.approve'),
  ('branch_manager', 'appointments.cancel'),
  ('branch_manager', 'appointments.assign'),
  ('branch_manager', 'appointments.export'),
  ('branch_manager', 'reports.export'),
  ('branch_manager', 'ai.tools.use')
ON CONFLICT DO NOTHING;

-- reception — appointment lifecycle within branch (no approve/export)
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('reception', 'appointments.cancel'),
  ('reception', 'appointments.assign')
ON CONFLICT DO NOTHING;

-- doctor — AI usage for clinical assistance
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('doctor', 'appointments.cancel'),
  ('doctor', 'ai.tools.use'),
  ('doctor', 'ai.actions.execute')
ON CONFLICT DO NOTHING;

-- reports_officer — export operational + medical reports (view + export, no publish)
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('reports_officer', 'reports.export'),
  ('reports_officer', 'reports.medical.export')
ON CONFLICT DO NOTHING;

-- billing_officer — billing exports
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('billing_officer', 'billing.export')
ON CONFLICT DO NOTHING;

-- insurance_officer — insurance exports
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('insurance_officer', 'insurance.export')
ON CONFLICT DO NOTHING;

-- support_agent — read-only support (no new perms this batch)

-- content_manager — site content only (no medical/financial)
-- (no new perms this batch)

-- auditor — read-only + export audit trail
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('auditor', 'audit.export'),
  ('auditor', 'reports.export')
ON CONFLICT DO NOTHING;

-- ---- 3. Scope helper functions ------------------------------
-- All SECURITY DEFINER STABLE, callable only by authenticated (revoke PUBLIC).

CREATE OR REPLACE FUNCTION public.user_branch_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT branch_id
  FROM public.user_roles
  WHERE user_id = _user_id
    AND branch_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_global_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR role = 'super_admin'::app_role)
      AND is_global = true
  );
$$;

-- Returns true if the user holds the role globally OR pinned to _branch_id.
-- super_admin is treated as universally in-scope.
CREATE OR REPLACE FUNCTION public.has_role_in_branch(
  _user_id uuid, _role app_role, _branch_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'super_admin'::app_role
        OR (
          role = _role
          AND (is_global = true OR branch_id = _branch_id)
        )
      )
  );
$$;

-- Returns true if the user has the permission through any role that is either
-- global or pinned to _branch_id. RLS policies use this to enforce branch scope.
CREATE OR REPLACE FUNCTION public.has_permission_in_branch(
  _user_id uuid, _permission_key text, _branch_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id
      AND rp.permission_key = _permission_key
      AND (ur.is_global = true OR ur.branch_id = _branch_id)
  );
$$;

-- Lock down execute rights — never PUBLIC on SECURITY DEFINER helpers.
REVOKE ALL ON FUNCTION public.user_branch_ids(uuid)                        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_global_role(uuid, app_role)               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role_in_branch(uuid, app_role, uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_permission_in_branch(uuid, text, uuid)   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.user_branch_ids(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_global_role(uuid, app_role)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role_in_branch(uuid, app_role, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission_in_branch(uuid, text, uuid) TO authenticated;

-- ---- 4. Audit log immutability ------------------------------
-- audit_logs already has: insert-own-actor and permission-based SELECT.
-- Add RESTRICTIVE deny policies so even a future permissive policy cannot
-- accidentally enable UPDATE or DELETE.

DROP POLICY IF EXISTS "audit_logs deny update"      ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs deny delete"      ON public.audit_logs;

CREATE POLICY "audit_logs deny update"
  ON public.audit_logs
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "audit_logs deny delete"
  ON public.audit_logs
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- Revoke UPDATE/DELETE grants from every non-service role at the SQL level
-- as a defense-in-depth measure (RESTRICTIVE policy is the primary gate).
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM anon;
-- service_role retains ALL for archival/rotation jobs; RLS doesn't apply to it.
GRANT ALL ON public.audit_logs TO service_role;
