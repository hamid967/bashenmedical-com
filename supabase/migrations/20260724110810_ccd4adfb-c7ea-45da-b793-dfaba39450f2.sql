-- Phase 2 — Batch B

-- 2.6 Extend enum appointment_status
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'slot_held';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'pending_insurance';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'pending_confirmation';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'arrived';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'waiting';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'called';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'in_consultation';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'rescheduled';

-- 2.7 State-machine transition guard
CREATE OR REPLACE FUNCTION public.enforce_appointment_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  allowed boolean := false;
  prev text := OLD.status::text;
  next text := NEW.status::text;
BEGIN
  IF prev = next THEN RETURN NEW; END IF;

  -- Terminal states cannot transition further (except via admin override handled by RLS)
  IF prev IN ('completed','cancelled','no_show') THEN
    RAISE EXCEPTION 'appointment_status_terminal: cannot transition from % to %', prev, next
      USING ERRCODE = 'check_violation';
  END IF;

  allowed := CASE prev
    WHEN 'new'                   THEN next IN ('slot_held','pending_verification','pending_insurance','pending_payment','pending_confirmation','confirmed','cancelled','rescheduled')
    WHEN 'slot_held'             THEN next IN ('new','pending_verification','pending_insurance','pending_payment','pending_confirmation','confirmed','cancelled')
    WHEN 'held'                  THEN next IN ('new','pending_verification','pending_insurance','pending_payment','pending_confirmation','confirmed','cancelled')
    WHEN 'pending_verification'  THEN next IN ('pending_insurance','pending_payment','pending_confirmation','confirmed','cancelled')
    WHEN 'pending_insurance'     THEN next IN ('pending_payment','pending_confirmation','confirmed','cancelled')
    WHEN 'pending_payment'       THEN next IN ('pending_confirmation','confirmed','cancelled')
    WHEN 'pending_confirmation'  THEN next IN ('confirmed','cancelled')
    WHEN 'confirmed'             THEN next IN ('arrived','checked_in','no_show','cancelled','rescheduled')
    WHEN 'rescheduled'           THEN next IN ('new','confirmed','cancelled')
    WHEN 'arrived'               THEN next IN ('checked_in','waiting','cancelled','no_show')
    WHEN 'checked_in'            THEN next IN ('waiting','called','in_consultation','in_progress','cancelled','no_show')
    WHEN 'waiting'               THEN next IN ('called','in_consultation','in_progress','no_show','cancelled')
    WHEN 'called'                THEN next IN ('in_consultation','in_progress','waiting','no_show','cancelled')
    WHEN 'in_consultation'       THEN next IN ('completed','cancelled')
    WHEN 'in_progress'           THEN next IN ('in_consultation','completed','cancelled')
    ELSE false
  END;

  IF NOT allowed AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) THEN
    RAISE EXCEPTION 'appointment_status_transition_forbidden: % -> %', prev, next
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_appt_status_transition ON public.appointments;
CREATE TRIGGER trg_appt_status_transition
  BEFORE UPDATE OF status ON public.appointments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enforce_appointment_status_transition();

-- 2.8 Reference number generator (BMC-APT-YYYYMMDD-####)
CREATE OR REPLACE FUNCTION public.generate_appointment_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  d date := COALESCE(NEW.appointment_date, CURRENT_DATE);
  key text := to_char(d, 'YYYYMMDD');
  seq int;
BEGIN
  IF NEW.reference_number IS NOT NULL AND length(trim(NEW.reference_number)) > 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.appointment_ref_daily_counter(day_key, last_seq)
  VALUES (key, 1)
  ON CONFLICT (day_key) DO UPDATE SET last_seq = public.appointment_ref_daily_counter.last_seq + 1
  RETURNING last_seq INTO seq;

  NEW.reference_number := 'BMC-APT-' || key || '-' || lpad(seq::text, 4, '0');
  RETURN NEW;
END;
$fn$;

-- Verify counter table shape and adapt
DO $$
DECLARE has_daykey boolean; has_lastseq boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointment_ref_daily_counter' AND column_name='day_key') INTO has_daykey;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointment_ref_daily_counter' AND column_name='last_seq') INTO has_lastseq;
  IF NOT has_daykey OR NOT has_lastseq THEN
    -- Recreate schema safely
    DROP TABLE IF EXISTS public.appointment_ref_daily_counter;
    CREATE TABLE public.appointment_ref_daily_counter (
      day_key text PRIMARY KEY,
      last_seq int NOT NULL DEFAULT 0
    );
    GRANT SELECT, INSERT, UPDATE ON public.appointment_ref_daily_counter TO authenticated;
    GRANT ALL ON public.appointment_ref_daily_counter TO service_role;
    ALTER TABLE public.appointment_ref_daily_counter ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "counter_admin_only" ON public.appointment_ref_daily_counter
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
      WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_appt_reference_number ON public.appointments;
CREATE TRIGGER trg_appt_reference_number
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_appointment_reference();

-- Backfill NULL / empty reference numbers
DO $$
DECLARE r record; key text; seq int;
BEGIN
  FOR r IN
    SELECT id, appointment_date FROM public.appointments
    WHERE reference_number IS NULL OR length(trim(reference_number)) = 0
    ORDER BY appointment_date NULLS LAST, created_at
  LOOP
    key := to_char(COALESCE(r.appointment_date, CURRENT_DATE), 'YYYYMMDD');
    INSERT INTO public.appointment_ref_daily_counter(day_key, last_seq)
    VALUES (key, 1)
    ON CONFLICT (day_key) DO UPDATE SET last_seq = public.appointment_ref_daily_counter.last_seq + 1
    RETURNING last_seq INTO seq;
    UPDATE public.appointments
      SET reference_number = 'BMC-APT-' || key || '-' || lpad(seq::text, 4, '0')
      WHERE id = r.id;
  END LOOP;
END $$;