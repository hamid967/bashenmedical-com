REVOKE EXECUTE ON FUNCTION public.log_appointment_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_waitlist_on_appt_cancel() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.try_fill_waitlist_slot(uuid, uuid, date, time) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_expired_slot_holds() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_guest_appointments() FROM PUBLIC, anon;