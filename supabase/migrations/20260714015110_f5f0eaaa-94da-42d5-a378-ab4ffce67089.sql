-- 1) Require reference code + phone for order tracking
CREATE OR REPLACE FUNCTION public.track_orders_by_phone(_phone text, _reference text DEFAULT NULL)
RETURNS TABLE(kind text, reference text, title text, status text, created_at timestamptz, scheduled_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _p text := regexp_replace(coalesce(_phone,''),'\D','','g');
  _ref text := lower(regexp_replace(coalesce(_reference,''),'[^0-9a-fA-F]','','g'));
BEGIN
  -- Enforce anti-enumeration: phone alone is not enough.
  IF length(_p) < 8 OR length(_ref) < 6 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 'appointment'::text,
         substring(replace(a.id::text,'-','') for 8),
         COALESCE(s.name_ar, 'موعد طبي'),
         a.status::text,
         a.created_at,
         (a.appointment_date + a.appointment_time)::timestamptz
  FROM public.appointments a
  LEFT JOIN public.specialties s ON s.id = a.specialty_id
  WHERE regexp_replace(a.patient_phone,'\D','','g') = _p
    AND substring(replace(a.id::text,'-','') for 8) = _ref

  UNION ALL
  SELECT 'pharmacy'::text,
         substring(replace(mo.id::text,'-','') for 8),
         'طلب صيدلية',
         mo.status::text,
         mo.created_at,
         NULL::timestamptz
  FROM public.medicine_orders mo
  WHERE regexp_replace(mo.patient_phone,'\D','','g') = _p
    AND substring(replace(mo.id::text,'-','') for 8) = _ref

  UNION ALL
  SELECT 'second_opinion'::text,
         substring(replace(so.id::text,'-','') for 8),
         'رأي طبي ثاني',
         so.status,
         so.created_at,
         NULL::timestamptz
  FROM public.second_opinion_requests so
  WHERE regexp_replace(so.phone,'\D','','g') = _p
    AND substring(replace(so.id::text,'-','') for 8) = _ref

  UNION ALL
  SELECT 'home_care'::text,
         substring(replace(hc.id::text,'-','') for 8),
         COALESCE(hc.service, 'رعاية منزلية'),
         hc.status,
         hc.created_at,
         CASE WHEN hc.preferred_date IS NOT NULL
              THEN (hc.preferred_date + COALESCE(hc.preferred_time,'00:00'::time))::timestamptz
              ELSE NULL END
  FROM public.home_care_requests hc
  WHERE regexp_replace(hc.patient_phone,'\D','','g') = _p
    AND substring(replace(hc.id::text,'-','') for 8) = _ref

  ORDER BY created_at DESC
  LIMIT 50;
END $$;

-- 2) Restrict user_roles writes to super_admin; keep admin read-only.
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;

CREATE POLICY "super_admins manage roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    -- Belt-and-braces: even a super_admin cannot self-grant via direct write
    -- (use assign_user_role RPC), preventing accidental self-escalation loops.
    AND user_id <> auth.uid()
  );