
CREATE TABLE public.web_vitals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric TEXT NOT NULL CHECK (metric IN ('LCP','CLS','INP','FCP','TTFB')),
  value DOUBLE PRECISION NOT NULL,
  url TEXT NOT NULL,
  metric_id TEXT,
  user_agent TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX web_vitals_ts_idx ON public.web_vitals (ts DESC);
CREATE INDEX web_vitals_metric_ts_idx ON public.web_vitals (metric, ts DESC);
CREATE INDEX web_vitals_url_idx ON public.web_vitals (url);

GRANT INSERT ON public.web_vitals TO anon, authenticated;
GRANT SELECT ON public.web_vitals TO authenticated;
GRANT ALL ON public.web_vitals TO service_role;

ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous visitors) can submit a sample. No PII stored.
CREATE POLICY "anyone can insert vitals"
  ON public.web_vitals
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    value >= 0 AND value < 600000
    AND length(url) <= 512
    AND length(coalesce(metric_id, '')) <= 128
    AND length(coalesce(user_agent, '')) <= 512
  );

-- Only staff can read aggregated telemetry.
CREATE POLICY "staff read vitals"
  ON public.web_vitals
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );
