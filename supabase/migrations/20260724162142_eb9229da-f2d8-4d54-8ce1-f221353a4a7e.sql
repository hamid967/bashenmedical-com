CREATE TABLE public.bi_daily_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  metric text NOT NULL,
  dimension text NOT NULL DEFAULT 'all',
  value_numeric double precision NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, metric, dimension)
);

GRANT SELECT ON public.bi_daily_kpis TO authenticated;
GRANT ALL ON public.bi_daily_kpis TO service_role;

ALTER TABLE public.bi_daily_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_daily_kpis admin read"
  ON public.bi_daily_kpis FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE INDEX bi_daily_kpis_day_idx ON public.bi_daily_kpis (day DESC);
CREATE INDEX bi_daily_kpis_metric_idx ON public.bi_daily_kpis (metric, day DESC);

CREATE OR REPLACE FUNCTION public.refresh_bi_daily_kpis(_days_back integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from date := (CURRENT_DATE - GREATEST(_days_back, 1))::date;
  _rows integer := 0;
BEGIN
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

  INSERT INTO public.bi_daily_kpis (day, metric, dimension, value_numeric, sample_size)
  SELECT (created_at AT TIME ZONE 'Asia/Riyadh')::date,
         'inquiries_received', COALESCE(channel::text, 'unknown'),
         COUNT(*)::float8, COUNT(*)
    FROM public.inbox_items WHERE created_at >= _from
   GROUP BY (created_at AT TIME ZONE 'Asia/Riyadh')::date, COALESCE(channel::text, 'unknown')
  ON CONFLICT (day, metric, dimension) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric, sample_size = EXCLUDED.sample_size, refreshed_at = now();

  INSERT INTO public.bi_daily_kpis (day, metric, dimension, value_numeric, sample_size)
  SELECT (started_at AT TIME ZONE 'Asia/Riyadh')::date, 'ai_conversations', 'all',
         COUNT(*)::float8, COUNT(*)
    FROM public.ai_conversations WHERE started_at >= _from GROUP BY 1
  ON CONFLICT (day, metric, dimension) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric, sample_size = EXCLUDED.sample_size, refreshed_at = now();

  INSERT INTO public.bi_daily_kpis (day, metric, dimension, value_numeric, sample_size)
  SELECT (ts AT TIME ZONE 'Asia/Riyadh')::date, 'web_vitals_p75', metric::text,
         percentile_disc(0.75) WITHIN GROUP (ORDER BY value)::float8, COUNT(*)
    FROM public.web_vitals
   WHERE ts >= _from AND metric::text IN ('LCP','INP','CLS')
   GROUP BY (ts AT TIME ZONE 'Asia/Riyadh')::date, metric::text
  ON CONFLICT (day, metric, dimension) DO UPDATE
    SET value_numeric = EXCLUDED.value_numeric, sample_size = EXCLUDED.sample_size, refreshed_at = now();

  RETURN _rows;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_bi_daily_kpis(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_bi_daily_kpis(integer) TO service_role;

SELECT public.refresh_bi_daily_kpis(30);
