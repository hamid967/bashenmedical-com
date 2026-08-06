-- Batch fix: public list hygiene, BMC refs, revoke anon confirm
-- Audit: docs/audit/problems-recommendations-2026-08-06.md (C3, C4, H1, H6)

BEGIN;

-- 1) Hide demo / E2E from public doctor list
CREATE OR REPLACE FUNCTION public.list_public_doctors(
  _specialty_slug text DEFAULT NULL,
  _branch_id uuid DEFAULT NULL,
  _gender text DEFAULT NULL,
  _language text DEFAULT NULL,
  _q text DEFAULT NULL,
  _limit int DEFAULT 60,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  slug text,
  name_ar text,
  name_en text,
  title_ar text,
  title_en text,
  bio_ar text,
  bio_en text,
  photo_url text,
  gender text,
  years_experience int,
  languages text[],
  booking_enabled boolean,
  branch_id uuid,
  branch_name_ar text,
  branch_name_en text,
  specialty_id uuid,
  specialty_slug text,
  specialty_name_ar text,
  specialty_name_en text,
  ratings_count bigint,
  avg_rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.slug, d.name_ar, d.name_en, d.title_ar, d.title_en, d.bio_ar, d.bio_en,
         d.photo_url, d.gender, d.years_experience, d.languages, d.booking_enabled,
         d.branch_id, b.name_ar, b.name_en,
         d.specialty_id, s.slug, s.name_ar, s.name_en,
         COALESCE(r.cnt, 0)::bigint,
         COALESCE(ROUND(r.avg_rating, 2), 0)::numeric
  FROM public.doctors d
  LEFT JOIN public.specialties s ON s.id = d.specialty_id
  LEFT JOIN public.branches b ON b.id = d.branch_id
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS cnt, AVG(rating)::numeric AS avg_rating
    FROM public.patient_ratings pr WHERE pr.doctor_id = d.id
  ) r ON true
  WHERE d.is_active = true
    AND COALESCE(d.is_demo, false) = false
    AND COALESCE(d.slug, '') !~* '^(e2e-|demo-)'
    AND d.name_ar !~* '(e2e|demo|اختبار)'
    AND COALESCE(d.name_en, '') !~* '(e2e|demo|^doctor [ab]\b)'
    AND COALESCE(s.slug, '') !~* '^(e2e-|demo-)'
    AND (_specialty_slug IS NULL OR s.slug = _specialty_slug)
    AND (_branch_id IS NULL OR d.branch_id = _branch_id)
    AND (_gender IS NULL OR d.gender = _gender)
    AND (_language IS NULL OR _language = ANY(d.languages))
    AND (
      _q IS NULL OR _q = ''
      OR d.name_ar ILIKE '%'||_q||'%'
      OR d.name_en ILIKE '%'||_q||'%'
    )
  ORDER BY d.sort_order, d.name_ar
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.list_public_doctors(text, uuid, text, text, text, int, int)
  TO anon, authenticated;

-- 2) Hide E2E / demo branches from public list
CREATE OR REPLACE FUNCTION public.list_public_branches()
RETURNS TABLE (
  id uuid, slug text, name_ar text, name_en text,
  city_ar text, city_en text, phone text, emergency_phone text,
  address_ar text, address_en text, lat double precision, lng double precision,
  hero_image_url text, description_ar text, description_en text,
  working_hours jsonb, map_embed_url text, sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, slug, name_ar, name_en, city_ar, city_en, phone, emergency_phone,
         address_ar, address_en, lat, lng, hero_image_url, description_ar, description_en,
         working_hours, map_embed_url, sort_order
  FROM public.branches
  WHERE is_active = true
    AND COALESCE(slug, '') !~* '^(e2e-|demo-)'
    AND name_ar !~* '(e2e|اختبار|demo)'
    AND COALESCE(name_en, '') !~* '(e2e|demo|test)'
  ORDER BY sort_order, name_ar;
$$;

GRANT EXECUTE ON FUNCTION public.list_public_branches() TO anon, authenticated;

-- 3) Soft-hide test rows (idempotent)
UPDATE public.doctors
SET is_active = false
WHERE is_active = true
  AND (
    COALESCE(is_demo, false) = true
    OR COALESCE(slug, '') ~* '^(e2e-|demo-)'
    OR name_ar ~* '(e2e|demo|اختبار)'
    OR COALESCE(name_en, '') ~* '(e2e|demo|^Doctor [AB]\b)'
  );

