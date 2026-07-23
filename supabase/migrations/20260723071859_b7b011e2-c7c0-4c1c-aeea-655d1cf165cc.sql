
-- =========================================================================
-- Booking Reference (BMC-YYYYMMDD-XXXX) + Atomic Confirmation Function
-- =========================================================================
-- Phase A of the "single-page /book" plan:
--   1. Add appointments.reference_number (nullable, unique) — human-readable.
--   2. Daily counter table with atomic upsert-and-return so the XXXX suffix
--      resets each Riyadh calendar day.
--   3. confirm_appointment_booking(p_data jsonb, p_idempotency_key text)
--      SECURITY DEFINER function that:
--        - Replays an existing row when idempotency_key matches (same result).
--        - Inserts the appointment inside one transaction.
--        - Generates and persists BMC-YYYYMMDD-XXXX atomically.
--        - Surfaces slot conflicts as SQLSTATE 23505 (kept 1:1 with existing
--          appointments_doctor_slot_active_uidx behavior).
--
-- The function is invoked from /api/public/book/create with the publishable
-- (anon) key, so it MUST be SECURITY DEFINER to bypass RLS on the counter
-- table. All access is through this function's signature — no other write
-- paths are granted on the counter.
-- =========================================================================

-- 1. reference_number column ------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reference_number text;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_reference_number_uidx
  ON public.appointments (reference_number)
  WHERE reference_number IS NOT NULL;

-- 2. Daily counter table ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_ref_daily_counter (
  day date PRIMARY KEY,
  seq integer NOT NULL DEFAULT 0
);

GRANT ALL ON public.appointment_ref_daily_counter TO service_role;
-- No anon/authenticated grants. The confirm function is SECURITY DEFINER
-- so callers never touch this table directly.

ALTER TABLE public.appointment_ref_daily_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages counter"
  ON public.appointment_ref_daily_counter
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Reference generator (returns next BMC-YYYYMMDD-XXXX) -------------------
CREATE OR REPLACE FUNCTION public._next_booking_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day  date;
  v_seq  integer;
BEGIN
  -- Pin the day boundary to Asia/Riyadh so a booking created just after
  -- local midnight rolls to the next day's counter, matching the customer's
  -- perception of "today".
  v_day := (now() AT TIME ZONE 'Asia/Riyadh')::date;

  INSERT INTO public.appointment_ref_daily_counter (day, seq)
    VALUES (v_day, 1)
    ON CONFLICT (day)
    DO UPDATE SET seq = appointment_ref_daily_counter.seq + 1
    RETURNING seq INTO v_seq;

  RETURN 'BMC-'
    || to_char(v_day, 'YYYYMMDD')
    || '-'
    || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public._next_booking_reference() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._next_booking_reference() TO service_role;

-- 4. Atomic confirm_appointment_booking(p_data, p_idempotency_key) ----------
CREATE OR REPLACE FUNCTION public.confirm_appointment_booking(
  p_data jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (id uuid, reference text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id  uuid;
  v_existing_ref text;
  v_new_id       uuid;
  v_ref          text;
BEGIN
  -- Idempotency replay: same key → same booking, same reference.
  IF p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 0 THEN
    SELECT a.id, a.reference_number
      INTO v_existing_id, v_existing_ref
      FROM public.appointments a
     WHERE a.idempotency_key = p_idempotency_key
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Backfill a reference if the row somehow lacks one (e.g. legacy row
      -- retried with a new key). Safe because reference_number is unique.
      IF v_existing_ref IS NULL THEN
        v_existing_ref := public._next_booking_reference();
        UPDATE public.appointments
           SET reference_number = v_existing_ref
         WHERE id = v_existing_id
           AND reference_number IS NULL;
      END IF;

      id := v_existing_id;
      reference := v_existing_ref;
      replayed := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Fresh booking. Any unique-constraint violation (slot clash on the
  -- partial UNIQUE INDEX, idempotency key race) surfaces as SQLSTATE 23505
  -- to the caller — identical to the previous direct INSERT path.
  v_ref := public._next_booking_reference();

  INSERT INTO public.appointments (
    patient_name,
    patient_phone,
    patient_email,
    national_id,
    gender,
    specialty_id,
    doctor_id,
    branch_id,
    appointment_date,
    appointment_time,
    reason,
    reminder_24h,
    reminder_2h,
    idempotency_key,
    reference_number,
    insurance_provider_id,
    insurance_policy_number,
    insurance_member_id,
    insurance_status,
    insurance_coverage_percent,
    estimated_cost_sar,
    patient_share_sar,
    booked_for_dependent_id,
    patient_id
  )
  VALUES (
    p_data->>'patient_name',
    p_data->>'patient_phone',
    NULLIF(lower(trim(coalesce(p_data->>'patient_email',''))), ''),
    NULLIF(p_data->>'national_id',''),
    NULLIF(p_data->>'gender','')::text,
    NULLIF(p_data->>'specialty_id','')::uuid,
    NULLIF(p_data->>'doctor_id','')::uuid,
    NULLIF(p_data->>'branch_id','')::uuid,
    (p_data->>'appointment_date')::date,
    (p_data->>'appointment_time')::time,
    NULLIF(p_data->>'reason',''),
    COALESCE((p_data->>'reminder_24h')::boolean, true),
    COALESCE((p_data->>'reminder_2h')::boolean, true),
    NULLIF(p_data->>'idempotency_key',''),
    v_ref,
    NULLIF(p_data->>'insurance_provider_id','')::uuid,
    NULLIF(p_data->>'insurance_policy_number',''),
    NULLIF(p_data->>'insurance_member_id',''),
    COALESCE(NULLIF(p_data->>'insurance_status',''), 'none'),
    NULLIF(p_data->>'insurance_coverage_percent','')::integer,
    NULLIF(p_data->>'estimated_cost_sar','')::numeric,
    NULLIF(p_data->>'patient_share_sar','')::numeric,
    NULLIF(p_data->>'booked_for_dependent_id','')::uuid,
    NULLIF(p_data->>'patient_id','')::uuid
  )
  RETURNING appointments.id INTO v_new_id;

  id := v_new_id;
  reference := v_ref;
  replayed := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_appointment_booking(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_appointment_booking(jsonb, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.confirm_appointment_booking(jsonb, text) IS
  'Atomic booking confirmation. Inserts one appointment inside a single '
  'transaction, generates BMC-YYYYMMDD-XXXX reference, and replays the '
  'existing row when idempotency_key matches. Slot conflicts propagate as '
  'SQLSTATE 23505 from the appointments_doctor_slot_active_uidx index.';
