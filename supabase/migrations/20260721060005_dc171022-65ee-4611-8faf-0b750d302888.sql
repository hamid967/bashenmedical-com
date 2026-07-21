
-- ===== custom_pages: content_manager can read all + insert + update (no delete) =====
CREATE POLICY "editors read all pages"
  ON public.custom_pages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'content_manager'));

CREATE POLICY "editors insert pages"
  ON public.custom_pages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'content_manager'));

CREATE POLICY "editors update pages"
  ON public.custom_pages FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'content_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'content_manager'));

-- ===== service_catalog: content_manager can read + insert + update (no delete) =====
CREATE POLICY "editors read services"
  ON public.service_catalog FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'content_manager'));

CREATE POLICY "editors insert services"
  ON public.service_catalog FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'content_manager'));

CREATE POLICY "editors update services"
  ON public.service_catalog FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'content_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'content_manager'));
