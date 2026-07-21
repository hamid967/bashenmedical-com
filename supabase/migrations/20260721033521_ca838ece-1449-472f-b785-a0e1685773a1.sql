
CREATE TABLE public.guest_reservation_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  session_token TEXT UNIQUE,
  session_expires_at TIMESTAMPTZ,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_grs_phone ON public.guest_reservation_sessions(phone);
CREATE INDEX idx_grs_token ON public.guest_reservation_sessions(session_token) WHERE session_token IS NOT NULL;
CREATE INDEX idx_grs_created ON public.guest_reservation_sessions(created_at);

GRANT ALL ON public.guest_reservation_sessions TO service_role;
ALTER TABLE public.guest_reservation_sessions ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated grants; only service_role via server endpoints touches this table.
CREATE POLICY "service_role_all_grs" ON public.guest_reservation_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
