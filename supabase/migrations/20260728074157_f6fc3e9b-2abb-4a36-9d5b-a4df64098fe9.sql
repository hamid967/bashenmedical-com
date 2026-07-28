-- 1. Add missing role guard inside refresh_bi_daily_kpis
CREATE OR REPLACE FUNCTION public.refresh_bi_daily_kpis(_days_back integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _from date := (CURRENT_DATE - GREATEST(_days_back, 1))::date;
  _rows integer := 0;
  _uid uuid := auth.uid();
BEGIN
  -- Guard: admin/super_admin only. service_role/postgres bypass auth.uid() (returns NULL)
  -- and can still execute because they retain EXECUTE from the owner grant.
  IF _uid IS NOT NULL AND NOT (
    public.has_role(_uid, 'admin'::public.app_role)
    OR public.has_role(_uid, 'super_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.bi_daily_kpis (day, metric, dimension, value_numeric, sample_size)
  SELECT (created_at AT TIME ZONE 'Asia/Riyadh')::date, 'appointments_booked', 'all',
         COUNT(*)::float8, COUNT(*)
    FROM public.appointments WHERE created_at >= _from GROUP BY 1
  ON CONFLICT (day, metric, dimension) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric, sample_size = EXCLUDED.sample_size, refreshed_at = now();
  GET DIAGNOSTICS _rows = ROW_COUNT;

  INSERT INTO public.bi_daily_kpis (day, metric, dimension, value_numeric, sample_size)
  SELECT (appointment_date)::date, 'appointments_completed', 'all', COUNT(*)::float8, COUNT(*)
    FROM public.appointments
   WHERE status = 'completed' AND appointment_date >= _from GROUP BY 1
  ON CONFLICT (day, metric, dimension) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric, sample_size = EXCLUDED.sample_size, refreshed_at = now();

  INSERT INTO public.bi_daily_kpis (day, metric, dimension, value_numeric, sample_size)
  SELECT (created_at AT TIME ZONE 'Asia/Riyadh')::date, 'patients_new', 'all',
         COUNT(*)::float8, COUNT(*)
    FROM public.patients WHERE created_at >= _from GROUP BY 1
  ON CONFLICT (day, metric, dimension) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric, sample_size = EXCLUDED.sample_size, refreshed_at = now();

  INSERT INTO public.bi_daily_kpis (day, metric, dimension, value_numeric, sample_size)
  SELECT (COALESCE(paid_at, created_at) AT TIME ZONE 'Asia/Riyadh')::date,
         'revenue_paid', COALESCE(currency, 'SAR'),
         COALESCE(SUM(amount), 0)::float8, COUNT(*)
    FROM public.payments
   WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= _from
   GROUP BY (COALESCE(paid_at, created_at) AT TIME ZONE 'Asia/Riyadh')::date, COALESCE(currency, 'SAR')
  ON CONFLICT (day, metric, dimension) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric, sample_size = EXCLUDED.sample_size, refreshed_at = now();

  RETURN _rows;
END;
$function$;

-- 2. Revoke anon on admin/staff-only functions (they self-guard, but defense-in-depth)
REVOKE EXECUTE ON FUNCTION public.refresh_bi_daily_kpis(integer) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_bi_daily_kpis(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_list_data_contracts() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_ai_incident_events(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transition_insurance_approval(uuid, text, text, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_service_inquiry(text, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.escalate_ai_to_inbox(uuid, text, text, text, text, text, text) FROM anon, PUBLIC;

-- 3. Trigger-only functions: revoke from client roles entirely (owner + service_role retain via default)
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_appointment() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_complaint() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_corporate() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_home_care() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_medicine_order() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_second_opinion() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_service_inquiry() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_waitlist() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recon_adj_prevent_core_edits() FROM anon, authenticated, PUBLIC;