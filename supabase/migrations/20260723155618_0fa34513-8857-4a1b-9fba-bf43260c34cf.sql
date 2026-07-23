
CREATE TABLE public.dependent_verification_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dependent_id UUID NOT NULL REFERENCES public.dependents(id) ON DELETE CASCADE,
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected','cancelled')),
  relationship_claimed TEXT NOT NULL
    CHECK (relationship_claimed IN ('child','spouse','parent','sibling','other')),
  national_id_last4 TEXT CHECK (national_id_last4 IS NULL OR national_id_last4 ~ '^\d{4}$'),
  guardian_notes TEXT,
  reviewer_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dvr_dependent ON public.dependent_verification_requests(dependent_id);
CREATE INDEX idx_dvr_guardian ON public.dependent_verification_requests(guardian_user_id);
CREATE INDEX idx_dvr_status ON public.dependent_verification_requests(status);

GRANT SELECT, INSERT, UPDATE ON public.dependent_verification_requests TO authenticated;
GRANT ALL ON public.dependent_verification_requests TO service_role;

ALTER TABLE public.dependent_verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardians read own verification requests"
  ON public.dependent_verification_requests FOR SELECT TO authenticated
  USING (guardian_user_id = auth.uid());

CREATE POLICY "Guardians create verification requests"
  ON public.dependent_verification_requests FOR INSERT TO authenticated
  WITH CHECK (
    guardian_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.dependents d WHERE d.id = dependent_id AND d.guardian_user_id = auth.uid())
  );

CREATE POLICY "Guardians cancel own pending requests"
  ON public.dependent_verification_requests FOR UPDATE TO authenticated
  USING (guardian_user_id = auth.uid() AND status IN ('submitted','under_review'))
  WITH CHECK (guardian_user_id = auth.uid() AND status IN ('submitted','under_review','cancelled'));

CREATE POLICY "Staff read all verification requests"
  ON public.dependent_verification_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
  );

CREATE POLICY "Staff review verification requests"
  ON public.dependent_verification_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
  );

CREATE TABLE public.dependent_verification_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.dependent_verification_requests(id) ON DELETE CASCADE,
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dvd_request ON public.dependent_verification_documents(request_id);

GRANT SELECT, INSERT, DELETE ON public.dependent_verification_documents TO authenticated;
GRANT ALL ON public.dependent_verification_documents TO service_role;

ALTER TABLE public.dependent_verification_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardians manage own verification docs"
  ON public.dependent_verification_documents FOR ALL TO authenticated
  USING (guardian_user_id = auth.uid())
  WITH CHECK (guardian_user_id = auth.uid());

CREATE POLICY "Staff read verification docs"
  ON public.dependent_verification_documents FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'reception')
  );

CREATE OR REPLACE FUNCTION public.sync_dependent_from_verification_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    UPDATE public.dependents
      SET verified = true, verification_status = 'verified',
          verification_method = 'documents', verified_at = now(),
          verified_by = NEW.reviewer_id, updated_at = now()
      WHERE id = NEW.dependent_id;
  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.dependents
      SET verified = false, verification_status = 'rejected', updated_at = now()
      WHERE id = NEW.dependent_id;
  ELSIF NEW.status IN ('submitted','under_review') THEN
    UPDATE public.dependents
      SET verification_status = 'pending', verification_method = 'documents', updated_at = now()
      WHERE id = NEW.dependent_id AND verification_status <> 'verified';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_dvr_sync_dependent
  AFTER INSERT OR UPDATE OF status ON public.dependent_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_dependent_from_verification_request();

CREATE TRIGGER trg_dvr_updated_at
  BEFORE UPDATE ON public.dependent_verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Guardians read own verification files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dependent-verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Guardians upload verification files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dependent-verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Guardians delete own verification files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dependent-verification-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Staff read all verification files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dependent-verification-docs'
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'reception')
    )
  );
