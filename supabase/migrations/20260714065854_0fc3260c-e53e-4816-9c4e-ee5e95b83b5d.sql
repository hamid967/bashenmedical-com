
DO $$ BEGIN
  CREATE TYPE public.service_inquiry_internal_status AS ENUM (
    'new','contacted','awaiting_patient','appointment_created','completed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_inquiry_whatsapp_status AS ENUM (
    'not_opened','opened','delivery_unverified','delivered','failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_inquiry_source AS ENUM (
    'website','mobile_web','patient_portal','campaign','direct_link'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_inquiry_update_type AS ENUM (
    'created','status_change','assignment','note','public_message',
    'whatsapp_handoff','info_requested','attachment','closed','linked_appointment'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: any staff role that manages inquiries
CREATE OR REPLACE FUNCTION public.is_inquiry_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'super_admin')
    OR public.has_role(_user_id, 'support_agent')
    OR public.has_role(_user_id, 'reception');
$$;

-- =========================================================
-- 1) service_catalog
-- =========================================================
CREATE TABLE IF NOT EXISTS public.service_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  name_ar       text NOT NULL,
  name_en       text NOT NULL,
  department_id uuid,
  display_order integer NOT NULL DEFAULT 100,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.service_catalog TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_catalog public read active"
  ON public.service_catalog FOR SELECT
  USING (is_active = true);

CREATE POLICY "service_catalog staff read all"
  ON public.service_catalog FOR SELECT
  TO authenticated
  USING (public.is_inquiry_staff(auth.uid()));

CREATE POLICY "service_catalog admin write"
  ON public.service_catalog FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS service_catalog_order_idx
  ON public.service_catalog (display_order, name_ar);

INSERT INTO public.service_catalog (slug, name_ar, name_en, display_order) VALUES
  ('appointment',       'حجز موعد',                  'Book appointment',        10),
  ('specialty_inquiry', 'الاستفسار عن تخصص',         'Specialty inquiry',       20),
  ('doctor_inquiry',    'الاستفسار عن طبيب',         'Doctor inquiry',          30),
  ('offers',            'العروض والباقات',           'Offers & packages',       40),
  ('lab',               'المختبر والتحاليل',         'Lab & tests',             50),
  ('radiology',         'الأشعة',                    'Radiology',               60),
  ('dental',            'الأسنان',                   'Dental',                  70),
  ('obgyn',             'النساء والولادة',           'Obstetrics & Gynecology', 80),
  ('pediatrics',        'الأطفال',                   'Pediatrics',              90),
  ('dermatology',       'الجلدية',                   'Dermatology',            100),
  ('internal_med',      'الباطنة',                   'Internal Medicine',      110),
  ('ortho',             'العظام',                    'Orthopedics',            120),
  ('insurance',         'التأمين والموافقات',        'Insurance & approvals',  130),
  ('medical_reports',   'التقارير الطبية',           'Medical reports',        140),
  ('billing',           'الفواتير والمدفوعات',       'Billing & payments',     150),
  ('other',             'خدمة أخرى',                 'Other service',          999)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 2) service_inquiries
-- =========================================================
CREATE TABLE IF NOT EXISTS public.service_inquiries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number            text NOT NULL UNIQUE,
  user_id                   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name                 text NOT NULL,
  mobile_number             text NOT NULL,
  mobile_e164               text NOT NULL,
  email                     text,
  national_id               text,
  service_id                uuid REFERENCES public.service_catalog(id) ON DELETE SET NULL,
  service_label             text NOT NULL,
  specialty_id              uuid,
  doctor_id                 uuid,
  branch_id                 uuid,
  preferred_contact_method  text NOT NULL DEFAULT 'whatsapp',
  preferred_date            date,
  insurance_provider_id     uuid,
  notes                     text,
  source                    public.service_inquiry_source NOT NULL DEFAULT 'website',
  internal_status           public.service_inquiry_internal_status NOT NULL DEFAULT 'new',
  whatsapp_handoff_status   public.service_inquiry_whatsapp_status NOT NULL DEFAULT 'not_opened',
  whatsapp_opened_at        timestamptz,
  assigned_to               uuid,
  linked_appointment_id     uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  consent_record_id         uuid REFERENCES public.consent_records(id) ON DELETE SET NULL,
  submitter_ip_hash         text,
  user_agent                text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  closed_at                 timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_inquiries TO authenticated;
