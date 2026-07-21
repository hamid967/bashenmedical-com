-- Allow anon and authenticated to SELECT active slot holds so Realtime
-- postgres_changes filtered by id can deliver countdown updates to the
-- browser during the booking flow. Rows are limited to non-released,
-- non-expired holds; contents (doctor/date/time) match what the public
-- availability endpoint already exposes.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='slot_holds' AND policyname='hold_read_active_public'
  ) THEN
    CREATE POLICY hold_read_active_public ON public.slot_holds
      FOR SELECT
      TO anon, authenticated
      USING (released_at IS NULL AND expires_at > now());
  END IF;
END $$;

GRANT SELECT ON public.slot_holds TO anon, authenticated;