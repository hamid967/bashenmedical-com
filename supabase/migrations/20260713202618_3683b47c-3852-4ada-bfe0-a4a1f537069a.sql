-- 1) insurance_providers table
CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  name_en text,
  coverage_tier text NOT NULL DEFAULT 'basic' CHECK (coverage_tier IN ('comprehensive','basic','limited')),
  coverage_percent int NOT NULL DEFAULT 80 CHECK (coverage_percent BETWEEN 0 AND 100),
  active boolean NOT NULL DEFAULT true,
  notes_ar text,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS insurance_providers_name_ar_unique
  ON public.insurance_providers (name_ar);

GRANT SELECT ON public.insurance_providers TO anon, authenticated;
GRANT ALL ON public.insurance_providers TO service_role;

ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insurance_providers_public_read" ON public.insurance_providers;
CREATE POLICY "insurance_providers_public_read"
  ON public.insurance_providers FOR SELECT
  TO anon, authenticated
  USING (active = true);

DROP POLICY IF EXISTS "insurance_providers_admin_manage" ON public.insurance_providers;
CREATE POLICY "insurance_providers_admin_manage"
  ON public.insurance_providers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Seed common insurers (idempotent)
INSERT INTO public.insurance_providers (name_ar, name_en, coverage_tier, coverage_percent, sort_order) VALUES
  ('بوبا العربية','Bupa Arabia','comprehensive',85,10),
  ('التعاونية للتأمين','Tawuniya','comprehensive',85,20),
  ('ملاذ للتأمين','Malath','comprehensive',80,30),
  ('المتحدة للتأمين التعاوني','United Cooperative','comprehensive',80,40),
  ('الدرع العربي','Arabian Shield','comprehensive',80,50),
  ('MedGulf','MedGulf','comprehensive',80,60),
  ('أليانز إس إف','Allianz SF','comprehensive',80,70),
  ('التأمين الأهلي','Al Ahli Takaful','comprehensive',80,80),
  ('ولاء للتأمين','Walaa','basic',60,90),
  ('الراجحي تكافل','Al Rajhi Takaful','basic',60,100),
  ('الاتحاد التجاري','Al Etihad Commercial','basic',60,110),
  ('ساب تكافل','SABB Takaful','basic',60,120),
  ('سلامة للتأمين','Salama','limited',40,130)
ON CONFLICT (name_ar) DO NOTHING;

UPDATE public.insurance_providers SET notes_ar = 'الطوارئ فقط' WHERE name_ar = 'سلامة للتأمين';

-- 2) doctors.consultation_fee_sar
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS consultation_fee_sar numeric(10,2);

-- 3) appointments insurance fields
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS insurance_provider_id uuid REFERENCES public.insurance_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insurance_policy_number text,
  ADD COLUMN IF NOT EXISTS insurance_member_id text,
  ADD COLUMN IF NOT EXISTS insurance_status text NOT NULL DEFAULT 'none'
    CHECK (insurance_status IN ('none','pending','eligible','rejected')),
  ADD COLUMN IF NOT EXISTS insurance_coverage_percent int
    CHECK (insurance_coverage_percent IS NULL OR insurance_coverage_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS estimated_cost_sar numeric(10,2),
  ADD COLUMN IF NOT EXISTS patient_share_sar numeric(10,2);

CREATE INDEX IF NOT EXISTS appointments_insurance_provider_idx
  ON public.appointments (insurance_provider_id)
  WHERE insurance_provider_id IS NOT NULL;

-- 4) Server-side helper for eligibility + cost estimation.
-- SECURITY DEFINER so anon (public booking flow) can call it without
-- needing SELECT on doctors/insurance_providers beyond public policies.
CREATE OR REPLACE FUNCTION public.estimate_appointment_cost(
  _doctor_id uuid,
  _provider_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fee numeric(10,2);
  _coverage int;
  _tier text;
  _active boolean;
  _covered numeric(10,2);
  _share numeric(10,2);
BEGIN
  SELECT consultation_fee_sar INTO _fee FROM public.doctors WHERE id = _doctor_id;

  IF _provider_id IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'no_provider',
      'consultation_fee', _fee,
      'coverage_percent', 0,
      'estimated_cost', _fee,
      'patient_share', _fee
    );
  END IF;

  SELECT coverage_percent, coverage_tier, active
    INTO _coverage, _tier, _active
    FROM public.insurance_providers WHERE id = _provider_id;

  IF _coverage IS NULL OR _active IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'provider_inactive',
      'consultation_fee', _fee,
      'coverage_percent', 0,
      'estimated_cost', _fee,
      'patient_share', _fee
    );
  END IF;

  IF _fee IS NULL THEN
    RETURN jsonb_build_object(
      'eligible', true,
      'reason', 'fee_unknown',
      'consultation_fee', NULL,
      'coverage_percent', _coverage,
      'coverage_tier', _tier,
      'estimated_cost', NULL,
      'patient_share', NULL
    );
  END IF;

  _covered := round(_fee * _coverage / 100.0, 2);
  _share   := round(_fee - _covered, 2);

  RETURN jsonb_build_object(
    'eligible', true,
    'reason', 'ok',
    'consultation_fee', _fee,
    'coverage_percent', _coverage,
    'coverage_tier', _tier,
    'covered_amount', _covered,
    'estimated_cost', _fee,
    'patient_share', _share
  );
END $$;

GRANT EXECUTE ON FUNCTION public.estimate_appointment_cost(uuid, uuid) TO anon, authenticated;