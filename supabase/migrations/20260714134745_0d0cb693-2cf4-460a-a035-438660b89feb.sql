-- Ensure email lookup is fast when linking guest bookings.
CREATE INDEX IF NOT EXISTS appointments_patient_email_lower_idx
  ON public.appointments (LOWER(patient_email))
  WHERE patient_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_patient_phone_link_idx
  ON public.appointments (patient_phone)
  WHERE patient_id IS NULL;

-- Link any guest appointments (patient_id IS NULL) to the calling user's
-- patient record. Matches on verified email (auth.users.email) OR on the
-- profile's phone. Creates a patients row for the profile when none exists.
CREATE OR REPLACE FUNCTION public.link_guest_appointments()
RETURNS TABLE (patient_id uuid, linked_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _phone text;
  _name  text;
  _patient_id uuid;
  _count integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT LOWER(email) INTO _email FROM auth.users WHERE id = _uid;
  SELECT phone, full_name INTO _phone, _name FROM public.profiles WHERE id = _uid;

  -- 1) Existing patient linked to this profile
  SELECT id INTO _patient_id
  FROM public.patients
  WHERE profile_id = _uid
  LIMIT 1;

  -- 2) Otherwise try to claim an unlinked patient with matching email/phone
  IF _patient_id IS NULL AND (_email IS NOT NULL OR _phone IS NOT NULL) THEN
    UPDATE public.patients p
       SET profile_id = _uid,
           updated_at = now()
     WHERE p.profile_id IS NULL
       AND (
         (_email IS NOT NULL AND LOWER(p.email) = _email)
         OR (_phone IS NOT NULL AND p.phone = _phone)
       )
     RETURNING p.id INTO _patient_id;
  END IF;

  -- 3) Otherwise create a new patient row for this account
  IF _patient_id IS NULL THEN
    INSERT INTO public.patients (profile_id, full_name_ar, email, phone, is_active, created_by)
    VALUES (
      _uid,
      COALESCE(NULLIF(TRIM(_name), ''), 'مريض'),
      _email,
      _phone,
      true,
      _uid
    )
    RETURNING id INTO _patient_id;
  END IF;

  -- 4) Attach all unlinked appointments matching email OR phone
  WITH upd AS (
    UPDATE public.appointments a
       SET patient_id = _patient_id,
           updated_at = now()
     WHERE a.patient_id IS NULL
       AND (
         (_email IS NOT NULL AND LOWER(a.patient_email) = _email)
         OR (_phone IS NOT NULL AND a.patient_phone = _phone)
       )
     RETURNING 1
  )
  SELECT COUNT(*)::int INTO _count FROM upd;

  RETURN QUERY SELECT _patient_id, _count;
END;
$$;

REVOKE ALL ON FUNCTION public.link_guest_appointments() FROM public;
GRANT EXECUTE ON FUNCTION public.link_guest_appointments() TO authenticated;