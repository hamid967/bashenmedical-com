
-- Attachments metadata for service inquiries
CREATE TABLE public.service_inquiry_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id UUID NOT NULL REFERENCES public.service_inquiries(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX service_inquiry_attachments_inquiry_idx
  ON public.service_inquiry_attachments (inquiry_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.service_inquiry_attachments TO authenticated;
GRANT ALL ON public.service_inquiry_attachments TO service_role;

ALTER TABLE public.service_inquiry_attachments ENABLE ROW LEVEL SECURITY;

-- Owner (patient) can read attachments of their own inquiry
CREATE POLICY "inquiry_attachments owner read"
  ON public.service_inquiry_attachments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.service_inquiries si
    WHERE si.id = inquiry_id AND si.user_id = auth.uid()
  ));

-- Owner (patient) can add attachments to their own inquiry (up to 5, enforced in server fn too)
CREATE POLICY "inquiry_attachments owner insert"
  ON public.service_inquiry_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.service_inquiries si
      WHERE si.id = inquiry_id AND si.user_id = auth.uid()
    )
  );

-- Owner can delete their own uploads while the inquiry is not closed
CREATE POLICY "inquiry_attachments owner delete"
  ON public.service_inquiry_attachments FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.service_inquiries si
      WHERE si.id = inquiry_id
        AND si.user_id = auth.uid()
        AND si.closed_at IS NULL
    )
  );

-- Staff can read/insert/delete all attachments
CREATE POLICY "inquiry_attachments staff all"
  ON public.service_inquiry_attachments
  TO authenticated
  USING (public.is_inquiry_staff(auth.uid()))
  WITH CHECK (public.is_inquiry_staff(auth.uid()));

-- Storage policies on the inquiry-attachments bucket.
-- Path convention: <auth.uid()>/<inquiry_id>/<file>
CREATE POLICY "inquiry_attach owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'inquiry-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "inquiry_attach owner select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inquiry-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "inquiry_attach owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inquiry-attachments'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "inquiry_attach staff select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inquiry-attachments'
    AND public.is_inquiry_staff(auth.uid())
  );

CREATE POLICY "inquiry_attach staff delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inquiry-attachments'
    AND public.is_inquiry_staff(auth.uid())
  );
