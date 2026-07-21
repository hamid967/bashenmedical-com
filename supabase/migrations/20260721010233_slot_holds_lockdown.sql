-- Fix: slot_holds had FOR SELECT/UPDATE USING (true) exposing session data
-- and allowing hijack/release of other users' holds. All app access goes
-- through supabaseAdmin (bypasses RLS) in src/routes/api/public/book/*, so
-- remove the permissive public policies and keep only the admin policy.

DROP POLICY IF EXISTS "hold_owner_read" ON public.slot_holds;
DROP POLICY IF EXISTS "hold_anon_insert" ON public.slot_holds;
DROP POLICY IF EXISTS "hold_owner_release" ON public.slot_holds;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.slot_holds FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.slot_holds FROM authenticated;
-- Leave SELECT to authenticated ungranted; admin policy scopes reads.
REVOKE SELECT ON public.slot_holds FROM authenticated;
