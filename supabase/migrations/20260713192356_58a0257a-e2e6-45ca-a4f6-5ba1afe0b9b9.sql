
-- Link doctor records to Supabase auth users for the self-service scheduling panel
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS doctors_profile_id_unique
  ON public.doctors(profile_id) WHERE profile_id IS NOT NULL;

-- Security-definer helper: resolve the doctor record owned by the current user
CREATE OR REPLACE FUNCTION public.get_my_doctor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.doctors WHERE profile_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_doctor_id() TO authenticated;

-- Doctors can manage their own weekly availability template
DROP POLICY IF EXISTS availability_doctor_manage_own ON public.availability;
CREATE POLICY availability_doctor_manage_own
  ON public.availability
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'doctor'::app_role)
    AND doctor_id = public.get_my_doctor_id()
  )
  WITH CHECK (
    has_role(auth.uid(), 'doctor'::app_role)
    AND doctor_id = public.get_my_doctor_id()
  );

-- Doctors can manage their own leaves
DROP POLICY IF EXISTS doctor_leaves_doctor_manage_own ON public.doctor_leaves;
CREATE POLICY doctor_leaves_doctor_manage_own
  ON public.doctor_leaves
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'doctor'::app_role)
    AND doctor_id = public.get_my_doctor_id()
  )
  WITH CHECK (
    has_role(auth.uid(), 'doctor'::app_role)
    AND doctor_id = public.get_my_doctor_id()
  );

-- Ensure doctors can also read their leaves regardless of branch access
DROP POLICY IF EXISTS doctor_leaves_doctor_read_own ON public.doctor_leaves;
CREATE POLICY doctor_leaves_doctor_read_own
  ON public.doctor_leaves
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'doctor'::app_role)
    AND doctor_id = public.get_my_doctor_id()
  );

-- Doctors can read/manage their own generated time slots
DROP POLICY IF EXISTS availability_slots_doctor_own ON public.availability_slots;
CREATE POLICY availability_slots_doctor_own
  ON public.availability_slots
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'doctor'::app_role)
    AND doctor_id = public.get_my_doctor_id()
  )
  WITH CHECK (
    has_role(auth.uid(), 'doctor'::app_role)
    AND doctor_id = public.get_my_doctor_id()
  );

-- Doctors can view their own doctor row (for the "me" query)
DROP POLICY IF EXISTS doctors_read_self ON public.doctors;
CREATE POLICY doctors_read_self
  ON public.doctors
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());
