-- =====================================================================
-- SECDEF Audit — Batch 2 (2026-07-29)
-- Tighten EXECUTE grants on SECURITY DEFINER functions.
-- No function bodies are modified.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Defense in depth: no SECDEF function may be EXECUTE-able by PUBLIC.
-- Grants must be explicit to anon / authenticated / service_role.
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Category A — Trigger-only helpers.
-- Called by the Postgres trigger engine, never by clients.
-- Revoke from anon, authenticated, PUBLIC. Keep service_role.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.generate_appointment_reference() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_dependent_from_verification_request() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Category B — Authenticated-only RPCs.
-- Currently anon-callable but should not be. Internal guards / RBAC
-- helpers used only after the caller has a session.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_ai_escalation_status(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission_in_branch(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role_in_branch(uuid, app_role, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_global_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_branch_ids(uuid) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------
-- Category C — Guest / public RPCs kept anon-callable on purpose.
-- No revoke here — they are protected internally (OTP / rate-limit /
-- signed reference). Only added to the security test allowlist:
--   * confirm_appointment_booking       — guest booking confirm
--   * verify_appointment_by_reference   — guest ref+phone lookup
--   * log_auth_event                    — anon must log pre-session failures
-- ---------------------------------------------------------------------
