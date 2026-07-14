
CREATE TABLE IF NOT EXISTS public.slot_holds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  session_id TEXT NOT NULL,
  idempotency_key TEXT,
  held_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slot_holds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slot_holds TO anon;
GRANT ALL ON public.slot_holds TO service_role;

ALTER TABLE public.slot_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hold_owner_read" ON public.slot_holds;
DROP POLICY IF EXISTS "hold_anon_insert" ON public.slot_holds;
DROP POLICY IF EXISTS "hold_owner_release" ON public.slot_holds;
DROP POLICY IF EXISTS "hold_admin_all" ON public.slot_holds;

CREATE POLICY "hold_owner_read" ON public.slot_holds FOR SELECT USING (true);
CREATE POLICY "hold_anon_insert" ON public.slot_holds FOR INSERT WITH CHECK (true);
CREATE POLICY "hold_owner_release" ON public.slot_holds FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "hold_admin_all" ON public.slot_holds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS slot_holds_active_uidx
  ON public.slot_holds (doctor_id, appointment_date, appointment_time)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS slot_holds_session_idx ON public.slot_holds (session_id);
CREATE INDEX IF NOT EXISTS slot_holds_expires_idx ON public.slot_holds (expires_at);

CREATE TABLE IF NOT EXISTS public.appointment_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  from_status public.appointment_status,
  to_status public.appointment_status NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.appointment_status_history TO authenticated;
GRANT ALL ON public.appointment_status_history TO service_role;

ALTER TABLE public.appointment_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "status_history_admin_read" ON public.appointment_status_history;
DROP POLICY IF EXISTS "status_history_owner_read" ON public.appointment_status_history;

CREATE POLICY "status_history_admin_read" ON public.appointment_status_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'reception'));

CREATE POLICY "status_history_owner_read" ON public.appointment_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.appointments a
    JOIN public.patients p ON p.id = a.patient_id
    WHERE a.id = appointment_status_history.appointment_id
      AND p.profile_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS status_history_appt_idx
  ON public.appointment_status_history (appointment_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_appointment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.appointment_status_history (appointment_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.appointment_status_history (appointment_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appt_status_history ON public.appointments;
CREATE TRIGGER trg_appt_status_history
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_appointment_status_change();

DROP INDEX IF EXISTS public.appointments_doctor_slot_active_uidx;
CREATE UNIQUE INDEX appointments_doctor_slot_active_uidx
  ON public.appointments (doctor_id, appointment_date, appointment_time)
  WHERE doctor_id IS NOT NULL
    AND status IN ('new','confirmed','completed','held','pending_verification','pending_payment','checked_in','in_progress');

CREATE OR REPLACE FUNCTION public.book_appointment_atomic(
  p_doctor_id UUID,
  p_branch_id UUID,
  p_specialty_id UUID,
  p_appointment_date DATE,
  p_appointment_time TIME,
  p_patient_name TEXT,
  p_patient_phone TEXT,
  p_patient_email TEXT DEFAULT NULL,
  p_national_id TEXT DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_reminder_24h BOOLEAN DEFAULT true,
  p_reminder_2h BOOLEAN DEFAULT true,
  p_idempotency_key TEXT DEFAULT NULL,
  p_hold_id UUID DEFAULT NULL,
  p_patient_id UUID DEFAULT NULL,
  p_initial_status public.appointment_status DEFAULT 'new'
)
RETURNS TABLE(appointment_id UUID, reference TEXT, status public.appointment_status)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_status public.appointment_status;
  v_existing UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, appointments.status INTO v_existing, v_status
      FROM public.appointments
      WHERE idempotency_key = p_idempotency_key
      LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT v_existing, v_existing::text, v_status;
      RETURN;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_doctor_id::text || p_appointment_date::text || p_appointment_time::text, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE doctor_id = p_doctor_id
      AND appointment_date = p_appointment_date
      AND appointment_time = p_appointment_time
      AND status IN ('new','confirmed','completed','held','pending_verification','pending_payment','checked_in','in_progress')
  ) THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.appointments (
    doctor_id, branch_id, specialty_id, appointment_date, appointment_time,
    patient_name, patient_phone, patient_email, national_id, gender, reason,
    reminder_24h, reminder_2h, idempotency_key, patient_id, status
  ) VALUES (
    p_doctor_id, p_branch_id, p_specialty_id, p_appointment_date, p_appointment_time,
    p_patient_name, p_patient_phone, p_patient_email, p_national_id, p_gender, p_reason,
    p_reminder_24h, p_reminder_2h, p_idempotency_key, p_patient_id, p_initial_status
  )
  RETURNING id, appointments.status INTO v_id, v_status;

  IF p_hold_id IS NOT NULL THEN
    UPDATE public.slot_holds SET released_at = now() WHERE id = p_hold_id;
  END IF;

  RETURN QUERY SELECT v_id, v_id::text, v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(
  UUID, UUID, UUID, DATE, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  BOOLEAN, BOOLEAN, TEXT, UUID, UUID, public.appointment_status
) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_expired_slot_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.slot_holds
    SET released_at = now()
    WHERE released_at IS NULL AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_expired_slot_holds() TO anon, authenticated, service_role;
