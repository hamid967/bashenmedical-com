CREATE OR REPLACE FUNCTION public.evaluate_permission_error_spike(
  _warn_ratio numeric DEFAULT 3.0,
  _rollback_ratio numeric DEFAULT 6.0,
  _min_observed_per_hour numeric DEFAULT 5.0
)
RETURNS TABLE(
  deployment_id uuid,
  migration_ref text,
  merged_at timestamp with time zone,
  baseline numeric,
  observed numeric,
  ratio numeric,
  severity text,
  top_routes jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  d RECORD;
  obs NUMERIC;
  window_hours NUMERIC;
  r NUMERIC;
  sev TEXT;
  routes JSONB;
BEGIN
  -- Qualify merged_at against the table to avoid clashing with the RETURNS TABLE column.
  SELECT dm.* INTO d
    FROM public.deployment_markers dm
   WHERE dm.merged_at > now() - interval '24 hours'
   ORDER BY dm.merged_at DESC
   LIMIT 1;
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
    SELECT ape.route, count(*) AS n
      FROM public.api_permission_errors ape
     WHERE ape.occurred_at >= d.merged_at
     GROUP BY ape.route
     ORDER BY n DESC
     LIMIT 5
  ) x;

  IF sev IN ('warn', 'rollback') THEN
    INSERT INTO public.rollback_recommendations
      (deployment_id, baseline_per_hour, observed_per_hour, ratio, severity, top_routes)
    SELECT d.id, d.baseline_errors_per_hour, obs, r, sev, routes
     WHERE NOT EXISTS (
       SELECT 1 FROM public.rollback_recommendations rr
        WHERE rr.deployment_id = d.id
          AND rr.status = 'open'
          AND rr.triggered_at > now() - interval '1 hour'
     );
  END IF;

  RETURN QUERY SELECT d.id, d.migration_ref, d.merged_at,
                      d.baseline_errors_per_hour, obs, r, sev, routes;
END;
$function$;

-- Preserve the A3 sealing: no PUBLIC/anon execute.
REVOKE ALL ON FUNCTION public.evaluate_permission_error_spike(numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_permission_error_spike(numeric, numeric, numeric) TO service_role;