-- Add slot_holds and appointment_waitlist to the realtime publication for authenticated staff subscriptions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='slot_holds') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.slot_holds;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='appointment_waitlist') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_waitlist;
  END IF;
END $$;

-- Ensure REPLICA IDENTITY FULL so UPDATE/DELETE payloads include old row data (needed for invalidation)
ALTER TABLE public.availability_slots REPLICA IDENTITY FULL;
ALTER TABLE public.appointments REPLICA IDENTITY FULL;
ALTER TABLE public.slot_holds REPLICA IDENTITY FULL;