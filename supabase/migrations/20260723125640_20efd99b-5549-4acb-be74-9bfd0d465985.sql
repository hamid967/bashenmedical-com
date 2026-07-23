
CREATE OR REPLACE FUNCTION public.verify_appointment_by_reference(
  _reference text,
  _phone_last4 text
)
RETURNS TABLE (
  reference text,
  appointment_date date,
  appointment_time time,
  status text,
  doctor_name_ar text,
  doctor_name_en text,
  branch_name_ar text,
  branch_name_en text,
  specialty_name_ar text,
  specialty_name_en text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_last4 text;
BEGIN
  -- Normalize + validate. Silently return zero rows on malformed input so we
  -- never leak whether the reference or the phone digits were wrong.
  v_ref := upper(coalesce(trim(_reference), ''));
  v_last4 := coalesce(trim(_phone_last4), '');

  IF v_ref !~ '^BMC-\d{8}-[0-9A-Z]{4}$' THEN RETURN; END IF;
  IF v_last4 !~ '^\d{4}$' THEN RETURN; END IF;

  RETURN QUERY
    SELECT
      a.reference_number,
      a.appointment_date,
      a.appointment_time,
      a.status::text,
      d.name_ar,
      d.name_en,
      b.name_ar,
      b.name_en,
      s.name_ar,
      s.name_en
    FROM public.appointments a
    LEFT JOIN public.doctors    d ON d.id = a.doctor_id
    LEFT JOIN public.branches   b ON b.id = a.branch_id
    LEFT JOIN public.specialties s ON s.id = a.specialty_id
    WHERE a.reference_number = v_ref
      AND right(regexp_replace(a.patient_phone, '\D', '', 'g'), 4) = v_last4
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_appointment_by_reference(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_appointment_by_reference(text, text) TO anon, authenticated, service_role;
