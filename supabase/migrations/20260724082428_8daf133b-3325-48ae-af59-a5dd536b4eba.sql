CREATE TABLE public.perf_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('LCP','INP','CLS','FCP','TTFB')),
  threshold double precision NOT NULL CHECK (threshold > 0),
  window_hours integer NOT NULL DEFAULT 24 CHECK (window_hours BETWEEN 1 AND 720),
  min_samples integer NOT NULL DEFAULT 20 CHECK (min_samples > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (path, metric)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perf_budgets TO authenticated;
GRANT ALL ON public.perf_budgets TO service_role;
ALTER TABLE public.perf_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf_budgets admin read"
  ON public.perf_budgets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "perf_budgets admin write"
  ON public.perf_budgets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.perf_budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  metric text NOT NULL,
  threshold double precision NOT NULL,
  p75_value double precision NOT NULL,
  sample_size integer NOT NULL,
  window_hours integer NOT NULL,
  bucket_at timestamptz NOT NULL DEFAULT date_trunc('hour', now()),
  webhook_status integer,
  email_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (path, metric, bucket_at)
);
GRANT SELECT ON public.perf_budget_alerts TO authenticated;
GRANT ALL ON public.perf_budget_alerts TO service_role;
ALTER TABLE public.perf_budget_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf_budget_alerts admin read"
  ON public.perf_budget_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE INDEX perf_budget_alerts_created_idx
  ON public.perf_budget_alerts (created_at DESC);

INSERT INTO public.perf_budgets (path, metric, threshold, window_hours, min_samples) VALUES
  ('/book',    'LCP', 2500, 24, 20),
  ('/book',    'INP',  200, 24, 20),
  ('/',        'LCP', 2500, 24, 20),
  ('/',        'INP',  200, 24, 20),
  ('/doctors', 'LCP', 2500, 24, 20),
  ('/doctors', 'INP',  200, 24, 20)
ON CONFLICT (path, metric) DO NOTHING;