-- 1. Add WhatsApp and Push channels to reminder_preferences
ALTER TABLE public.reminder_preferences
  ADD COLUMN IF NOT EXISTS channel_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS channel_push boolean NOT NULL DEFAULT true;

-- 2. Notification delivery logs (admin monitoring)
CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  notification_id uuid NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','email','sms','whatsapp','push')),
  provider text NULL,
  template text NULL,
  recipient text NULL,
  subject text NULL,
  status text NOT NULL CHECK (status IN ('pending','sent','delivered','failed','skipped','bounced')),
  error_message text NULL,
  attempt integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ndl_created_at ON public.notification_delivery_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ndl_channel_status ON public.notification_delivery_logs (channel, status);
CREATE INDEX IF NOT EXISTS idx_ndl_user_id ON public.notification_delivery_logs (user_id);

GRANT SELECT ON public.notification_delivery_logs TO authenticated;
GRANT ALL ON public.notification_delivery_logs TO service_role;

ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only read; writes are server-side via service role only
CREATE POLICY "Admins can view notification delivery logs"
  ON public.notification_delivery_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own delivery logs"
  ON public.notification_delivery_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());