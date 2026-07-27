-- Phase 5 — Appointment State Machine unified entry point

-- 1) Enhance history logger to capture reason/metadata set by the RPC via GUC
CREATE OR REPLACE FUNCTION public.log_appointment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := NULLIF(current_setting('bmc.status_reason', true), '');
  v_meta   jsonb := COALESCE(NULLIF(current_setting('bmc.status_metadata', true), '')::jsonb, '{}'::jsonb);
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.appointment_status_history (appointment_id, from_status, to_status, changed_by, reason, metadata)
    VALUES (NEW.id, NULL, NEW.status, auth.uid(), v_reason, v_meta);
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.appointment_status_history (appointment_id, from_status, to_status, changed_by, reason, metadata)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid(), v_reason, v_meta);
  END IF;
  -- Reset per-statement GUCs so unrelated updates in the same session don't reuse them
  PERFORM set_config('bmc.status_reason', '', true);
  PERFORM set_config('bmc.status_metadata', '', true);
  RETURN NEW;
END;
$$;

-- 2) Unified transition RPC (single canonical entry point for app writes)
CREATE OR REPLACE FUNCTION public.transition_appointment_status(
  _appointment_id uuid,
  _to_status      public.appointment_status,
  _reason         text  DEFAULT NULL,
  _metadata       jsonb DEFAULT '{}'::jsonb
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.appointments;
BEGIN
  IF _appointment_id IS NULL OR _to_status IS NULL THEN
    RAISE EXCEPTION 'appointment_id and to_status are required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Enforce reason on high-impact terminal transitions
  IF _to_status::text IN ('cancelled','no_show') THEN
    IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
      RAISE EXCEPTION 'reason_required_for_%: provide a reason (min 3 chars)', _to_status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Publish reason/metadata to the history trigger for this statement only
  PERFORM set_config('bmc.status_reason', COALESCE(_reason, ''), true);
  PERFORM set_config('bmc.status_metadata', COALESCE(_metadata, '{}'::jsonb)::text, true);

  UPDATE public.appointments
     SET status = _to_status,
         cancelled_at = CASE WHEN _to_status::text = 'cancelled' THEN now() ELSE cancelled_at END,
         updated_at   = now()
   WHERE id = _appointment_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found: %', _appointment_id USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_appointment_status(uuid, public.appointment_status, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_appointment_status(uuid, public.appointment_status, text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.transition_appointment_status(uuid, public.appointment_status, text, jsonb) IS
  'Phase 5 — Unified entry point. Enforces reason on cancelled/no_show, records reason/metadata in appointment_status_history via GUC, and delegates transition legality to trg_appt_status_transition.';

-- 3) Atomic reschedule (status → rescheduled with new date/time + slot uniqueness enforced by the existing partial index)
CREATE OR REPLACE FUNCTION public.reschedule_appointment_atomic(
  _appointment_id uuid,
  _new_date       date,
  _new_time       time,
  _reason         text
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.appointments;
BEGIN
  IF _new_date IS NULL OR _new_time IS NULL THEN
    RAISE EXCEPTION 'new_date and new_time are required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required_for_reschedule: provide a reason (min 3 chars)'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('bmc.status_reason', _reason, true);
  PERFORM set_config(
    'bmc.status_metadata',
    jsonb_build_object('new_date', _new_date, 'new_time', _new_time)::text,
    true
  );

  UPDATE public.appointments
     SET appointment_date = _new_date,
         appointment_time = _new_time,
         status = 'rescheduled'::public.appointment_status,
         updated_at = now()
   WHERE id = _appointment_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found: %', _appointment_id USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_appointment_atomic(uuid, date, time, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_atomic(uuid, date, time, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.reschedule_appointment_atomic(uuid, date, time, text) IS
  'Phase 5 — Atomic reschedule. Updates date/time and moves status to rescheduled; slot uniqueness comes from the existing partial unique index.';