GRANT ALL ON public.service_inquiries TO service_role;

ALTER TABLE public.service_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_inquiries owner read"
  ON public.service_inquiries FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "service_inquiries owner update limited"
  ON public.service_inquiries FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "service_inquiries staff all"
  ON public.service_inquiries FOR ALL
  TO authenticated
  USING (public.is_inquiry_staff(auth.uid()))
  WITH CHECK (public.is_inquiry_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS service_inquiries_user_idx     ON public.service_inquiries (user_id);
CREATE INDEX IF NOT EXISTS service_inquiries_mobile_idx   ON public.service_inquiries (mobile_e164);
CREATE INDEX IF NOT EXISTS service_inquiries_status_idx   ON public.service_inquiries (internal_status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_inquiries_created_idx  ON public.service_inquiries (created_at DESC);

CREATE TRIGGER service_inquiries_touch
  BEFORE UPDATE ON public.service_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3) service_inquiry_updates (append-only)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.service_inquiry_updates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id     uuid NOT NULL REFERENCES public.service_inquiries(id) ON DELETE CASCADE,
  update_type    public.service_inquiry_update_type NOT NULL,
  public_message text,
  internal_note  text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.service_inquiry_updates TO authenticated;
GRANT ALL ON public.service_inquiry_updates TO service_role;

ALTER TABLE public.service_inquiry_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inquiry_updates owner read public"
  ON public.service_inquiry_updates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_inquiries si
      WHERE si.id = inquiry_id AND si.user_id = auth.uid()
    )
    AND public_message IS NOT NULL
  );

CREATE POLICY "inquiry_updates staff read"
  ON public.service_inquiry_updates FOR SELECT
  TO authenticated
  USING (public.is_inquiry_staff(auth.uid()));

CREATE POLICY "inquiry_updates staff insert"
  ON public.service_inquiry_updates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_inquiry_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.service_inquiry_updates_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'service_inquiry_updates is append-only';
END;
$$;

CREATE TRIGGER service_inquiry_updates_no_update
  BEFORE UPDATE ON public.service_inquiry_updates
  FOR EACH ROW EXECUTE FUNCTION public.service_inquiry_updates_block_mutation();

CREATE TRIGGER service_inquiry_updates_no_delete
  BEFORE DELETE ON public.service_inquiry_updates
  FOR EACH ROW EXECUTE FUNCTION public.service_inquiry_updates_block_mutation();

CREATE INDEX IF NOT EXISTS inquiry_updates_inquiry_idx
  ON public.service_inquiry_updates (inquiry_id, created_at DESC);

-- =========================================================
-- 4) Daily counter + request number generator
-- =========================================================
CREATE TABLE IF NOT EXISTS public.service_inquiry_daily_counter (
  day_key  text PRIMARY KEY,
  counter  integer NOT NULL DEFAULT 0
);

GRANT ALL ON public.service_inquiry_daily_counter TO service_role;
ALTER TABLE public.service_inquiry_daily_counter ENABLE ROW LEVEL SECURITY;
-- No policies: only SECURITY DEFINER function touches it.

CREATE OR REPLACE FUNCTION public.generate_service_inquiry_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day  text;
  v_next integer;
BEGIN
  v_day := to_char(timezone('Asia/Riyadh', now()), 'YYYYMMDD');

  INSERT INTO public.service_inquiry_daily_counter (day_key, counter)
  VALUES (v_day, 1)
  ON CONFLICT (day_key)
    DO UPDATE SET counter = public.service_inquiry_daily_counter.counter + 1
  RETURNING counter INTO v_next;

  RETURN 'BMC-WA-' || v_day || '-' || lpad(v_next::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_service_inquiry_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_service_inquiry_number() TO service_role;
