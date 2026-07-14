
-- has_permission()
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _permission_key
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- SEED permissions
INSERT INTO public.permissions (key, category, description_ar, description_en) VALUES
  ('reports.medical.view',    'التقارير الطبية', 'عرض التقارير الطبية', 'View medical reports'),
  ('reports.medical.publish', 'التقارير الطبية', 'نشر التقارير للمرضى', 'Publish reports'),
  ('reports.medical.revoke',  'التقارير الطبية', 'سحب تقرير منشور',     'Revoke a report'),
  ('billing.view',            'الفوترة',         'عرض الفواتير',            'View invoices'),
  ('billing.manage',          'الفوترة',         'إدارة الفواتير',          'Manage invoices'),
  ('billing.refund',          'الفوترة',         'معالجة الاسترجاعات',      'Process refunds'),
  ('insurance.view',          'التأمين',         'عرض طلبات التأمين',       'View insurance'),
  ('insurance.manage',        'التأمين',         'إدارة طلبات التأمين',     'Manage insurance'),
  ('schedules.manage',        'الجداول',         'إدارة جداول الأطباء',     'Manage schedules'),
  ('checkin.perform',         'تسجيل الوصول',    'تسجيل وصول المرضى',       'Check patients in'),
  ('content.manage',          'المحتوى',         'تحرير محتوى الموقع',      'Edit content'),
  ('audit.view.full',         'التدقيق',         'عرض كامل سجل التدقيق',    'View full audit'),
  ('permissions.manage',      'الصلاحيات',       'تعديل مصفوفة الصلاحيات',  'Edit permissions'),
  ('integrations.manage',     'التكاملات',       'إدارة التكاملات',         'Manage integrations'),
  ('analytics.view',          'التحليلات',       'عرض التحليلات',           'View analytics'),
  ('data.export',             'البيانات',        'تصدير البيانات',          'Export data')
ON CONFLICT (key) DO NOTHING;

-- role_permissions matrix
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('super_admin','appointments.view'),('super_admin','appointments.manage'),
  ('super_admin','patients.view'),('super_admin','patients.manage'),
  ('super_admin','patients.clinical.write'),('super_admin','doctors.manage'),
  ('super_admin','nurses.manage'),('super_admin','pharmacy.view'),('super_admin','pharmacy.manage'),
  ('super_admin','inventory.manage'),('super_admin','hr.manage'),
  ('super_admin','notifications.manage'),('super_admin','settings.manage'),
  ('super_admin','rbac.manage'),('super_admin','audit.view'),('super_admin','reports.view'),
  ('super_admin','reports.medical.view'),('super_admin','reports.medical.publish'),
  ('super_admin','reports.medical.revoke'),('super_admin','billing.view'),
  ('super_admin','billing.manage'),('super_admin','billing.refund'),
  ('super_admin','insurance.view'),('super_admin','insurance.manage'),
  ('super_admin','schedules.manage'),('super_admin','checkin.perform'),
  ('super_admin','content.manage'),('super_admin','audit.view.full'),
  ('super_admin','permissions.manage'),('super_admin','integrations.manage'),
  ('super_admin','analytics.view'),('super_admin','data.export'),
  ('center_admin','appointments.view'),('center_admin','appointments.manage'),
  ('center_admin','patients.view'),('center_admin','patients.manage'),
  ('center_admin','doctors.manage'),('center_admin','schedules.manage'),
  ('center_admin','reports.medical.view'),('center_admin','reports.medical.publish'),
  ('center_admin','billing.view'),('center_admin','billing.manage'),
  ('center_admin','insurance.view'),('center_admin','insurance.manage'),
  ('center_admin','notifications.manage'),('center_admin','analytics.view'),
  ('center_admin','audit.view'),('center_admin','content.manage'),
  ('center_admin','checkin.perform'),('center_admin','data.export'),
  ('branch_manager','appointments.view'),('branch_manager','appointments.manage'),
  ('branch_manager','patients.view'),('branch_manager','schedules.manage'),
  ('branch_manager','analytics.view'),('branch_manager','checkin.perform'),
  ('reception','checkin.perform'),
  ('doctor','reports.medical.view'),('doctor','schedules.manage'),
  ('reports_officer','patients.view'),('reports_officer','reports.medical.view'),
  ('reports_officer','reports.medical.publish'),('reports_officer','reports.medical.revoke'),
  ('billing_officer','patients.view'),('billing_officer','billing.view'),
  ('billing_officer','billing.manage'),('billing_officer','billing.refund'),
  ('insurance_officer','patients.view'),('insurance_officer','insurance.view'),
  ('insurance_officer','insurance.manage'),
  ('support_agent','appointments.view'),('support_agent','patients.view'),
  ('content_manager','content.manage'),
  ('auditor','audit.view'),('auditor','audit.view.full'),
  ('auditor','appointments.view'),('auditor','patients.view'),
  ('auditor','billing.view'),('auditor','insurance.view'),
  ('auditor','reports.medical.view'),('auditor','analytics.view')
