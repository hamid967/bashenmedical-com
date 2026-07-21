
CREATE TABLE IF NOT EXISTS public.media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  width INT,
  height INT,
  alt_text TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_library TO authenticated;
GRANT ALL ON public.media_library TO service_role;

ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_select_staff" ON public.media_library FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_manager'));

CREATE POLICY "media_insert_staff" ON public.media_library FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_manager'));

CREATE POLICY "media_update_owner" ON public.media_library FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'super_admin'))
WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "media_delete_owner" ON public.media_library FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'super_admin'));

CREATE INDEX IF NOT EXISTS idx_media_library_created ON public.media_library(created_at DESC);

-- storage.objects policies for site-media bucket
CREATE POLICY "site_media_read_staff" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'site-media' AND (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_manager')));

CREATE POLICY "site_media_insert_staff" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'site-media' AND (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'content_manager')));

CREATE POLICY "site_media_delete_owner" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'site-media' AND public.has_role(auth.uid(),'super_admin'));
