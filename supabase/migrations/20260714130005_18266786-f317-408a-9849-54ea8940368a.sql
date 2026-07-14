-- Harden public INSERT policies: replace WITH CHECK (true) with actual validation.
-- These are public intake forms, so "permission" = valid submission shape.

-- second_opinion_requests
DROP POLICY IF EXISTS "Anyone can submit second opinion" ON public.second_opinion_requests;
CREATE POLICY "Anyone can submit second opinion"
  ON public.second_opinion_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(btrim(patient_name)) BETWEEN 2 AND 120
    AND length(btrim(phone)) BETWEEN 6 AND 30
    AND length(btrim(specialty)) BETWEEN 2 AND 80
    AND length(btrim(summary)) BETWEEN 10 AND 4000
    AND (email IS NULL OR length(email) <= 200)
    AND coalesce(array_length(upload_paths, 1), 0) <= 20
    AND status = 'new'
    AND admin_notes IS NULL
  );

-- corporate_requests
DROP POLICY IF EXISTS "Anyone can submit corporate request" ON public.corporate_requests;
CREATE POLICY "Anyone can submit corporate request"
  ON public.corporate_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(btrim(company_name)) BETWEEN 2 AND 160
    AND length(btrim(contact_name)) BETWEEN 2 AND 120
    AND length(btrim(phone)) BETWEEN 6 AND 30
    AND (email IS NULL OR length(email) <= 200)
    AND (service_type IS NULL OR length(service_type) <= 120)
    AND (notes IS NULL OR length(notes) <= 4000)
    AND (employee_count IS NULL OR (employee_count >= 0 AND employee_count <= 1000000))
    AND status = 'new'
    AND admin_notes IS NULL
  );