
-- Enums
DO $$ BEGIN
  CREATE TYPE public.cms_kind AS ENUM (
    'home','nav','footer','hero','service','specialty','doctor','branch',
    'offer','announcement','article','faq','insurance','contact','hours',
    'banner','intro','whatsapp','policy','page','seo_defaults'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cms_status AS ENUM (
    'draft','in_review','approved','scheduled','published','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cms_review_decision AS ENUM ('approved','rejected','changes_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ cms_entries ============
CREATE TABLE IF NOT EXISTS public.cms_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.cms_kind NOT NULL,
  entity_id uuid NULL,
  slug text NULL,
  title text NULL,
  status public.cms_status NOT NULL DEFAULT 'draft',
  current_version_id uuid NULL,
  locale_completeness jsonb NOT NULL DEFAULT '{"ar":0,"en":0}'::jsonb,
  scheduled_at timestamptz NULL,
  published_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_entries_kind_entity_slug_uniq
  ON public.cms_entries(kind, COALESCE(entity_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(slug,''));

GRANT SELECT, INSERT, UPDATE ON public.cms_entries TO authenticated;
GRANT SELECT ON public.cms_entries TO anon;
GRANT ALL ON public.cms_entries TO service_role;

ALTER TABLE public.cms_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_entries_public_read_published" ON public.cms_entries
  FOR SELECT TO anon USING (status = 'published');

CREATE POLICY "cms_entries_staff_read" ON public.cms_entries
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE POLICY "cms_entries_editor_insert" ON public.cms_entries
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE POLICY "cms_entries_editor_update" ON public.cms_entries
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS cms_entries_kind_status_idx ON public.cms_entries(kind, status);
CREATE INDEX IF NOT EXISTS cms_entries_scheduled_idx ON public.cms_entries(scheduled_at) WHERE status='scheduled';

-- ============ cms_versions ============
CREATE TABLE IF NOT EXISTS public.cms_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.cms_entries(id) ON DELETE CASCADE,
  version_no int NOT NULL,
  payload_ar jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_en jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_ids uuid[] NOT NULL DEFAULT '{}',
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  og_image_url text NULL,
  author_id uuid NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entry_id, version_no)
);

GRANT SELECT, INSERT ON public.cms_versions TO authenticated;
GRANT ALL ON public.cms_versions TO service_role;

ALTER TABLE public.cms_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_versions_staff_read" ON public.cms_versions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE POLICY "cms_versions_staff_insert" ON public.cms_versions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS cms_versions_entry_idx ON public.cms_versions(entry_id, version_no DESC);

-- ============ cms_reviews ============
CREATE TABLE IF NOT EXISTS public.cms_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.cms_versions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  decision public.cms_review_decision NOT NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cms_reviews TO authenticated;
GRANT ALL ON public.cms_reviews TO service_role;

ALTER TABLE public.cms_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_reviews_staff_read" ON public.cms_reviews
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE POLICY "cms_reviews_reviewer_insert" ON public.cms_reviews
  FOR INSERT TO authenticated WITH CHECK (
    (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
    AND reviewer_id = auth.uid()
  );

-- ============ cms_schedule ============
CREATE TABLE IF NOT EXISTS public.cms_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.cms_versions(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.cms_entries(id) ON DELETE CASCADE,
  publish_at timestamptz NOT NULL,
  unpublish_at timestamptz NULL,
  job_state text NOT NULL DEFAULT 'pending',
  ran_at timestamptz NULL,
  error text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.cms_schedule TO authenticated;
GRANT ALL ON public.cms_schedule TO service_role;

ALTER TABLE public.cms_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_schedule_staff_read" ON public.cms_schedule
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE POLICY "cms_schedule_admin_insert" ON public.cms_schedule
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE POLICY "cms_schedule_admin_update" ON public.cms_schedule
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS cms_schedule_pending_idx ON public.cms_schedule(publish_at) WHERE job_state='pending';

-- ============ cms_audit ============ (immutable)
CREATE TABLE IF NOT EXISTS public.cms_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NULL REFERENCES public.cms_entries(id) ON DELETE SET NULL,
  version_id uuid NULL REFERENCES public.cms_versions(id) ON DELETE SET NULL,
  actor_id uuid NULL,
  action text NOT NULL,
  before_snapshot jsonb NULL,
  after_snapshot jsonb NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.cms_audit TO authenticated;
GRANT ALL ON public.cms_audit TO service_role;

ALTER TABLE public.cms_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_audit_staff_read" ON public.cms_audit
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE POLICY "cms_audit_staff_insert" ON public.cms_audit
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.cms_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'cms_audit is append-only';
END; $$;

DROP TRIGGER IF EXISTS cms_audit_no_update ON public.cms_audit;
CREATE TRIGGER cms_audit_no_update BEFORE UPDATE ON public.cms_audit
  FOR EACH ROW EXECUTE FUNCTION public.cms_audit_immutable();

DROP TRIGGER IF EXISTS cms_audit_no_delete ON public.cms_audit;
CREATE TRIGGER cms_audit_no_delete BEFORE DELETE ON public.cms_audit
  FOR EACH ROW EXECUTE FUNCTION public.cms_audit_immutable();

CREATE INDEX IF NOT EXISTS cms_audit_entry_idx ON public.cms_audit(entry_id, created_at DESC);

-- ============ cms_preview_tokens ============
CREATE TABLE IF NOT EXISTS public.cms_preview_tokens (
  token text PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES public.cms_versions(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES public.cms_entries(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.cms_preview_tokens TO authenticated;
GRANT ALL ON public.cms_preview_tokens TO service_role;

ALTER TABLE public.cms_preview_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_preview_staff_all" ON public.cms_preview_tokens
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'editor'::public.app_role)
    OR public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.cms_entries_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS cms_entries_updated_at ON public.cms_entries;
CREATE TRIGGER cms_entries_updated_at BEFORE UPDATE ON public.cms_entries
  FOR EACH ROW EXECUTE FUNCTION public.cms_entries_touch_updated_at();
