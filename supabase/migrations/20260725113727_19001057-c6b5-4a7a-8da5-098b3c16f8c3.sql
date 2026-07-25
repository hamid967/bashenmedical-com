
-- 1) no_show_predictions
CREATE TABLE public.no_show_predictions (
  appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE CASCADE,
  risk numeric(4,3) NOT NULL CHECK (risk >= 0 AND risk <= 1),
  top_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text,
  model text,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.no_show_predictions TO authenticated;
GRANT ALL ON public.no_show_predictions TO service_role;
ALTER TABLE public.no_show_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read no_show_predictions"
  ON public.no_show_predictions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Service manages no_show_predictions"
  ON public.no_show_predictions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_no_show_predictions_risk ON public.no_show_predictions (risk DESC, computed_at DESC);

-- 2) ai_recommendations
CREATE TABLE public.ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  scope_id text,
  kind text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed')),
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, UPDATE ON public.ai_recommendations TO authenticated;
GRANT ALL ON public.ai_recommendations TO service_role;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ai_recommendations"
  ON public.ai_recommendations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Admins update ai_recommendations status"
  ON public.ai_recommendations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Service manages ai_recommendations"
  ON public.ai_recommendations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_ai_recommendations_status ON public.ai_recommendations (status, generated_at DESC);

-- 3) complaints AI classification columns
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS ai_category text,
  ADD COLUMN IF NOT EXISTS ai_severity text,
  ADD COLUMN IF NOT EXISTS ai_suggested_owner text,
  ADD COLUMN IF NOT EXISTS ai_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_model text;
