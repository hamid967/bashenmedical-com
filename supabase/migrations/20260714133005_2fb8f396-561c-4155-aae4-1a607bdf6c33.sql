
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'held' AND enumtypid = 'public.appointment_status'::regtype) THEN
    ALTER TYPE public.appointment_status ADD VALUE 'held';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_verification' AND enumtypid = 'public.appointment_status'::regtype) THEN
    ALTER TYPE public.appointment_status ADD VALUE 'pending_verification';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_payment' AND enumtypid = 'public.appointment_status'::regtype) THEN
    ALTER TYPE public.appointment_status ADD VALUE 'pending_payment';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'checked_in' AND enumtypid = 'public.appointment_status'::regtype) THEN
    ALTER TYPE public.appointment_status ADD VALUE 'checked_in';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'in_progress' AND enumtypid = 'public.appointment_status'::regtype) THEN
    ALTER TYPE public.appointment_status ADD VALUE 'in_progress';
  END IF;
END $$;
