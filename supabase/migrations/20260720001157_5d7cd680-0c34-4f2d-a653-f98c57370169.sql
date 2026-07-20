
DROP POLICY IF EXISTS "authenticated read settings" ON public.system_settings;

CREATE POLICY "staff read settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'reception'::app_role)
);
