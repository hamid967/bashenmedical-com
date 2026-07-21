-- 1. Column
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS no_show_risk smallint;

COMMENT ON COLUMN public.appointments.no_show_risk IS
  'Predicted no-show probability 0-100. Populated by trg_appointments_no_show_risk.';

CREATE INDEX IF NOT EXISTS idx_appointments_no_show_risk
  ON public.appointments (appointment_date, no_show_risk DESC)
  WHERE status IN ('new','confirmed','pending_verification');

-- 2. Scoring function (heuristic v1, deterministic, no external calls)
CREATE OR REPLACE FUNCTION public.calculate_no_show_risk(_appt public.appointments)
RETURNS smallint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  score numeric := 15;              -- base risk
  past_total int := 0;
  past_no_show int := 0;
  lead_days numeric;
  hr int;
  dow int;
BEGIN
  -- Patient history (by patient_id or phone)
  IF _appt.patient_id IS NOT NULL OR _appt.patient_phone IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE status IN ('completed','no_show','cancelled')),
      COUNT(*) FILTER (WHERE status = 'no_show')
    INTO past_total, past_no_show
    FROM public.appointments
    WHERE id <> _appt.id
      AND (
        (_appt.patient_id IS NOT NULL AND patient_id = _appt.patient_id)
        OR (_appt.patient_phone IS NOT NULL AND patient_phone = _appt.patient_phone)
      );
  END IF;

  IF past_total >= 2 THEN
    score := score + LEAST(45, 45 * (past_no_show::numeric / past_total));
  ELSE
    score := score + 10;             -- first-time / unknown pattern
  END IF;

  -- Lead time
  lead_days := EXTRACT(EPOCH FROM (_appt.appointment_date::timestamp - now())) / 86400.0;
  IF lead_days > 14 THEN
    score := score + 10;
  ELSIF lead_days < 1 THEN
    score := score - 5;
  END IF;

  -- Time-of-day: very early (<9) or late-afternoon (>=16) higher risk
  hr := EXTRACT(HOUR FROM _appt.appointment_time);
  IF hr < 9 OR hr >= 16 THEN
    score := score + 5;
  END IF;

  -- Day-of-week: Thursday (4) & Friday (5) end-of-week higher no-show
  dow := EXTRACT(ISODOW FROM _appt.appointment_date);
  IF dow IN (4,5) THEN
    score := score + 5;
  END IF;

  -- Protective factors
  IF _appt.whatsapp_opt_in THEN score := score - 8; END IF;
  IF _appt.insurance_status = 'verified' THEN score := score - 5; END IF;
  IF _appt.status = 'confirmed' THEN score := score - 10; END IF;
  IF _appt.status = 'checked_in' THEN score := 0; END IF;

  RETURN GREATEST(0, LEAST(100, ROUND(score)))::smallint;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_no_show_risk(public.appointments) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_no_show_risk(public.appointments) TO authenticated, service_role;

-- 3. Trigger to auto-populate
CREATE OR REPLACE FUNCTION public.trg_set_no_show_risk()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.no_show_risk := public.calculate_no_show_risk(NEW);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_set_no_show_risk() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_appointments_no_show_risk ON public.appointments;
CREATE TRIGGER trg_appointments_no_show_risk
  BEFORE INSERT OR UPDATE OF appointment_date, appointment_time, status,
    whatsapp_opt_in, insurance_status, patient_id, patient_phone
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_no_show_risk();

-- 4. Overbooking suggestion function
CREATE OR REPLACE FUNCTION public.suggest_overbooking(_from date DEFAULT CURRENT_DATE, _to date DEFAULT (CURRENT_DATE + INTERVAL '14 days'))
RETURNS TABLE (
  doctor_id uuid,
  branch_id uuid,
  appointment_date date,
  appointment_time time,
  booked_count int,
  avg_risk numeric,
  expected_shows numeric,
  suggested_overbook int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.doctor_id,
    a.branch_id,
    a.appointment_date,
    a.appointment_time,
    COUNT(*)::int AS booked_count,
    ROUND(AVG(COALESCE(a.no_show_risk, 25))::numeric, 1) AS avg_risk,
    ROUND(SUM(1 - COALESCE(a.no_show_risk, 25) / 100.0)::numeric, 2) AS expected_shows,
    GREATEST(0, CEIL(COUNT(*) - SUM(1 - COALESCE(a.no_show_risk, 25) / 100.0)))::int AS suggested_overbook
  FROM public.appointments a
  WHERE a.status IN ('new','confirmed','pending_verification')
    AND a.appointment_date BETWEEN _from AND _to
  GROUP BY a.doctor_id, a.branch_id, a.appointment_date, a.appointment_time
  HAVING SUM(1 - COALESCE(a.no_show_risk, 25) / 100.0) < COUNT(*) - 0.5
  ORDER BY a.appointment_date, a.appointment_time;
$$;

REVOKE EXECUTE ON FUNCTION public.suggest_overbooking(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_overbooking(date, date) TO authenticated, service_role;

-- 5. Backfill existing upcoming appointments
UPDATE public.appointments
SET no_show_risk = public.calculate_no_show_risk(appointments)
WHERE appointment_date >= CURRENT_DATE - INTERVAL '7 days'
  AND no_show_risk IS NULL;