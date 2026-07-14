-- appointment_waitlist: managed via SECURITY DEFINER RPCs; admins can view/manage directly.
CREATE POLICY "Admins can view appointment waitlist"
  ON public.appointment_waitlist
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Admins can manage appointment waitlist"
  ON public.appointment_waitlist
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- service_inquiry_daily_counter: internal, updated by triggers; admins read-only.
CREATE POLICY "Admins can view daily counter"
  ON public.service_inquiry_daily_counter
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );