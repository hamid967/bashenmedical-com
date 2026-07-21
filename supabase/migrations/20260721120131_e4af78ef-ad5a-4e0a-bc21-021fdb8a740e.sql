
-- Enum for conversation scope
DO $$ BEGIN
  CREATE TYPE public.ai_scope AS ENUM ('guest','patient','admin','super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================= ai_conversations =================
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  anon_session_id text NULL,
  scope public.ai_scope NOT NULL DEFAULT 'guest',
  lang text NOT NULL DEFAULT 'ar',
  title text NULL,
  consent_history boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ai_conversations_user_idx ON public.ai_conversations(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ai_conversations_anon_idx ON public.ai_conversations(anon_session_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_conversations TO anon;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own conversations select" ON public.ai_conversations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own conversations write" ON public.ai_conversations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own conversations update" ON public.ai_conversations
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own conversations delete" ON public.ai_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "staff view all conversations" ON public.ai_conversations
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "guest conv insert" ON public.ai_conversations
  FOR INSERT TO anon WITH CHECK (user_id IS NULL AND scope = 'guest' AND anon_session_id IS NOT NULL);

-- ================= ai_messages =================
CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content text NOT NULL,
  tool_name text NULL,
  tokens_in int NULL,
  tokens_out int NULL,
  model text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ai_messages_conv_idx ON public.ai_messages(conversation_id, created_at);

GRANT SELECT, INSERT ON public.ai_messages TO authenticated;
GRANT SELECT, INSERT ON public.ai_messages TO anon;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own messages select" ON public.ai_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "own messages insert" ON public.ai_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "staff view all messages" ON public.ai_messages
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- ================= ai_tool_invocations =================
CREATE TABLE IF NOT EXISTS public.ai_tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  tool text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NULL,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','denied','timeout')),
  latency_ms int NULL,
  cost_usd numeric(10,6) NULL,
  actor uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_tool_conv_idx ON public.ai_tool_invocations(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ai_tool_name_idx ON public.ai_tool_invocations(tool, created_at DESC);

GRANT SELECT ON public.ai_tool_invocations TO authenticated;
GRANT ALL ON public.ai_tool_invocations TO service_role;
ALTER TABLE public.ai_tool_invocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own tools select" ON public.ai_tool_invocations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "staff view all tools" ON public.ai_tool_invocations
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- ================= ai_safety_incidents =================
CREATE TABLE IF NOT EXISTS public.ai_safety_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NULL REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  actor uuid NULL,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','high','critical')),
  action_taken text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_safety_created_idx ON public.ai_safety_incidents(created_at DESC);

GRANT SELECT ON public.ai_safety_incidents TO authenticated;
GRANT ALL ON public.ai_safety_incidents TO service_role;
ALTER TABLE public.ai_safety_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view incidents" ON public.ai_safety_incidents
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- ================= ai_usage_costs =================
CREATE TABLE IF NOT EXISTS public.ai_usage_costs (
  day date NOT NULL,
  model text NOT NULL,
  tokens_in bigint NOT NULL DEFAULT 0,
  tokens_out bigint NOT NULL DEFAULT 0,
  requests int NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (day, model)
);

GRANT SELECT ON public.ai_usage_costs TO authenticated;
GRANT ALL ON public.ai_usage_costs TO service_role;
ALTER TABLE public.ai_usage_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view costs" ON public.ai_usage_costs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- ================= ai_model_routes =================
CREATE TABLE IF NOT EXISTS public.ai_model_routes (
  route_name text PRIMARY KEY,
  model_id text NOT NULL,
  fallback_id text NULL,
  enabled boolean NOT NULL DEFAULT true,
  notes text NULL,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_model_routes TO authenticated;
GRANT ALL ON public.ai_model_routes TO service_role;
ALTER TABLE public.ai_model_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authed view routes" ON public.ai_model_routes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super manages routes" ON public.ai_model_routes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role));

-- Seed default routes (idempotent)
INSERT INTO public.ai_model_routes(route_name, model_id, fallback_id, notes) VALUES
  ('fast', 'google/gemini-3.5-flash', 'google/gemini-3.1-flash-lite', 'Router / short answers'),
  ('deep', 'openai/gpt-5.4', 'openai/gpt-5.4-mini', 'Complex tasks'),
  ('embeddings', 'openai/text-embedding-3-small', NULL, 'Search / KB embeddings'),
  ('stt', 'openai/gpt-4o-mini-transcribe', NULL, 'Speech to text'),
  ('tts', 'openai/gpt-4o-mini-tts', NULL, 'Text to speech')
ON CONFLICT (route_name) DO NOTHING;

-- ================= ai_prompt_versions =================
CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL,
  version int NOT NULL,
  content text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent, version)
);
CREATE INDEX IF NOT EXISTS ai_prompt_agent_idx ON public.ai_prompt_versions(agent, version DESC);

GRANT SELECT ON public.ai_prompt_versions TO authenticated;
GRANT ALL ON public.ai_prompt_versions TO service_role;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authed view prompts" ON public.ai_prompt_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "super manages prompts" ON public.ai_prompt_versions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role));

-- ================= ai_feature_flags =================
CREATE TABLE IF NOT EXISTS public.ai_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  notes text NULL,
  updated_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_feature_flags TO authenticated;
GRANT SELECT ON public.ai_feature_flags TO anon;
GRANT ALL ON public.ai_feature_flags TO service_role;
ALTER TABLE public.ai_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read flags" ON public.ai_feature_flags
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "super manages flags" ON public.ai_feature_flags
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role));

INSERT INTO public.ai_feature_flags(key, enabled, notes) VALUES
  ('ai.assistant.enabled', true, 'Master kill switch for Baeshen AI Assistant'),
  ('ai.assistant.voice.enabled', false, 'Enable STT/TTS'),
  ('ai.assistant.mutations.enabled', false, 'Enable mutating tools (V2)')
ON CONFLICT (key) DO NOTHING;
