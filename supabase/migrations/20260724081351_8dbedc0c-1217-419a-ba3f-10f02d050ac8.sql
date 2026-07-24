
-- Revoke PUBLIC EXECUTE on 9 trigger functions (called by rules engine, not clients)
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_appointment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_complaint() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_corporate() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_home_care() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_medicine_order() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_second_opinion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_service_inquiry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inbox_ingest_waitlist() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_dependent_from_verification_request() FROM PUBLIC;

-- Scope list_ai_safety_incidents to authenticated users only
REVOKE EXECUTE ON FUNCTION public.list_ai_safety_incidents(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_ai_safety_incidents(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_ai_safety_incidents(uuid) TO authenticated;
