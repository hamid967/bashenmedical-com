-- Family Members verification + per-dependent access scopes + booking guard.

ALTER TABLE public.dependents
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS access_scopes jsonb NOT NULL DEFAULT
    '{"booking":true,"reports":false,"prescriptions":false,"billing":false}'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.dependents
    ADD CONSTRAINT dependents_verification_status_check
    CHECK (verification_status IN ('pending','verified','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.dependents
    ADD CONSTRAINT dependents_verification_method_check
    CHECK (verification_method IS NULL OR verification_method IN ('nafath','national_id','document','staff','auto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.dependents
    ADD CONSTRAINT dependents_verified_by_fk
    FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: previously-verified rows keep their status.
UPDATE public.dependents
  SET verification_status = 'verified',
      verified_at = COALESCE(verified_at, updated_at),
      verification_method = COALESCE(verification_method, 'staff')
  WHERE verified = true AND verification_status = 'pending';

-- Link the appointment to the dependent it was booked for (audit + safety).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booked_for_dependent_id uuid;

DO $$ BEGIN
  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_booked_for_dependent_fk
    FOREIGN KEY (booked_for_dependent_id) REFERENCES public.dependents(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_booked_for_dependent
  ON public.appointments(booked_for_dependent_id)
  WHERE booked_for_dependent_id IS NOT NULL;

-- Central guard: can this guardian book for this dependent?
CREATE OR REPLACE FUNCTION public.can_book_for_dependent(_guardian uuid, _dependent uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.dependents%ROWTYPE;
BEGIN
  IF _dependent IS NULL THEN RETURN true; END IF;
  IF _guardian IS NULL THEN RETURN false; END IF;
  SELECT * INTO r FROM public.dependents WHERE id = _dependent;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.guardian_user_id <> _guardian THEN RETURN false; END IF;
  IF r.verification_status <> 'verified' THEN RETURN false; END IF;
  IF COALESCE((r.access_scopes->>'booking')::boolean, false) IS DISTINCT FROM true THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_book_for_dependent(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_book_for_dependent(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_book_for_dependent(uuid, uuid) TO authenticated, service_role;

-- Staff verification RPC (admin/reception only).
CREATE OR REPLACE FUNCTION public.staff_set_dependent_verification(
  _dependent uuid,
  _status text,
  _method text,
  _notes text
) RETURNS public.dependents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  out_row public.dependents%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'reception')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status NOT IN ('pending','verified','rejected') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  UPDATE public.dependents
     SET verification_status = _status,
         verification_method = COALESCE(_method,'staff'),
         verification_notes  = _notes,
         verified            = (_status = 'verified'),
         verified_at         = CASE WHEN _status = 'verified' THEN now() ELSE verified_at END,
         verified_by         = CASE WHEN _status = 'verified' THEN auth.uid() ELSE verified_by END
   WHERE id = _dependent
   RETURNING * INTO out_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN out_row;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_set_dependent_verification(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_set_dependent_verification(uuid,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_set_dependent_verification(uuid,text,text,text) TO authenticated, service_role;
