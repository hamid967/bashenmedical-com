-- A3.1 — internal/service-only: revoke from every external role
REVOKE ALL ON FUNCTION public._purge_old_permission_errors() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.evaluate_permission_error_spike(NUMERIC, NUMERIC, NUMERIC)
  FROM PUBLIC, anon, authenticated;
-- service_role grant was applied in the prior migration; keep it.

REVOKE ALL ON FUNCTION public.has_resource_permission(UUID, resource_kind, UUID, resource_permission)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_resource_permission(UUID, resource_kind, UUID, resource_permission)
  TO authenticated;

-- A3.2 — allowlisted but leaking via PUBLIC role: revoke PUBLIC, grant explicit
REVOKE EXECUTE ON FUNCTION public.book_appointment_atomic(
  uuid, uuid, uuid, date, time without time zone, text, text, text, text, text,
  text, boolean, boolean, text, uuid, uuid, appointment_status
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_appointment_atomic(
  uuid, uuid, uuid, date, time without time zone, text, text, text, text, text,
  text, boolean, boolean, text, uuid, uuid, appointment_status
) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.confirm_waitlist_offer(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_waitlist_offer(text, text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.estimate_appointment_cost(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estimate_appointment_cost(uuid, uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.track_orders_by_phone(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_orders_by_phone(text, text) TO anon, authenticated;

-- Documentary comments so pg_dump/pg_proc explain the rationale.
COMMENT ON FUNCTION public._purge_old_permission_errors() IS
  'A3: internal cron-only; no external EXECUTE.';
COMMENT ON FUNCTION public.evaluate_permission_error_spike(NUMERIC, NUMERIC, NUMERIC) IS
  'A3: watchdog only via service_role; no anon/authenticated EXECUTE.';
COMMENT ON FUNCTION public.has_resource_permission(UUID, resource_kind, UUID, resource_permission) IS
  'A3: RLS helper — authenticated only (no anon).';