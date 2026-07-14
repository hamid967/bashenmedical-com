
-- medical-reports storage policies
CREATE POLICY "patient read own medical files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='medical-reports' AND EXISTS(
    SELECT 1 FROM public.medical_reports mr
    JOIN public.patients p ON p.id=mr.patient_id
    WHERE mr.file_path = storage.objects.name
      AND p.profile_id=auth.uid()
      AND mr.status='published' AND mr.revoked_at IS NULL));
CREATE POLICY "staff read medical files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='medical-reports' AND public.has_permission(auth.uid(),'reports.medical.view'));
CREATE POLICY "staff upload medical files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='medical-reports' AND public.has_permission(auth.uid(),'reports.medical.publish'));
CREATE POLICY "staff update medical files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='medical-reports' AND public.has_permission(auth.uid(),'reports.medical.publish'))
  WITH CHECK (bucket_id='medical-reports' AND public.has_permission(auth.uid(),'reports.medical.publish'));
CREATE POLICY "staff delete medical files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='medical-reports' AND public.has_permission(auth.uid(),'reports.medical.revoke'));

-- insurance-cards storage policies
CREATE POLICY "patient read own insurance cards" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='insurance-cards' AND owner=auth.uid());
CREATE POLICY "patient upload own insurance cards" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='insurance-cards' AND owner=auth.uid());
CREATE POLICY "patient update own insurance cards" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='insurance-cards' AND owner=auth.uid())
  WITH CHECK (bucket_id='insurance-cards' AND owner=auth.uid());
CREATE POLICY "patient delete own insurance cards" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='insurance-cards' AND owner=auth.uid());
CREATE POLICY "insurance staff read cards" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='insurance-cards' AND public.has_permission(auth.uid(),'insurance.view'));

-- invoices-pdf storage policies
CREATE POLICY "patient read own invoices pdf" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='invoices-pdf' AND EXISTS(
    SELECT 1 FROM public.invoices i JOIN public.patients p ON p.id=i.patient_id
    WHERE i.pdf_path = storage.objects.name AND p.profile_id=auth.uid()));
CREATE POLICY "billing read invoices pdf" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='invoices-pdf' AND public.has_permission(auth.uid(),'billing.view'));
CREATE POLICY "billing upload invoices pdf" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='invoices-pdf' AND public.has_permission(auth.uid(),'billing.manage'));
CREATE POLICY "billing update invoices pdf" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='invoices-pdf' AND public.has_permission(auth.uid(),'billing.manage'))
  WITH CHECK (bucket_id='invoices-pdf' AND public.has_permission(auth.uid(),'billing.manage'));
CREATE POLICY "billing delete invoices pdf" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='invoices-pdf' AND public.has_permission(auth.uid(),'billing.manage'));