UPDATE public.branches
SET is_active = false
WHERE is_active = true
  AND (
    COALESCE(slug, '') ~* '^(e2e-|demo-)'
    OR name_ar ~* '(e2e|اختبار|demo)'
    OR COALESCE(name_en, '') ~* '(e2e|demo|test)'
  );

UPDATE public.specialties
SET is_active = false
WHERE is_active = true
  AND COALESCE(slug, '') ~* '^(e2e-|demo-)';

-- 4) Revoke anon execute on confirm — must go through authenticated/service API
REVOKE EXECUTE ON FUNCTION public.confirm_appointment_booking(jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_appointment_booking(jsonb, text)
  TO authenticated, service_role;

-- 5) track_appointment: support BMC + BAA
CREATE OR REPLACE FUNCTION public.track_appointment(_ref text, _phone_last4 text)
RETURNS TABLE(
  reference text,
  status text,
  appointment_date date,
  appointment_time time without time zone,
  patient_name text,
  doctor_name_ar text,
  specialty_name_ar text,
  created_at timestamp with time zone,
  cancelled_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hex_prefix text;
  ref_norm text := upper(trim(coalesce(_ref, '')));
BEGIN
  IF _ref IS NULL OR _phone_last4 IS NULL THEN
    RETURN;
  END IF;
  IF _phone_last4 !~ '^[0-9]{4}$' THEN
    RETURN;
  END IF;

  IF ref_norm ~ '^BMC-[0-9]{8}-[0-9]{4}$' THEN
    RETURN QUERY
    SELECT
      coalesce(a.reference_number, ref_norm)::text AS reference,
      a.status::text,
      a.appointment_date,
      a.appointment_time,
      a.patient_name,
      d.name_ar,
      s.name_ar,
      a.created_at,
      CASE WHEN a.status::text = 'cancelled' THEN a.updated_at ELSE NULL END::timestamptz AS cancelled_at
    FROM public.appointments a
    LEFT JOIN public.doctors d ON d.id = a.doctor_id
    LEFT JOIN public.specialties s ON s.id = a.specialty_id
    WHERE a.reference_number = ref_norm
      AND right(regexp_replace(a.patient_phone, '[^0-9]', '', 'g'), 4) = _phone_last4
    ORDER BY a.created_at DESC
    LIMIT 1;
    RETURN;
  END IF;

  IF ref_norm !~ '^BAA-[0-9A-F]{8}$' THEN
    RETURN;
  END IF;

  hex_prefix := lower(substring(ref_norm FROM 5 FOR 8));

  RETURN QUERY
  SELECT
    ('BAA-' || upper(substring(replace(a.id::text, '-', '') FROM 1 FOR 8)))::text AS reference,
    a.status::text,
    a.appointment_date,
    a.appointment_time,
    a.patient_name,
    d.name_ar,
    s.name_ar,
    a.created_at,
    CASE WHEN a.status::text = 'cancelled' THEN a.updated_at ELSE NULL END::timestamptz AS cancelled_at
  FROM public.appointments a
  LEFT JOIN public.doctors d ON d.id = a.doctor_id
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  WHERE replace(a.id::text, '-', '') LIKE (hex_prefix || '%')
    AND right(regexp_replace(a.patient_phone, '[^0-9]', '', 'g'), 4) = _phone_last4
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$function$;

-- 6) cancel_appointment_by_ref: BMC + legacy hex
CREATE OR REPLACE FUNCTION public.cancel_appointment_by_ref(
  _ref text,
  _phone text,
  _reason text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _reason_val text := public.normalize_reason(_reason);
  ref_norm text := upper(trim(coalesce(_ref, '')));
  phone_norm text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
BEGIN
  IF phone_norm IS NULL OR length(phone_norm) < 8 THEN
    RETURN false;
  END IF;

  IF ref_norm ~ '^BMC-[0-9]{8}-[0-9]{4}$' THEN
    SELECT a.id INTO _id
    FROM public.appointments a
    WHERE a.reference_number = ref_norm
      AND regexp_replace(a.patient_phone, '\D', '', 'g') = phone_norm
      AND a.status IN ('new', 'confirmed')
    LIMIT 1;
  ELSE
    IF length(regexp_replace(ref_norm, '[^0-9a-fA-F]', '', 'g')) < 8 THEN
      RETURN false;
    END IF;
    SELECT a.id INTO _id
    FROM public.appointments a
    WHERE lower(replace(a.id::text, '-', '')) LIKE lower(regexp_replace(ref_norm, '^BAA-', '', 'i')) || '%'
      AND regexp_replace(a.patient_phone, '\D', '', 'g') = phone_norm
      AND a.status IN ('new', 'confirmed')
    LIMIT 1;
  END IF;

  IF _id IS NULL THEN
    RETURN false;
  END IF;

  IF _reason_val IS NULL OR length(_reason_val) = 0 THEN
    _reason_val := 'إلغاء من المراجع';
  END IF;

  PERFORM set_config('app.change_reason', _reason_val, true);
  UPDATE public.appointments SET status = 'cancelled' WHERE id = _id;
  RETURN true;
END
$function$;

-- 7) reschedule_appointment_by_ref: BMC + legacy
CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_ref(
  _ref text,
  _phone text,
  _new_date date,
  _new_time time without time zone,
  _reason text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _doctor uuid;
  _reason_val text := public.normalize_reason(_reason);
  ref_norm text := upper(trim(coalesce(_ref, '')));
  phone_norm text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
BEGIN
  IF phone_norm IS NULL OR length(phone_norm) < 8 THEN
    RETURN false;
  END IF;

  IF ref_norm ~ '^BMC-[0-9]{8}-[0-9]{4}$' THEN
    SELECT a.id, a.doctor_id INTO _id, _doctor
    FROM public.appointments a
    WHERE a.reference_number = ref_norm
      AND regexp_replace(a.patient_phone, '\D', '', 'g') = phone_norm
      AND a.status IN ('new', 'confirmed')
    LIMIT 1;
  ELSE
    IF length(regexp_replace(ref_norm, '[^0-9a-fA-F]', '', 'g')) < 8 THEN
      RETURN false;
    END IF;
    SELECT a.id, a.doctor_id INTO _id, _doctor
    FROM public.appointments a
    WHERE lower(replace(a.id::text, '-', '')) LIKE lower(regexp_replace(ref_norm, '^BAA-', '', 'i')) || '%'
      AND regexp_replace(a.patient_phone, '\D', '', 'g') = phone_norm
      AND a.status IN ('new', 'confirmed')
    LIMIT 1;
  END IF;

  IF _id IS NULL THEN
    RETURN false;
  END IF;

  IF _reason_val IS NULL OR length(_reason_val) = 0 THEN
    _reason_val := 'إعادة جدولة من المراجع';
  END IF;

  PERFORM set_config('app.change_reason', _reason_val, true);
  UPDATE public.appointments
  SET appointment_date = _new_date,
      appointment_time = _new_time
  WHERE id = _id;
  RETURN true;
END
$function$;

-- 8) get_order_by_ref appointment branch: BMC + hex
CREATE OR REPLACE FUNCTION public.get_order_by_ref(_ref text, _phone text, _kind text)
RETURNS TABLE(
  kind text,
  id uuid,
  reference text,
  title text,
  status text,
  created_at timestamptz,
  scheduled_at timestamptz,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r text := lower(coalesce(_ref,''));
  _p text := regexp_replace(coalesce(_phone,''),'\D','','g');
  ref_norm text := upper(trim(coalesce(_ref,'')));
BEGIN
  IF length(_p) < 8 THEN
    RETURN;
  END IF;

  IF _kind = 'pharmacy' THEN
    IF length(regexp_replace(_r,'[^0-9a-f]','','g')) < 8 THEN RETURN; END IF;
    RETURN QUERY
    SELECT 'pharmacy'::text, mo.id,
           substring(replace(mo.id::text,'-','') for 8),
           'طلب صيدلية',
           mo.status::text,
           mo.created_at,
           NULL::timestamptz,
           jsonb_build_object(
             'delivery_type', mo.delivery_type,
             'address', mo.address,
             'district', mo.district,
             'notes', mo.notes
           )
    FROM public.medicine_orders mo
    WHERE substring(replace(mo.id::text,'-','') for 8) = regexp_replace(_r,'[^0-9a-f]','','g')
      AND regexp_replace(mo.patient_phone,'\D','','g') = _p
    LIMIT 1;

  ELSIF _kind = 'second_opinion' THEN
    IF length(regexp_replace(_r,'[^0-9a-f]','','g')) < 8 THEN RETURN; END IF;
    RETURN QUERY
    SELECT 'second_opinion'::text, so.id,
           substring(replace(so.id::text,'-','') for 8),
           'رأي طبي ثاني — ' || COALESCE(so.specialty,''),
           so.status,
           so.created_at,
           NULL::timestamptz,
           jsonb_build_object('specialty', so.specialty, 'email', so.email)
    FROM public.second_opinion_requests so
    WHERE substring(replace(so.id::text,'-','') for 8) = regexp_replace(_r,'[^0-9a-f]','','g')
      AND regexp_replace(so.phone,'\D','','g') = _p
    LIMIT 1;

  ELSIF _kind = 'home_care' THEN
    IF length(regexp_replace(_r,'[^0-9a-f]','','g')) < 8 THEN RETURN; END IF;
    RETURN QUERY
    SELECT 'home_care'::text, hc.id,
           substring(replace(hc.id::text,'-','') for 8),
           COALESCE(hc.service, 'رعاية منزلية'),
           hc.status,
           hc.created_at,
           CASE WHEN hc.preferred_date IS NOT NULL
                THEN (hc.preferred_date + COALESCE(hc.preferred_time,'00:00'::time))::timestamptz
                ELSE NULL END,
           jsonb_build_object('address', hc.address, 'notes', hc.notes)
    FROM public.home_care_requests hc
    WHERE substring(replace(hc.id::text,'-','') for 8) = regexp_replace(_r,'[^0-9a-f]','','g')
      AND regexp_replace(hc.patient_phone,'\D','','g') = _p
    LIMIT 1;

  ELSIF _kind = 'appointment' THEN
    IF ref_norm ~ '^BMC-[0-9]{8}-[0-9]{4}$' THEN
      RETURN QUERY
      SELECT 'appointment'::text, a.id,
             coalesce(a.reference_number, ref_norm),
             COALESCE(s.name_ar, 'موعد طبي'),
             a.status::text,
             a.created_at,
             (a.appointment_date + a.appointment_time)::timestamptz,
             jsonb_build_object(
               'patient_name', a.patient_name,
               'patient_phone', a.patient_phone,
               'appointment_date', a.appointment_date,
               'appointment_time', a.appointment_time,
               'reason', a.reason,
               'notes', a.notes,
               'specialty_id', a.specialty_id,
               'doctor_id', a.doctor_id,
               'specialty_name_ar', s.name_ar,
               'specialty_name_en', s.name_en,
               'doctor_name_ar', d.name_ar,
               'doctor_name_en', d.name_en,
               'reminder_24h', a.reminder_24h,
               'reminder_2h', a.reminder_2h,
               'cancel_reason', a.cancel_reason,
               'cancelled_at', a.cancelled_at
             )
      FROM public.appointments a
      LEFT JOIN public.specialties s ON s.id = a.specialty_id
      LEFT JOIN public.doctors d ON d.id = a.doctor_id
      WHERE a.reference_number = ref_norm
        AND regexp_replace(a.patient_phone,'\D','','g') = _p
      LIMIT 1;
    ELSE
      IF length(regexp_replace(_r,'[^0-9a-f]','','g')) < 8 THEN RETURN; END IF;
      RETURN QUERY
      SELECT 'appointment'::text, a.id,
             coalesce(a.reference_number, substring(replace(a.id::text,'-','') for 8)),
             COALESCE(s.name_ar, 'موعد طبي'),
             a.status::text,
             a.created_at,
             (a.appointment_date + a.appointment_time)::timestamptz,
             jsonb_build_object(
               'patient_name', a.patient_name,
               'patient_phone', a.patient_phone,
               'appointment_date', a.appointment_date,
               'appointment_time', a.appointment_time,
               'reason', a.reason,
               'notes', a.notes,
               'specialty_id', a.specialty_id,
               'doctor_id', a.doctor_id,
               'specialty_name_ar', s.name_ar,
               'specialty_name_en', s.name_en,
               'doctor_name_ar', d.name_ar,
               'doctor_name_en', d.name_en,
               'reminder_24h', a.reminder_24h,
               'reminder_2h', a.reminder_2h,
               'cancel_reason', a.cancel_reason,
               'cancelled_at', a.cancelled_at
             )
      FROM public.appointments a
      LEFT JOIN public.specialties s ON s.id = a.specialty_id
      LEFT JOIN public.doctors d ON d.id = a.doctor_id
      WHERE substring(replace(a.id::text,'-','') for 8) = regexp_replace(_r,'[^0-9a-f]','','g')
        AND regexp_replace(a.patient_phone,'\D','','g') = _p
      LIMIT 1;
    END IF;
  END IF;

  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.get_order_by_ref(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_order_by_ref(text, text, text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_mrn(UUID) TO service_role;

COMMIT;
