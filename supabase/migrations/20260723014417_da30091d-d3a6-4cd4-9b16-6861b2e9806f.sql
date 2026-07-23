-- Restore minimum EXECUTE privileges required at runtime.
-- _appointment_belongs_to_me is SECURITY DEFINER but is invoked from an RLS
-- policy on public.appointments TO authenticated; without EXECUTE for that
-- role the policy raises 42501 and blocks patients from reading/cancelling
-- their own appointments.
GRANT EXECUTE ON FUNCTION public._appointment_belongs_to_me(text) TO authenticated;

-- log_auth_event is called from a server function using the publishable
-- (anon) key during sign-in / sign-up flows, i.e. before a session exists.
-- It must be executable by anon; the function body already validates input.
GRANT EXECUTE ON FUNCTION public.log_auth_event(text, uuid, text, text, text, jsonb) TO anon;