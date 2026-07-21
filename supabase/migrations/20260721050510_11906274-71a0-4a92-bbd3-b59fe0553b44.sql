
CREATE TABLE IF NOT EXISTS public.nphies_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL CHECK (mode IN ('mock','sandbox','live')),
  provider_id uuid REFERENCES public.insurance_providers(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  policy_number text,
  member_id text,
  patient_national_id text,
  eligible boolean,
  reason text,
  coverage_percent numeric(5,2),
  consultation_fee numeric(10,2),
  covered_amount numeric(10,2),
  patient_share numeric(10,2),
  latency_ms integer,
  http_status integer,
  error_message text,
  raw_request jsonb,
  raw_response jsonb,
  ip inet,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_nphies_requests_created ON public.nphies_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nphies_requests_provider ON public.nphies_requests (provider_id);
CREATE INDEX IF NOT EXISTS idx_nphies_requests_doctor ON public.nphies_requests (doctor_id);

GRANT SELECT ON public.nphies_requests TO authenticated;
GRANT ALL ON public.nphies_requests TO service_role;

ALTER TABLE public.nphies_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read nphies_requests"
  ON public.nphies_requests
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );
