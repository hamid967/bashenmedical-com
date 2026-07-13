DROP POLICY IF EXISTS appointments_doctor_read_own ON public.appointments;
CREATE POLICY appointments_doctor_read_own
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (doctor_id IS NOT NULL AND doctor_id = public.get_my_doctor_id());

DROP POLICY IF EXISTS appointments_doctor_update_own ON public.appointments;
CREATE POLICY appointments_doctor_update_own
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (doctor_id IS NOT NULL AND doctor_id = public.get_my_doctor_id())
  WITH CHECK (doctor_id IS NOT NULL AND doctor_id = public.get_my_doctor_id());