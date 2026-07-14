GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_consent(uuid, consent_type) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_inquiry_staff(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_doctor_id() TO anon, authenticated;