-- 1) Appointments: bind read/update to patient_id when present
DROP POLICY IF EXISTS "users read own appointments" ON public.appointments;
DROP POLICY IF EXISTS "users cancel own appointments" ON public.appointments;
DROP POLICY IF EXISTS "users reschedule own appointments" ON public.appointments;

CREATE POLICY "users read own appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  (patient_id IS NOT NULL AND patient_id = auth.uid())
  OR (patient_id IS NULL AND _appointment_belongs_to_me(patient_phone))
);

CREATE POLICY "users cancel own appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  ((patient_id IS NOT NULL AND patient_id = auth.uid())
   OR (patient_id IS NULL AND _appointment_belongs_to_me(patient_phone)))
  AND status = ANY (ARRAY['new'::appointment_status, 'confirmed'::appointment_status])
  AND appointment_date >= CURRENT_DATE
)
WITH CHECK (
  ((patient_id IS NOT NULL AND patient_id = auth.uid())
   OR (patient_id IS NULL AND _appointment_belongs_to_me(patient_phone)))
  AND status = 'cancelled'::appointment_status
);

CREATE POLICY "users reschedule own appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  ((patient_id IS NOT NULL AND patient_id = auth.uid())
   OR (patient_id IS NULL AND _appointment_belongs_to_me(patient_phone)))
  AND status = ANY (ARRAY['new'::appointment_status, 'confirmed'::appointment_status])
  AND appointment_date >= CURRENT_DATE
)
WITH CHECK (
  ((patient_id IS NOT NULL AND patient_id = auth.uid())
   OR (patient_id IS NULL AND _appointment_belongs_to_me(patient_phone)))
  AND status = ANY (ARRAY['new'::appointment_status, 'confirmed'::appointment_status])
  AND appointment_date >= CURRENT_DATE
);

-- 2) Service catalog: consolidate overlapping policies
DROP POLICY IF EXISTS "editors insert services" ON public.service_catalog;
DROP POLICY IF EXISTS "editors read services" ON public.service_catalog;
DROP POLICY IF EXISTS "editors update services" ON public.service_catalog;
DROP POLICY IF EXISTS "owners manage service catalog" ON public.service_catalog;
DROP POLICY IF EXISTS "service_catalog admin write" ON public.service_catalog;

-- Keep: "service_catalog public read active" and "service_catalog staff read all"

-- Content managers: insert/update (no delete)
CREATE POLICY "service_catalog editors write"
ON public.service_catalog
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'content_manager'::app_role));

CREATE POLICY "service_catalog editors update"
ON public.service_catalog
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'content_manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'content_manager'::app_role));

-- Admins & super_admins: full control
CREATE POLICY "service_catalog admin all"
ON public.service_catalog
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));