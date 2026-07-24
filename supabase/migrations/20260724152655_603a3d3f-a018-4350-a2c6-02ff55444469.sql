ALTER TABLE public.reminder_preferences
  ADD COLUMN IF NOT EXISTS muted_kinds text[] NOT NULL DEFAULT '{}'::text[];
COMMENT ON COLUMN public.reminder_preferences.muted_kinds IS 'Notification kinds/prefixes muted by the user (e.g. medication_reminder, marketing.*).';