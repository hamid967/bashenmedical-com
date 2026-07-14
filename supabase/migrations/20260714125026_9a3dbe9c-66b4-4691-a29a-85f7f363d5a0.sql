-- Tighten EXECUTE on SECURITY DEFINER functions in public.
-- Public-facing RPCs (booking, tracking, public listings) keep anon EXECUTE.
-- Trigger/internal/admin helpers are locked down.

-- 1) Trigger-only functions: only postgres/service_role should run them.
REVOKE ALL ON FUNCTION public.enqueue_appointment_confirmation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_service_inquiry_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_waitlist_on_slot_release() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_inquiry_updates_block_mutation() FROM PUBLIC, anon, authenticated;

-- 2) RLS/authorization helper functions: keep for authenticated (used in policies)
--    but revoke from anon and PUBLIC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_consent(uuid, consent_type) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_inquiry_staff(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_doctor_id() FROM anon, PUBLIC;

-- 3) Audit/logging: only signed-in callers.
REVOKE EXECUTE ON FUNCTION public.log_auth_event(text, uuid, text, text, text, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_role_permission_audit(integer, integer) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_consent(uuid, consent_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_inquiry_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_doctor_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_auth_event(text, uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_role_permission_audit(integer, integer) TO authenticated;

-- Public RPCs intentionally remain executable by anon:
--   book_slot, cancel_appointment_by_ref, cancel_order_by_ref, claim_service_inquiry,
--   doctor_next_available_date, estimate_appointment_cost, get_order_by_ref,
--   get_public_doctor_rating_summary, list_appointment_audit_by_ref, list_doctors_next_slot,
--   list_public_branches, list_public_branches_for_rating, list_public_doctor_ratings,
--   list_public_doctors, list_public_doctors_for_rating, list_public_excellence_centers,
--   list_reminder_preferences_by_ref, lookup_appointment, lookup_complaint,
--   reschedule_appointment_by_ref, specialty_doctor_counts, submit_public_rating,
--   track_appointment, track_orders_by_phone, update_reminders_by_ref.