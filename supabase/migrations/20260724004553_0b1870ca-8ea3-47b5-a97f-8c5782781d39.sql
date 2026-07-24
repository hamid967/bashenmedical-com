
-- Enums
DO $$ BEGIN
  CREATE TYPE public.content_item_type AS ENUM (
    'announcement','offer','screening','new_service','reminder',
    'doctor_spotlight','nearest_slot','suggested_service'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.content_item_status AS ENUM (
    'draft','review','approved','scheduled','published','archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main table
CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.content_item_type NOT NULL,
  status public.content_item_status NOT NULL DEFAULT 'draft',
  title_ar text NOT NULL,
  title_en text NOT NULL,
  body_ar text,
  body_en text,
  excerpt_ar text,
  excerpt_en text,
  image_url text,
  cta_label_ar text,
  cta_label_en text,
  cta_href text,
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer NOT NULL DEFAULT 0,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  specialty_id uuid REFERENCES public.specialties(id) ON DELETE SET NULL,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_promotional boolean NOT NULL DEFAULT false,
  disabled_at timestamptz,
  surface text NOT NULL DEFAULT 'dashboard_bento',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_promotional_types_ck CHECK (
    NOT is_promotional OR type NOT IN ('screening','reminder')
  ),
  CONSTRAINT content_window_ck CHECK (
    starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at
  )
);

CREATE INDEX IF NOT EXISTS content_items_active_idx
  ON public.content_items (status, disabled_at, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS content_items_type_priority_idx
  ON public.content_items (type, priority DESC);
CREATE INDEX IF NOT EXISTS content_items_branch_idx
  ON public.content_items (branch_id);

GRANT SELECT ON public.content_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

-- Patients can read only live, non-disabled items
CREATE POLICY "content_items_public_read_live"
  ON public.content_items FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND disabled_at IS NULL
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >  now())
  );

-- Editors / admins have full access
CREATE POLICY "content_items_editors_all"
  ON public.content_items FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'content_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'content_manager')
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_content_items_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS content_items_updated_at ON public.content_items;
CREATE TRIGGER content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_items_updated_at();

-- Version history
CREATE TABLE IF NOT EXISTS public.content_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  snapshot jsonb NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_item_versions_item_idx
  ON public.content_item_versions (item_id, created_at DESC);

GRANT SELECT, INSERT ON public.content_item_versions TO authenticated;
GRANT ALL ON public.content_item_versions TO service_role;
ALTER TABLE public.content_item_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_versions_editors_only"
  ON public.content_item_versions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'content_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'content_manager')
  );

-- Impression tracking
CREATE TABLE IF NOT EXISTS public.content_impressions (
  id bigserial PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  surface text,
  shown_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_impressions_item_idx
  ON public.content_impressions (item_id, shown_at DESC);

GRANT INSERT ON public.content_impressions TO authenticated;
GRANT SELECT ON public.content_impressions TO authenticated;
GRANT ALL ON public.content_impressions TO service_role;
ALTER TABLE public.content_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_impressions_insert_self"
  ON public.content_impressions FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "content_impressions_editors_read"
  ON public.content_impressions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'content_manager')
  );

-- Click tracking
CREATE TABLE IF NOT EXISTS public.content_clicks (
  id bigserial PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  surface text,
  href_at_click text,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_clicks_item_idx
  ON public.content_clicks (item_id, clicked_at DESC);

GRANT INSERT ON public.content_clicks TO authenticated;
GRANT SELECT ON public.content_clicks TO authenticated;
GRANT ALL ON public.content_clicks TO service_role;
ALTER TABLE public.content_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_clicks_insert_self"
  ON public.content_clicks FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "content_clicks_editors_read"
  ON public.content_clicks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'content_manager')
  );
