-- 1) appointments: block anon from writing sensitive identifiers
DROP POLICY IF EXISTS "anyone create appointments" ON public.appointments;
CREATE POLICY "anyone create appointments"
ON public.appointments
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(btrim(patient_name)) BETWEEN 2 AND 120
  AND length(btrim(patient_phone)) BETWEEN 6 AND 32
  AND (patient_email IS NULL OR length(patient_email) <= 254)
  AND (notes IS NULL OR length(notes) <= 2000)
  AND appointment_date >= CURRENT_DATE
  AND status = ANY (ARRAY['new'::appointment_status,'held'::appointment_status,'pending_verification'::appointment_status])
  AND (patient_id IS NULL OR patient_id = auth.uid())
  AND (doctor_id IS NULL OR EXISTS (
    SELECT 1 FROM doctors d WHERE d.id = appointments.doctor_id AND COALESCE(d.is_active,true) = true
  ))
  AND (branch_id IS NULL OR EXISTS (
    SELECT 1 FROM branches b WHERE b.id = appointments.branch_id
  ))
  -- SECURITY: national_id may only be written by authenticated users (self)
  AND (national_id IS NULL OR auth.uid() IS NOT NULL)
  -- Ownership guard for authenticated writes
  AND (auth.uid() IS NULL OR patient_id = auth.uid() OR _appointment_belongs_to_me(patient_phone))
);

-- 2) patient_ratings: tighten insert constraints
DROP POLICY IF EXISTS "Anyone can submit rating" ON public.patient_ratings;
CREATE POLICY "Anyone can submit rating"
ON public.patient_ratings
FOR INSERT
TO anon, authenticated
WITH CHECK (
  rating BETWEEN 1 AND 5
  AND staff_reply IS NULL
  AND staff_reply_by IS NULL
  AND staff_reply_at IS NULL
  AND source = 'public'::text
  AND (patient_name IS NULL OR length(btrim(patient_name)) BETWEEN 2 AND 80)
  AND (patient_phone IS NULL OR (length(btrim(patient_phone)) BETWEEN 6 AND 32 AND patient_phone ~ '^[+0-9 ()-]+$'))
  AND (comment IS NULL OR length(comment) <= 2000)
);
