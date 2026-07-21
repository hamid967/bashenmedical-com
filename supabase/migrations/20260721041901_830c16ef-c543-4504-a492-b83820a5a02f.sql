CREATE TABLE public.reservation_manage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'otp_sent','otp_verified',
    'cancel','cancel_undo_success','cancel_undo_failed',
    'reschedule'
  )),
  phone_hash text,
  appointment_id uuid,
  released boolean,
  waitlist_notified boolean,
  slot_rebooked boolean,
  waitlist_reverted boolean,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rme_type_time ON public.reservation_manage_events (event_type, created_at DESC);
CREATE INDEX idx_rme_time ON public.reservation_manage_events (created_at DESC);
CREATE INDEX idx_rme_appt ON public.reservation_manage_events (appointment_id) WHERE appointment_id IS NOT NULL;

GRANT ALL ON public.reservation_manage_events TO service_role;

ALTER TABLE public.reservation_manage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_rme" ON public.reservation_manage_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_role_write_rme" ON public.reservation_manage_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);