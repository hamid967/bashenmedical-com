-- Phase 2 Foundation — Batch A

-- 2.1 patient_identifiers
CREATE TABLE IF NOT EXISTS public.patient_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  id_type text NOT NULL CHECK (id_type IN ('national_id','iqama','passport','mrn','gcc_id','border_no')),
  id_value text NOT NULL,
  country_code text,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_type, id_value)
);
CREATE INDEX IF NOT EXISTS idx_patient_identifiers_patient ON public.patient_identifiers(patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_identifiers TO authenticated;
GRANT ALL ON public.patient_identifiers TO service_role;
ALTER TABLE public.patient_identifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_identifiers_owner_select" ON public.patient_identifiers
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.profile_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "patient_identifiers_admin_write" ON public.patient_identifiers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Backfill national_id + mrn from patients
INSERT INTO public.patient_identifiers (patient_id, id_type, id_value, is_primary, is_demo)
SELECT p.id, 'national_id', p.national_id, true, COALESCE(p.is_demo, false)
FROM public.patients p
WHERE p.national_id IS NOT NULL AND length(trim(p.national_id)) > 0
ON CONFLICT (id_type, id_value) DO NOTHING;

INSERT INTO public.patient_identifiers (patient_id, id_type, id_value, is_primary, is_demo)
SELECT p.id, 'mrn', p.mrn, false, COALESCE(p.is_demo, false)
FROM public.patients p
WHERE p.mrn IS NOT NULL AND length(trim(p.mrn)) > 0
ON CONFLICT (id_type, id_value) DO NOTHING;

-- 2.2 patient_duplicate_cases
CREATE TABLE IF NOT EXISTS public.patient_duplicate_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  duplicate_patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  match_score numeric(4,3) NOT NULL DEFAULT 0,
  match_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed_duplicate','not_duplicate','merged')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (primary_patient_id <> duplicate_patient_id)
);
CREATE INDEX IF NOT EXISTS idx_dup_cases_status ON public.patient_duplicate_cases(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_duplicate_cases TO authenticated;
GRANT ALL ON public.patient_duplicate_cases TO service_role;
ALTER TABLE public.patient_duplicate_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dup_cases_admin_only" ON public.patient_duplicate_cases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2.3 clinics
CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  room_no text,
  floor text,
  specialty_id uuid REFERENCES public.specialties(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clinics_branch ON public.clinics(branch_id);

GRANT SELECT ON public.clinics TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinics_public_read_active" ON public.clinics
  FOR SELECT TO anon, authenticated
  USING (is_active AND NOT is_demo);

CREATE POLICY "clinics_admin_write" ON public.clinics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2.4 doctor_schedules
CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_minutes smallint NOT NULL DEFAULT 15 CHECK (slot_minutes BETWEEN 5 AND 240),
  capacity_per_slot smallint NOT NULL DEFAULT 1,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor ON public.doctor_schedules(doctor_id, weekday);

GRANT SELECT ON public.doctor_schedules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_schedules TO authenticated;
GRANT ALL ON public.doctor_schedules TO service_role;
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctor_schedules_public_read" ON public.doctor_schedules
  FOR SELECT TO anon, authenticated
  USING (is_active AND NOT is_demo);

CREATE POLICY "doctor_schedules_admin_write" ON public.doctor_schedules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- schedule_exceptions
CREATE TABLE IF NOT EXISTS public.schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  exception_date date NOT NULL,
  start_time time,
  end_time time,
  reason text NOT NULL CHECK (reason IN ('leave','sick','emergency','training','holiday','other')),
  notes text,
  created_by uuid,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sched_exc_doctor_date ON public.schedule_exceptions(doctor_id, exception_date);

GRANT SELECT ON public.schedule_exceptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_exceptions TO authenticated;
GRANT ALL ON public.schedule_exceptions TO service_role;
ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_exceptions_public_read" ON public.schedule_exceptions
  FOR SELECT TO anon, authenticated
  USING (NOT is_demo);

CREATE POLICY "schedule_exceptions_admin_write" ON public.schedule_exceptions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2.5 appointments columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_source') THEN
    CREATE TYPE public.booking_source AS ENUM (
      'web','mobile','front_desk','call_center','whatsapp','partner_api','walk_in','ai_assistant','waitlist'
    );
  END IF;
END $$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_source public.booking_source NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS called_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_wait_min smallint;

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_patient_identifiers_updated_at') THEN
    CREATE TRIGGER trg_patient_identifiers_updated_at BEFORE UPDATE ON public.patient_identifiers
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_patient_dup_cases_updated_at') THEN
    CREATE TRIGGER trg_patient_dup_cases_updated_at BEFORE UPDATE ON public.patient_duplicate_cases
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_clinics_updated_at') THEN
    CREATE TRIGGER trg_clinics_updated_at BEFORE UPDATE ON public.clinics
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_doctor_schedules_updated_at') THEN
    CREATE TRIGGER trg_doctor_schedules_updated_at BEFORE UPDATE ON public.doctor_schedules
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_schedule_exceptions_updated_at') THEN
    CREATE TRIGGER trg_schedule_exceptions_updated_at BEFORE UPDATE ON public.schedule_exceptions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;