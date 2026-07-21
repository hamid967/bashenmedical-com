-- 1) deployment_markers: one row per merged migration
CREATE TABLE public.deployment_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_ref TEXT NOT NULL UNIQUE,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  baseline_errors_per_hour NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deployment_markers TO authenticated;
GRANT ALL ON public.deployment_markers TO service_role;
ALTER TABLE public.deployment_markers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read deployment_markers"
  ON public.deployment_markers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2) api_permission_errors: append-only log of 403/permission_denied events
CREATE TABLE public.api_permission_errors (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_code SMALLINT NOT NULL,          -- 401/403 or pg SQLSTATE mapped
  route TEXT NOT NULL,                     -- '/api/...' or 'rpc:<fn>'
  role_hint TEXT,                          -- 'anon' | 'authenticated' | null
  sqlstate TEXT,                           -- e.g. '42501'
  message TEXT,                            -- truncated at write time
  release_ref TEXT                         -- optional: latest migration ref at time of error
);
GRANT INSERT ON public.api_permission_errors TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.api_permission_errors_id_seq TO anon, authenticated;
GRANT SELECT ON public.api_permission_errors TO authenticated;
GRANT ALL ON public.api_permission_errors TO service_role;
ALTER TABLE public.api_permission_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can insert permission errors"
  ON public.api_permission_errors FOR INSERT TO anon, authenticated
  WITH CHECK (status_code IN (401, 403) AND length(coalesce(route, '')) BETWEEN 1 AND 512);
CREATE POLICY "admins read permission errors"
  ON public.api_permission_errors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX idx_api_perm_errors_occurred ON public.api_permission_errors (occurred_at DESC);
CREATE INDEX idx_api_perm_errors_route ON public.api_permission_errors (route, occurred_at DESC);

-- 3) rollback_recommendations: watchdog output; humans/CI act on it
CREATE TABLE public.rollback_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deployment_id UUID NOT NULL REFERENCES public.deployment_markers(id) ON DELETE CASCADE,
  baseline_per_hour NUMERIC NOT NULL,
  observed_per_hour NUMERIC NOT NULL,
  ratio NUMERIC NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warn', 'rollback')),
  top_routes JSONB NOT NULL DEFAULT '[]'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ack', 'rolled_back', 'dismissed'))
);
GRANT SELECT, UPDATE ON public.rollback_recommendations TO authenticated;
GRANT ALL ON public.rollback_recommendations TO service_role;
ALTER TABLE public.rollback_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read rollback recs"
  ON public.rollback_recommendations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "admins ack rollback recs"
  ON public.rollback_recommendations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 4) record_permission_error: front-end friendly RPC (bounded, sanitized)
CREATE OR REPLACE FUNCTION public.record_permission_error(
  _status_code SMALLINT,
  _route TEXT,
  _sqlstate TEXT DEFAULT NULL,
  _message TEXT DEFAULT NULL,
  _role_hint TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status_code NOT IN (401, 403) THEN
    RETURN;
  END IF;
  IF _route IS NULL OR length(_route) = 0 OR length(_route) > 512 THEN
    RETURN;
  END IF;
  INSERT INTO public.api_permission_errors
    (status_code, route, sqlstate, message, role_hint, release_ref)
  VALUES (
    _status_code,
    left(_route, 512),
    left(coalesce(_sqlstate, ''), 16),
    left(coalesce(_message, ''), 500),
    left(coalesce(_role_hint, ''), 32),
    (SELECT migration_ref FROM public.deployment_markers ORDER BY merged_at DESC LIMIT 1)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_permission_error(SMALLINT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_permission_error(SMALLINT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 5) evaluate_permission_error_spike: called by watchdog cron
CREATE OR REPLACE FUNCTION public.evaluate_permission_error_spike(
  _warn_ratio NUMERIC DEFAULT 3.0,
  _rollback_ratio NUMERIC DEFAULT 6.0,
  _min_observed_per_hour NUMERIC DEFAULT 5.0
) RETURNS TABLE (
  deployment_id UUID,
  migration_ref TEXT,
  merged_at TIMESTAMPTZ,
  baseline NUMERIC,
  observed NUMERIC,
  ratio NUMERIC,
  severity TEXT,
  top_routes JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
  obs NUMERIC;
  window_hours NUMERIC;
  r NUMERIC;
  sev TEXT;
  routes JSONB;
BEGIN
  -- Only consider the latest deployment merged in the last 24h.
  SELECT * INTO d FROM public.deployment_markers
   WHERE merged_at > now() - interval '24 hours'
   ORDER BY merged_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  window_hours := GREATEST(0.25, EXTRACT(EPOCH FROM (now() - d.merged_at))/3600.0);
  SELECT count(*)::NUMERIC / window_hours INTO obs
    FROM public.api_permission_errors
   WHERE occurred_at >= d.merged_at;

  r := CASE WHEN d.baseline_errors_per_hour <= 0.1 THEN obs
            ELSE obs / d.baseline_errors_per_hour END;

  sev := CASE
    WHEN obs >= _min_observed_per_hour AND r >= _rollback_ratio THEN 'rollback'
    WHEN obs >= _min_observed_per_hour AND r >= _warn_ratio THEN 'warn'
    ELSE 'ok'
  END;

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO routes FROM (
    SELECT route, count(*) AS n
      FROM public.api_permission_errors
     WHERE occurred_at >= d.merged_at
     GROUP BY route ORDER BY n DESC LIMIT 5
  ) x;

  IF sev IN ('warn', 'rollback') THEN
    INSERT INTO public.rollback_recommendations
      (deployment_id, baseline_per_hour, observed_per_hour, ratio, severity, top_routes)
    SELECT d.id, d.baseline_errors_per_hour, obs, r, sev, routes
     WHERE NOT EXISTS (
       SELECT 1 FROM public.rollback_recommendations
        WHERE deployment_id = d.id AND status = 'open'
          AND triggered_at > now() - interval '1 hour'
     );
  END IF;

  RETURN QUERY SELECT d.id, d.migration_ref, d.merged_at,
                      d.baseline_errors_per_hour, obs, r, sev, routes;
END;
$$;
REVOKE ALL ON FUNCTION public.evaluate_permission_error_spike(NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_permission_error_spike(NUMERIC, NUMERIC, NUMERIC) TO service_role;

-- 6) Retention: keep 14 days
CREATE OR REPLACE FUNCTION public._purge_old_permission_errors()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.api_permission_errors WHERE occurred_at < now() - interval '14 days';
$$;
REVOKE ALL ON FUNCTION public._purge_old_permission_errors() FROM PUBLIC;