ON CONFLICT (role, permission_key) DO NOTHING;

-- is_demo flags
ALTER TABLE public.doctors           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.appointments      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices          ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.prescriptions     ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.lab_reports       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.radiology_reports ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.patients          ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at_ts() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- medical_reports
CREATE TABLE IF NOT EXISTS public.medical_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  report_type text NOT NULL CHECK (report_type IN ('lab','radiology','visit_summary','discharge','certificate','referral','other')),
  title_ar text NOT NULL,
  title_en text,
  summary text,
  file_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','revoked')),
  published_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  is_demo boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medical_reports_patient ON public.medical_reports(patient_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_reports_status ON public.medical_reports(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_reports TO authenticated;
GRANT ALL ON public.medical_reports TO service_role;
ALTER TABLE public.medical_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patients read own published reports" ON public.medical_reports FOR SELECT TO authenticated
  USING (status='published' AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM public.patients p WHERE p.id=medical_reports.patient_id AND p.profile_id=auth.uid()));
CREATE POLICY "staff read medical reports" ON public.medical_reports FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'reports.medical.view'));
CREATE POLICY "staff insert medical reports" ON public.medical_reports FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'reports.medical.publish'));
CREATE POLICY "staff update medical reports" ON public.medical_reports FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'reports.medical.publish'))
  WITH CHECK (public.has_permission(auth.uid(),'reports.medical.publish'));
CREATE POLICY "staff revoke medical reports" ON public.medical_reports FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(),'reports.medical.revoke'));
CREATE TRIGGER trg_medical_reports_updated BEFORE UPDATE ON public.medical_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

-- report_versions
CREATE TABLE IF NOT EXISTS public.report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.medical_reports(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  file_path text,
  summary text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_id, version_number)
);
GRANT SELECT, INSERT ON public.report_versions TO authenticated;
GRANT ALL ON public.report_versions TO service_role;
ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read report versions" ON public.report_versions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'reports.medical.view'));
CREATE POLICY "staff insert report versions" ON public.report_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'reports.medical.publish'));

-- dependents
CREATE TABLE IF NOT EXISTS public.dependents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('child','spouse','parent','sibling','other')),
  national_id text,
  phone text,
  gender text CHECK (gender IN ('male','female')),
  date_of_birth date,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dependents_guardian ON public.dependents(guardian_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dependents TO authenticated;
GRANT ALL ON public.dependents TO service_role;
ALTER TABLE public.dependents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guardian manage own dependents" ON public.dependents FOR ALL TO authenticated
  USING (auth.uid()=guardian_user_id) WITH CHECK (auth.uid()=guardian_user_id);
CREATE POLICY "staff read dependents" ON public.dependents FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'patients.view'));
CREATE TRIGGER trg_dependents_updated BEFORE UPDATE ON public.dependents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

-- patient_check_ins
CREATE TABLE IF NOT EXISTS public.patient_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  queue_number int,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','called','in_room','completed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checkins_appointment ON public.patient_check_ins(appointment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_check_ins TO authenticated;
GRANT ALL ON public.patient_check_ins TO service_role;
ALTER TABLE public.patient_check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patient read own checkin" ON public.patient_check_ins FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.patients p WHERE p.id=patient_check_ins.patient_id AND p.profile_id=auth.uid()));
CREATE POLICY "patient create own checkin" ON public.patient_check_ins FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.patients p WHERE p.id=patient_check_ins.patient_id AND p.profile_id=auth.uid()));
CREATE POLICY "staff manage checkins" ON public.patient_check_ins FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'checkin.perform'))
  WITH CHECK (public.has_permission(auth.uid(),'checkin.perform'));
