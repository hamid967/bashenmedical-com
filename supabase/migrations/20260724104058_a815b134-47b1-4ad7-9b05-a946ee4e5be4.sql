
-- Fix 1: appointments_patient_id_self_assign
-- Prevent authenticated users from creating appointments attached to another
-- user's phone number. Guests (anon) unchanged. Authenticated inserts must
-- either self-assign patient_id or use their own profile phone.
DROP POLICY IF EXISTS "anyone create appointments" ON public.appointments;
CREATE POLICY "anyone create appointments"
ON public.appointments
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(btrim(patient_name)) BETWEEN 2 AND 120
  AND length(btrim(patient_phone)) BETWEEN 6 AND 32
  AND appointment_date >= CURRENT_DATE
  AND status = ANY (ARRAY['new'::appointment_status, 'held'::appointment_status, 'pending_verification'::appointment_status])
  AND (patient_id IS NULL OR patient_id = auth.uid())
  AND (
    doctor_id IS NULL
    OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = appointments.doctor_id AND COALESCE(d.is_active, true) = true)
  )
  AND (
    branch_id IS NULL
    OR EXISTS (SELECT 1 FROM public.branches b WHERE b.id = appointments.branch_id)
  )
  AND (
    -- Guests can still book anonymously (they cannot read anything back).
    auth.uid() IS NULL
    -- Signed-in users must own the row explicitly...
    OR patient_id = auth.uid()
    -- ...or the phone must actually be theirs (verified via profile match).
    OR public._appointment_belongs_to_me(patient_phone)
  )
);

-- Fix 2: user_roles_admin_view_all_roles_no_branch_scope
-- Only super_admins see every row. Branch-scoped admins only see roles
-- assigned inside a branch they have access to (or global roles).
DROP POLICY IF EXISTS "admins view all roles" ON public.user_roles;
CREATE POLICY "admins view roles in accessible branches"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND (
      is_global = true
      OR (branch_id IS NOT NULL AND public.has_branch_access(auth.uid(), branch_id))
    )
  )
);

-- Fix 3: web_vitals_insert_unbounded_public
-- Tighten the anonymous insert policy: constrain the metric name to a known
-- allow-list so spam payloads with arbitrary strings are rejected at the DB
-- edge (defense-in-depth on top of application rate limiting).
DROP POLICY IF EXISTS "anyone can insert vitals" ON public.web_vitals;
CREATE POLICY "anyone can insert vitals"
ON public.web_vitals
FOR INSERT
TO anon, authenticated
WITH CHECK (
  value >= 0::double precision
  AND value < 600000::double precision
  AND length(url) <= 512
  AND length(COALESCE(metric_id, '')) <= 128
  AND length(COALESCE(user_agent, '')) <= 512
  AND metric = ANY (ARRAY['LCP','INP','CLS','FCP','TTFB','FID','TBT','LAF'])
);
