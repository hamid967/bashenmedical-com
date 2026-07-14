
ALTER TABLE public.reminder_preferences
  ADD COLUMN IF NOT EXISTS channel_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS channel_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS channel_sms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminder_preferences_frequency_check') THEN
    ALTER TABLE public.reminder_preferences
      ADD CONSTRAINT reminder_preferences_frequency_check
      CHECK (frequency IN ('immediate','daily','weekly'));
  END IF;
END $$;
