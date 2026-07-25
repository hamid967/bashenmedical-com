
-- 1) Tables (create both before any policies reference them)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
GRANT SELECT ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 2) Policies on tenant tables
DROP POLICY IF EXISTS "org readable to members" ON public.organizations;
CREATE POLICY "org readable to members" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = organizations.id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "super_admin manages orgs" ON public.organizations;
CREATE POLICY "super_admin manages orgs" ON public.organizations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "member sees own membership" ON public.organization_members;
CREATE POLICY "member sees own membership" ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "super_admin manages members" ON public.organization_members;
CREATE POLICY "super_admin manages members" ON public.organization_members
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- 3) Security-definer helpers
CREATE OR REPLACE FUNCTION public.user_org_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.user_in_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
  ) OR public.has_role(_user_id, 'super_admin'::app_role)
$$;

-- 4) Default tenant + membership backfill for existing role holders
INSERT INTO public.organizations (slug, name_ar, name_en)
VALUES ('default', 'باعشن الطبي', 'Baeshen Medical')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT
  (SELECT id FROM public.organizations WHERE slug = 'default'),
  ur.user_id,
  ur.role::text
FROM public.user_roles ur
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- 5) Add organization_id to AI Insights tables
ALTER TABLE public.no_show_predictions   ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_recommendations    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_conversations      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_stream_events      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_safety_incidents   ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_tool_invocations   ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_usage_costs        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.complaints            ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill
WITH d AS (SELECT id FROM public.organizations WHERE slug = 'default')
UPDATE public.no_show_predictions SET organization_id = (SELECT id FROM d) WHERE organization_id IS NULL;
WITH d AS (SELECT id FROM public.organizations WHERE slug = 'default')
UPDATE public.ai_recommendations SET organization_id = (SELECT id FROM d) WHERE organization_id IS NULL;
WITH d AS (SELECT id FROM public.organizations WHERE slug = 'default')
UPDATE public.ai_conversations SET organization_id = (SELECT id FROM d) WHERE organization_id IS NULL;
WITH d AS (SELECT id FROM public.organizations WHERE slug = 'default')
UPDATE public.ai_stream_events SET organization_id = (SELECT id FROM d) WHERE organization_id IS NULL;
WITH d AS (SELECT id FROM public.organizations WHERE slug = 'default')
UPDATE public.ai_safety_incidents SET organization_id = (SELECT id FROM d) WHERE organization_id IS NULL;
WITH d AS (SELECT id FROM public.organizations WHERE slug = 'default')
UPDATE public.ai_tool_invocations SET organization_id = (SELECT id FROM d) WHERE organization_id IS NULL;
WITH d AS (SELECT id FROM public.organizations WHERE slug = 'default')
UPDATE public.ai_usage_costs SET organization_id = (SELECT id FROM d) WHERE organization_id IS NULL;
WITH d AS (SELECT id FROM public.organizations WHERE slug = 'default')
UPDATE public.complaints SET organization_id = (SELECT id FROM d) WHERE organization_id IS NULL;

-- Default new rows to default tenant
DO $$
DECLARE _def UUID := (SELECT id FROM public.organizations WHERE slug='default');
BEGIN
  EXECUTE format('ALTER TABLE public.no_show_predictions ALTER COLUMN organization_id SET DEFAULT %L', _def);
  EXECUTE format('ALTER TABLE public.ai_recommendations ALTER COLUMN organization_id SET DEFAULT %L', _def);
  EXECUTE format('ALTER TABLE public.ai_conversations ALTER COLUMN organization_id SET DEFAULT %L', _def);
  EXECUTE format('ALTER TABLE public.ai_stream_events ALTER COLUMN organization_id SET DEFAULT %L', _def);
  EXECUTE format('ALTER TABLE public.ai_safety_incidents ALTER COLUMN organization_id SET DEFAULT %L', _def);
  EXECUTE format('ALTER TABLE public.ai_tool_invocations ALTER COLUMN organization_id SET DEFAULT %L', _def);
  EXECUTE format('ALTER TABLE public.ai_usage_costs ALTER COLUMN organization_id SET DEFAULT %L', _def);
  EXECUTE format('ALTER TABLE public.complaints ALTER COLUMN organization_id SET DEFAULT %L', _def);
END $$;

CREATE INDEX IF NOT EXISTS idx_nsp_org       ON public.no_show_predictions(organization_id);
CREATE INDEX IF NOT EXISTS idx_airec_org     ON public.ai_recommendations(organization_id);
CREATE INDEX IF NOT EXISTS idx_aiconv_org    ON public.ai_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_aistream_org  ON public.ai_stream_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_aisafety_org  ON public.ai_safety_incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_aitool_org    ON public.ai_tool_invocations(organization_id);
CREATE INDEX IF NOT EXISTS idx_aiusage_org   ON public.ai_usage_costs(organization_id);
CREATE INDEX IF NOT EXISTS idx_complaints_org ON public.complaints(organization_id);

-- 6) Tenant-scoped RLS on AI Insights tables

DROP POLICY IF EXISTS "Admins read no_show_predictions" ON public.no_show_predictions;
CREATE POLICY "Admins read no_show_predictions" ON public.no_show_predictions
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND public.user_in_org(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "Admins read ai_recommendations" ON public.ai_recommendations;
CREATE POLICY "Admins read ai_recommendations" ON public.ai_recommendations
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND public.user_in_org(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "Admins update ai_recommendations status" ON public.ai_recommendations;
CREATE POLICY "Admins update ai_recommendations status" ON public.ai_recommendations
  FOR UPDATE TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND public.user_in_org(auth.uid(), organization_id)
  )
  WITH CHECK (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND public.user_in_org(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff view all conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "staff view tenant conversations" ON public.ai_conversations;
CREATE POLICY "staff view tenant conversations" ON public.ai_conversations
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND public.user_in_org(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff view all messages" ON public.ai_messages;
DROP POLICY IF EXISTS "staff view tenant messages" ON public.ai_messages;
CREATE POLICY "staff view tenant messages" ON public.ai_messages
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND public.user_in_org(auth.uid(), c.organization_id)
    )
  );

DROP POLICY IF EXISTS "ai_stream_events read admin" ON public.ai_stream_events;
CREATE POLICY "ai_stream_events read admin" ON public.ai_stream_events
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND public.user_in_org(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff view incidents" ON public.ai_safety_incidents;
CREATE POLICY "staff view incidents" ON public.ai_safety_incidents
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND public.user_in_org(auth.uid(), organization_id)
  );

DROP POLICY IF EXISTS "staff view all tools" ON public.ai_tool_invocations;
DROP POLICY IF EXISTS "staff view tenant tools" ON public.ai_tool_invocations;
CREATE POLICY "staff view tenant tools" ON public.ai_tool_invocations
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND (
      public.user_in_org(auth.uid(), ai_tool_invocations.organization_id)
      OR EXISTS (
        SELECT 1 FROM public.ai_conversations c
        WHERE c.id = ai_tool_invocations.conversation_id
          AND public.user_in_org(auth.uid(), c.organization_id)
      )
    )
  );

DROP POLICY IF EXISTS "staff view costs" ON public.ai_usage_costs;
CREATE POLICY "staff view costs" ON public.ai_usage_costs
  FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role))
    AND public.user_in_org(auth.uid(), organization_id)
  );
