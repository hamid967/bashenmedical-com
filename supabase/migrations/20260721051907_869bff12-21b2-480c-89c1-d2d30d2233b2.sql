DROP FUNCTION IF EXISTS public.lookup_appointment(text, text);

CREATE OR REPLACE FUNCTION public.lookup_appointment(_ref text, _phone text)
RETURNS TABLE(id uuid, patient_name text, patient_phone text, appointment_date date, appointment_time time without time zone, status appointment_status, reason text, notes text, specialty_id uuid, doctor_id uuid, specialty_name_ar text, specialty_name_en text, doctor_name_ar text, doctor_name_en text, created_at timestamp with time zone, reminder_24h boolean, reminder_2h boolean, cancel_reason text, cancelled_at timestamp with time zone, no_show_risk smallint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _ref IS NULL OR length(regexp_replace(_ref,'[^0-9a-fA-F]','','g')) < 8 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT a.id, a.patient_name, a.patient_phone, a.appointment_date, a.appointment_time,
         a.status, a.reason, a.notes, a.specialty_id, a.doctor_id,
         s.name_ar, s.name_en, d.name_ar, d.name_en, a.created_at,
         a.reminder_24h, a.reminder_2h,
         (SELECT au.reason FROM public.appointment_audit au
            WHERE au.appointment_id = a.id AND au.new_status = 'cancelled'
            ORDER BY au.changed_at DESC LIMIT 1) AS cancel_reason,
         (SELECT au.changed_at FROM public.appointment_audit au
            WHERE au.appointment_id = a.id AND au.new_status = 'cancelled'
            ORDER BY au.changed_at DESC LIMIT 1) AS cancelled_at,
         a.no_show_risk
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  WHERE substring(a.id::text, 1, 8) = lower(substring(regexp_replace(_ref,'[^0-9a-fA-F]','','g'), 1, 8))
    AND regexp_replace(a.patient_phone,'[^0-9]','','g') = regexp_replace(_phone,'[^0-9]','','g')
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.lookup_appointment(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_appointment(text, text) TO anon, authenticated, service_role;