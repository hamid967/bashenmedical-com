
-- 1. patient_profiles
CREATE TABLE public.patient_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  national_id TEXT UNIQUE,
  iqama TEXT UNIQUE,
  mobile_e164 TEXT,
  mobile_verified_at TIMESTAMPTZ,
  full_name_ar TEXT,
  full_name_en TEXT,
  date_of_birth DATE,
  gender TEXT,
  preferred_language TEXT DEFAULT 'ar',
  mrn TEXT UNIQUE,
  default_branch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.patient_profiles TO authenticated;
GRANT ALL ON public.patient_profiles TO service_role;
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patient_profiles_owner_select" ON public.patient_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "patient_profiles_owner_upsert" ON public.patient_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "patient_profiles_owner_update" ON public.patient_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "patient_profiles_admin_select" ON public.patient_profiles
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

-- 2. staff_profiles
CREATE TABLE public.staff_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_no TEXT UNIQUE,
  department TEXT,
  job_title TEXT,
  hire_date DATE,
  branch_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_profiles_owner_select" ON public.staff_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "staff_profiles_admin_select" ON public.staff_profiles
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );
CREATE POLICY "staff_profiles_admin_write" ON public.staff_profiles
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

-- 3. doctor_profiles
CREATE TABLE public.doctor_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  license_no TEXT UNIQUE,
  specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.doctor_profiles TO authenticated;
GRANT ALL ON public.doctor_profiles TO service_role;
ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctor_profiles_owner_select" ON public.doctor_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "doctor_profiles_owner_update" ON public.doctor_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "doctor_profiles_admin_all" ON public.doctor_profiles
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  ) WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

-- 4. otp_challenges — no plaintext codes, service_role only
CREATE TABLE public.otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  destination TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login','register','recovery','mobile_change')),
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  ip INET,
  ua TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_challenges_dest_idx ON public.otp_challenges (destination, purpose, created_at DESC);
CREATE INDEX otp_challenges_expires_idx ON public.otp_challenges (expires_at) WHERE consumed_at IS NULL;
GRANT ALL ON public.otp_challenges TO service_role;
ALTER TABLE public.otp_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "otp_challenges_no_public" ON public.otp_challenges
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 5. device_sessions
CREATE TABLE public.device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_fingerprint TEXT NOT NULL,
  supabase_session_id TEXT,
  ua TEXT,
  ip_hash TEXT,
  city TEXT,
  country TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  UNIQUE (user_id, session_fingerprint)
);
CREATE INDEX device_sessions_user_idx ON public.device_sessions (user_id, revoked_at, last_seen_at DESC);
GRANT SELECT ON public.device_sessions TO authenticated;
GRANT ALL ON public.device_sessions TO service_role;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_sessions_owner_select" ON public.device_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 6. auth_events — audit log, server-only writes
CREATE TABLE public.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  ip_hash TEXT,
  ua TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_user_idx ON public.auth_events (user_id, created_at DESC);
CREATE INDEX auth_events_kind_idx ON public.auth_events (kind, created_at DESC);
GRANT SELECT ON public.auth_events TO authenticated;
GRANT ALL ON public.auth_events TO service_role;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_events_owner_select" ON public.auth_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "auth_events_admin_select" ON public.auth_events
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')
  );

-- 7. auth_rate_limits — server-only
CREATE TABLE public.auth_rate_limits (
  key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INT NOT NULL DEFAULT 0,
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_rate_limits TO service_role;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_rate_limits_no_public" ON public.auth_rate_limits
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- updated_at triggers reuse existing helper if present
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_patient_profiles_uat BEFORE UPDATE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_staff_profiles_uat BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_doctor_profiles_uat BEFORE UPDATE ON public.doctor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill patient_profiles from profiles for users holding the patient role
INSERT INTO public.patient_profiles (
  user_id, national_id, mobile_e164, mobile_verified_at,
  full_name_ar, date_of_birth, gender, preferred_language, default_branch_id
)
SELECT
  p.id,
  NULLIF(p.national_id, ''),
  NULLIF(COALESCE(p.verified_phone, p.phone), ''),
  p.phone_verified_at,
  NULLIF(p.full_name, ''),
  p.date_of_birth,
  NULLIF(p.gender, ''),
  COALESCE(NULLIF(p.preferred_language,''),'ar'),
  p.default_branch_id
FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'patient'
)
ON CONFLICT (user_id) DO NOTHING;
