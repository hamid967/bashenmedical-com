
-- branch_excellence_centers
DROP POLICY "Branch admins manage their branch links" ON public.branch_excellence_centers;
CREATE POLICY "Branch admins manage their branch links" ON public.branch_excellence_centers
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND has_branch_access(auth.uid(), branch_id)))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR (has_role(auth.uid(), 'admin'::app_role) AND has_branch_access(auth.uid(), branch_id)));

-- corporate_requests
DROP POLICY "Admins delete corporate requests" ON public.corporate_requests;
CREATE POLICY "Admins delete corporate requests" ON public.corporate_requests
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY "Admins read corporate requests" ON public.corporate_requests;
CREATE POLICY "Admins read corporate requests" ON public.corporate_requests
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY "Admins update corporate requests" ON public.corporate_requests;
CREATE POLICY "Admins update corporate requests" ON public.corporate_requests
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- excellence_centers
DROP POLICY "Admins manage excellence centers" ON public.excellence_centers;
CREATE POLICY "Admins manage excellence centers" ON public.excellence_centers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- health_articles admin write
DROP POLICY "health_articles admin write" ON public.health_articles;
CREATE POLICY "health_articles admin write" ON public.health_articles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- health_categories admin write
DROP POLICY "health_categories admin write" ON public.health_categories;
CREATE POLICY "health_categories admin write" ON public.health_categories
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- insurance_verifications update
DROP POLICY "Users can update their own insurance verifications" ON public.insurance_verifications;
CREATE POLICY "Users can update their own insurance verifications" ON public.insurance_verifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- patient_stories admin policies
DROP POLICY "Admins manage stories" ON public.patient_stories;
CREATE POLICY "Admins manage stories" ON public.patient_stories
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY "Admins read all stories" ON public.patient_stories;
CREATE POLICY "Admins read all stories" ON public.patient_stories
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- refunds patient policies
DROP POLICY "patient cancel own pending refund" ON public.refunds;
CREATE POLICY "patient cancel own pending refund" ON public.refunds
  FOR UPDATE TO authenticated
  USING ((status = 'pending'::text) AND (requested_by = auth.uid()))
  WITH CHECK ((status = ANY (ARRAY['pending'::text, 'canceled'::text])) AND (requested_by = auth.uid()));
DROP POLICY "patient read own refunds" ON public.refunds;
CREATE POLICY "patient read own refunds" ON public.refunds
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ((payments pay
      JOIN invoices inv ON ((inv.id = pay.invoice_id)))
      JOIN patients pt ON ((pt.id = inv.patient_id)))
    WHERE ((pay.id = refunds.payment_id) AND (pt.profile_id = auth.uid()))
  ));
DROP POLICY "patient request own refund" ON public.refunds;
CREATE POLICY "patient request own refund" ON public.refunds
  FOR INSERT TO authenticated
  WITH CHECK ((status = 'pending'::text) AND (requested_by = auth.uid()) AND (approved_by IS NULL) AND (is_mock = false) AND (EXISTS (
    SELECT 1 FROM ((payments pay
      JOIN invoices inv ON ((inv.id = pay.invoice_id)))
      JOIN patients pt ON ((pt.id = inv.patient_id)))
    WHERE ((pay.id = refunds.payment_id) AND (pt.profile_id = auth.uid()))
  )));

-- second_opinion_requests admin policies
DROP POLICY "Admins delete second opinion" ON public.second_opinion_requests;
CREATE POLICY "Admins delete second opinion" ON public.second_opinion_requests
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY "Admins read second opinion" ON public.second_opinion_requests;
CREATE POLICY "Admins read second opinion" ON public.second_opinion_requests
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY "Admins update second opinion" ON public.second_opinion_requests;
CREATE POLICY "Admins update second opinion" ON public.second_opinion_requests
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
