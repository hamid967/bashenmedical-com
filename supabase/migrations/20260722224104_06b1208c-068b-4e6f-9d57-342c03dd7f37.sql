
-- Phase 3.1 — Concurrency hardening: enforce slot uniqueness on ALL update paths
-- (reschedule via portal, admin edits, AI action tool, waitlist offer accept).
-- book_slot already enforces this on INSERT via _assert_slot_free.
-- This trigger extends the guarantee to UPDATE and re-activation from cancelled/no_show.

CREATE OR REPLACE FUNCTION public._guard_appt_slot_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active_new boolean;
  _active_old boolean;
  _slot_changed boolean;
BEGIN
  -- Only guard rows that end up active
  _active_new := NEW.status IN ('new','confirmed','completed');
  _active_old := OLD.status IN ('new','confirmed','completed');

  IF NOT _active_new THEN
    RETURN NEW;
  END IF;

  _slot_changed :=
    NEW.doctor_id        IS DISTINCT FROM OLD.doctor_id        OR
    NEW.appointment_date IS DISTINCT FROM OLD.appointment_date OR
    NEW.appointment_time IS DISTINCT FROM OLD.appointment_time;

  -- Guard when: slot moved, OR reactivating from a terminal state
  IF _slot_changed OR NOT _active_old THEN
    PERFORM public._assert_slot_free(
      NEW.doctor_id,
      NEW.appointment_date,
      NEW.appointment_time,
      NEW.id  -- exclude self so re-saving without moving is a no-op
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_appt_slot_on_update ON public.appointments;
CREATE TRIGGER trg_guard_appt_slot_on_update
  BEFORE UPDATE OF doctor_id, appointment_date, appointment_time, status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public._guard_appt_slot_on_update();

REVOKE ALL ON FUNCTION public._guard_appt_slot_on_update() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._guard_appt_slot_on_update() IS
  'Phase 3.1: guards double-booking on any UPDATE that moves an appointment '
  'to a new (doctor, date, time) or reactivates it from cancelled/no_show. '
  'Reuses _assert_slot_free (advisory xact lock + active-row check).';
