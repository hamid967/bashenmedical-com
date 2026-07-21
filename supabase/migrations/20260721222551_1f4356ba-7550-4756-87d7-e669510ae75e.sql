
ALTER TABLE public.insurance_verifications
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_verifications_patient
  ON public.insurance_verifications (patient_id, created_at DESC);

-- Backfill: link existing verifications to the patient row that belongs to the same user.
UPDATE public.insurance_verifications v
SET patient_id = p.id
FROM public.patients p
WHERE v.patient_id IS NULL
  AND p.profile_id = v.user_id;
