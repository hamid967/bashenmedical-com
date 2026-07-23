
CREATE TABLE public.booking_trace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text NOT NULL,
  event text NOT NULL,
  idempotency_key_masked text,
  reference_number text,
  appointment_id uuid,
  doctor_id uuid,
  appointment_date date,
  appointment_time time,
  duration_ms integer,
  pg_code text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_trace_events_corr_idx ON public.booking_trace_events (correlation_id, created_at DESC);
CREATE INDEX booking_trace_events_ref_idx ON public.booking_trace_events (reference_number) WHERE reference_number IS NOT NULL;
CREATE INDEX booking_trace_events_created_idx ON public.booking_trace_events (created_at DESC);

GRANT SELECT ON public.booking_trace_events TO authenticated;
GRANT ALL ON public.booking_trace_events TO service_role;

ALTER TABLE public.booking_trace_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read booking trace events"
  ON public.booking_trace_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
