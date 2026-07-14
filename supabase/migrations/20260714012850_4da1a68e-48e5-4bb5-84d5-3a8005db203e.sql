CREATE TABLE public.insurance_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.insurance_providers(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  policy_hint text,
  eligible boolean NOT NULL,
  reason text,
  message text,
  consultation_fee numeric,
  coverage_percent numeric,
  covered_amount numeric,
  estimated_cost numeric,
  patient_share numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_insurance_verifications_user_created
  ON public.insurance_verifications (user_id, created_at DESC);
CREATE INDEX idx_insurance_verifications_appointment
  ON public.insurance_verifications (appointment_id);
CREATE INDEX idx_insurance_verifications_doctor_provider
  ON public.insurance_verifications (user_id, doctor_id, provider_id, created_at DESC);

GRANT SELECT, INSERT ON public.insurance_verifications TO authenticated;
GRANT ALL ON public.insurance_verifications TO service_role;

ALTER TABLE public.insurance_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own insurance verifications"
  ON public.insurance_verifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own insurance verifications"
  ON public.insurance_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
