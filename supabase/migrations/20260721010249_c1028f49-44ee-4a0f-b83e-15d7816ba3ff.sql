DROP POLICY IF EXISTS "hold_owner_read" ON public.slot_holds;
DROP POLICY IF EXISTS "hold_anon_insert" ON public.slot_holds;
DROP POLICY IF EXISTS "hold_owner_release" ON public.slot_holds;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.slot_holds FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.slot_holds FROM authenticated;