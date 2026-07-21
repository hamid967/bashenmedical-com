
-- ai_feature_flags: remove public read, restrict to admins
DROP POLICY IF EXISTS "public read flags" ON public.ai_feature_flags;
CREATE POLICY "admins read flags" ON public.ai_feature_flags
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
REVOKE SELECT ON public.ai_feature_flags FROM anon;

-- ai_model_routes: restrict to admins
DROP POLICY IF EXISTS "authed view routes" ON public.ai_model_routes;
CREATE POLICY "admins view routes" ON public.ai_model_routes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- ai_prompt_versions: restrict to admins
DROP POLICY IF EXISTS "authed view prompts" ON public.ai_prompt_versions;
CREATE POLICY "admins view prompts" ON public.ai_prompt_versions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