CREATE TRIGGER trg_checkins_updated BEFORE UPDATE ON public.patient_check_ins
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

-- payments
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'SAR',
  method text NOT NULL CHECK (method IN ('mada','visa','mastercard','apple_pay','stc_pay','cash','bank_transfer','insurance','other')),
  gateway text,
  gateway_ref text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','cancelled')),
  paid_at timestamptz,
  is_mock boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patient read own payments" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.invoices i JOIN public.patients p ON p.id=i.patient_id
    WHERE i.id=payments.invoice_id AND p.profile_id=auth.uid()));
CREATE POLICY "patient create own payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.invoices i JOIN public.patients p ON p.id=i.patient_id
    WHERE i.id=payments.invoice_id AND p.profile_id=auth.uid()));
CREATE POLICY "billing manage payments" ON public.payments FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'billing.manage'))
  WITH CHECK (public.has_permission(auth.uid(),'billing.manage'));
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

-- refunds
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','completed','rejected')),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing refund read" ON public.refunds FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'billing.view'));
CREATE POLICY "billing refund write" ON public.refunds FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'billing.refund'))
  WITH CHECK (public.has_permission(auth.uid(),'billing.refund'));
CREATE TRIGGER trg_refunds_updated BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

-- insurance_approvals
CREATE TABLE IF NOT EXISTS public.insurance_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  insurance_provider_id uuid REFERENCES public.insurance_providers(id) ON DELETE SET NULL,
  request_number text UNIQUE,
  service_description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','info_needed','approved','partially_approved','rejected','expired')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  expires_at date,
  approved_amount numeric(12,2),
  patient_share numeric(12,2),
  missing_documents text[],
  attachments jsonb DEFAULT '[]'::jsonb,
  notes text,
  is_mock boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ins_approvals_patient ON public.insurance_approvals(patient_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.insurance_approvals TO authenticated;
GRANT ALL ON public.insurance_approvals TO service_role;
ALTER TABLE public.insurance_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patient read own approvals" ON public.insurance_approvals FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.patients p WHERE p.id=insurance_approvals.patient_id AND p.profile_id=auth.uid()));
CREATE POLICY "insurance staff read approvals" ON public.insurance_approvals FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'insurance.view'));
CREATE POLICY "insurance staff manage approvals" ON public.insurance_approvals FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(),'insurance.manage'))
  WITH CHECK (public.has_permission(auth.uid(),'insurance.manage'));
CREATE TRIGGER trg_ins_approvals_updated BEFORE UPDATE ON public.insurance_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditors read audit_logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'audit.view.full'));
CREATE POLICY "user insert own audit event" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- system_settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "super_admin manage settings" ON public.system_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role));

-- integration_logs
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL,
  operation text NOT NULL,
  is_mock boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK (status IN ('success','failure','pending')),
  request_data jsonb,
  response_data jsonb,
  error_message text,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_logs_key ON public.integration_logs(integration_key, created_at DESC);
GRANT SELECT, INSERT ON public.integration_logs TO authenticated;
GRANT ALL ON public.integration_logs TO service_role;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read integration logs" ON public.integration_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'integrations.manage'));
CREATE POLICY "staff insert integration logs" ON public.integration_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'integrations.manage'));

-- audit triggers on sensitive tables
CREATE OR REPLACE FUNCTION public.tg_write_audit_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, before_data, after_data)
  VALUES (
    auth.uid(), TG_OP, TG_TABLE_NAME,
    COALESCE((NEW).id::text, (OLD).id::text),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.tg_write_audit_log() FROM PUBLIC, anon;

CREATE TRIGGER trg_audit_medical_reports AFTER INSERT OR UPDATE OR DELETE ON public.medical_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_write_audit_log();
CREATE TRIGGER trg_audit_insurance_approvals AFTER INSERT OR UPDATE OR DELETE ON public.insurance_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tg_write_audit_log();
CREATE TRIGGER trg_audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_write_audit_log();
CREATE TRIGGER trg_audit_refunds AFTER INSERT OR UPDATE OR DELETE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.tg_write_audit_log();
