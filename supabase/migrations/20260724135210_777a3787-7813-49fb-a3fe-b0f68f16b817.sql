
-- B3 Billing: idempotency + webhook audit log
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_unique
  ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  signature_valid boolean NOT NULL,
  http_status int NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  raw jsonb,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_event_unique
  ON public.payment_webhook_events (provider, event_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_received_at
  ON public.payment_webhook_events (received_at DESC);

GRANT SELECT ON public.payment_webhook_events TO authenticated;
GRANT ALL ON public.payment_webhook_events TO service_role;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing view webhook events" ON public.payment_webhook_events;
CREATE POLICY "billing view webhook events"
  ON public.payment_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'billing.view'));
