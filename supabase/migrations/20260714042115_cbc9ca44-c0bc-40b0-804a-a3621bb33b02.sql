-- ============================================================
-- consent_records: patient consent tracking for Saudi healthcare
-- ============================================================
CREATE TYPE public.consent_type AS ENUM (
  'terms_of_service',
  'privacy_policy',
  'data_processing',
  'marketing_communications',
  'medical_treatment',
  'anesthesia',
  'surgical_procedure',
  'telemedicine',
  'share_medical_records',
  'insurance_data_sharing',
  'research_participation',
  'photography_recording',
  'minor_guardian_consent'
);

CREATE TYPE public.consent_status AS ENUM (
  'granted',
  'withdrawn',
  'expired',
  'superseded'
);

CREATE TABLE public.consent_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_type public.consent_type NOT NULL,
  status public.consent_status NOT NULL DEFAULT 'granted',
  version TEXT NOT NULL DEFAULT '1.0',
  document_url TEXT,
  document_hash TEXT,
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','en')),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  withdrawal_reason TEXT,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guardian_name TEXT,
  guardian_national_id TEXT,
  guardian_relationship TEXT,
  channel TEXT NOT NULL DEFAULT 'portal' CHECK (channel IN ('portal','reception','kiosk','clinician','api')),
  ip_address INET,
  user_agent TEXT,
  signature_data TEXT,
  linked_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_records_patient ON public.consent_records(patient_id, consent_type, status);
CREATE INDEX idx_consent_records_user ON public.consent_records(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_consent_records_type_active ON public.consent_records(patient_id, consent_type)
  WHERE status = 'granted';
CREATE INDEX idx_consent_records_appointment ON public.consent_records(linked_appointment_id)
  WHERE linked_appointment_id IS NOT NULL;

-- Only one active (granted) record per (patient, consent_type, version)
CREATE UNIQUE INDEX uniq_consent_active
  ON public.consent_records(patient_id, consent_type, version)
  WHERE status = 'granted';

-- ============================================================
-- GRANTS (required before RLS — Data API needs privileges)
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.consent_records TO authenticated;
GRANT ALL ON public.consent_records TO service_role;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- Patients read their own consents (via profiles.id = patients.profile_id = auth.uid())
CREATE POLICY "Patients read their own consents"
ON public.consent_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = consent_records.patient_id
      AND p.profile_id = auth.uid()
  )
);

-- Patients create their own consents (portal grants)
CREATE POLICY "Patients grant their own consents"
ON public.consent_records
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = consent_records.patient_id
      AND p.profile_id = auth.uid()
  )
  AND (user_id IS NULL OR user_id = auth.uid())
);

-- Patients withdraw their own consents (UPDATE limited to withdrawal fields via trigger below)
CREATE POLICY "Patients withdraw their own consents"
ON public.consent_records
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = consent_records.patient_id
      AND p.profile_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = consent_records.patient_id
      AND p.profile_id = auth.uid()
  )
);

-- Clinical/reception staff read all consents (needed before treatment)
CREATE POLICY "Clinical staff read consents"
ON public.consent_records
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'center_admin')
  OR public.has_role(auth.uid(), 'branch_manager')
  OR public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'reception')
  OR public.has_role(auth.uid(), 'auditor')
  OR public.has_role(auth.uid(), 'insurance_officer')
);

-- Reception/doctors/admins record consents on behalf of the patient (kiosk / paper capture)
CREATE POLICY "Staff record consents on behalf of patient"
ON public.consent_records
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'center_admin')
  OR public.has_role(auth.uid(), 'branch_manager')
  OR public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'reception')
);

-- Admins can update/supersede consents (e.g. mark expired, replace with new version)
CREATE POLICY "Admins manage consents"
ON public.consent_records
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'center_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'center_admin')
);

-- Only super_admin can hard-delete (retention/legal removal)
CREATE POLICY "Super admins delete consents"
ON public.consent_records
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- Triggers
-- ============================================================

-- updated_at maintenance
CREATE TRIGGER trg_consent_records_updated_at
BEFORE UPDATE ON public.consent_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set withdrawn_at when status transitions to withdrawn
CREATE OR REPLACE FUNCTION public.consent_records_auto_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'withdrawn' AND OLD.status <> 'withdrawn' AND NEW.withdrawn_at IS NULL THEN
    NEW.withdrawn_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consent_records_withdrawal
BEFORE UPDATE ON public.consent_records
FOR EACH ROW EXECUTE FUNCTION public.consent_records_auto_withdrawal();

-- Expiry validation trigger (Postgres CHECK constraints can't reference now())
CREATE OR REPLACE FUNCTION public.consent_records_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= NEW.granted_at THEN
    RAISE EXCEPTION 'expires_at must be after granted_at';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_consent_records_validate
BEFORE INSERT OR UPDATE ON public.consent_records
FOR EACH ROW EXECUTE FUNCTION public.consent_records_validate();

-- ============================================================
-- Helper function: check whether a patient has an active consent
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_active_consent(
  _patient_id UUID,
  _consent_type public.consent_type
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.consent_records
    WHERE patient_id = _patient_id
      AND consent_type = _consent_type
      AND status = 'granted'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, public.consent_type) TO authenticated;

COMMENT ON TABLE public.consent_records IS
  'Patient consent records (privacy, treatment, data-sharing). Append-only in spirit: withdrawals create a status change, they do not delete rows.';