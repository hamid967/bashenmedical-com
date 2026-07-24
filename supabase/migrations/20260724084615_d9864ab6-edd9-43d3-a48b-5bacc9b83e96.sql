DROP POLICY IF EXISTS "hold_read_active_public" ON public.slot_holds;

CREATE POLICY "hold_read_own_authenticated" ON public.slot_holds
  FOR SELECT
  TO authenticated
  USING (held_by_user_id = auth.uid());

COMMENT ON POLICY "hold_read_own_authenticated" ON public.slot_holds IS
  'Signed-in users can only see their own booking holds. Anonymous guest holds are managed server-side via service_role in /api/public/book/* routes; session_id and idempotency_key are never exposed to the Data API.';