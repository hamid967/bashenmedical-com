CREATE TYPE public.queue_status AS ENUM (
  'waiting', 'called', 'skipped', 'in_service', 'completed', 'cancelled'
);

CREATE TABLE public.queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  queue_date date NOT NULL,
  queue_number integer NOT NULL,
  status public.queue_status NOT NULL DEFAULT 'waiting',
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX queue_entries_seq_uniq
  ON public.queue_entries(branch_id, doctor_id, queue_date, queue_number);
CREATE INDEX queue_entries_date_status_idx
  ON public.queue_entries(queue_date, status);
CREATE INDEX queue_entries_doctor_date_idx
  ON public.queue_entries(doctor_id, queue_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.queue_entries TO authenticated;
GRANT ALL ON public.queue_entries TO service_role;

ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view queue"
  ON public.queue_entries FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'reception')
    OR public.has_role(auth.uid(), 'doctor')
    OR public.has_role(auth.uid(), 'branch_manager')
  );

CREATE POLICY "Staff can manage queue"
  ON public.queue_entries FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'reception')
    OR public.has_role(auth.uid(), 'branch_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'reception')
    OR public.has_role(auth.uid(), 'branch_manager')
  );

CREATE POLICY "Patient can view own queue entry"
  ON public.queue_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = queue_entries.appointment_id
        AND a.patient_id = auth.uid()
    )
  );

CREATE TRIGGER update_queue_entries_updated_at
  BEFORE UPDATE ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_queue_entry_on_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_number integer;
BEGIN
  IF NEW.status IS NOT NULL
     AND NEW.status::text IN ('cancelled', 'no_show', 'completed', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(queue_number), 0) + 1
    INTO v_next_number
    FROM public.queue_entries
   WHERE doctor_id = NEW.doctor_id
     AND queue_date = NEW.appointment_date
     AND branch_id IS NOT DISTINCT FROM NEW.branch_id;

  INSERT INTO public.queue_entries (
    appointment_id, branch_id, doctor_id, queue_date, queue_number, status, is_demo
  ) VALUES (
    NEW.id, NEW.branch_id, NEW.doctor_id, NEW.appointment_date, v_next_number,
    'waiting', COALESCE(NEW.is_demo, false)
  )
  ON CONFLICT (appointment_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointments_create_queue_entry
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.create_queue_entry_on_appointment();

CREATE OR REPLACE FUNCTION public.sync_queue_entry_on_appointment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'cancelled' THEN
      UPDATE public.queue_entries
         SET status = 'cancelled'
       WHERE appointment_id = NEW.id
         AND status NOT IN ('completed', 'cancelled');
    ELSIF NEW.status::text = 'no_show' THEN
      UPDATE public.queue_entries
         SET status = 'skipped'
       WHERE appointment_id = NEW.id
         AND status NOT IN ('completed', 'cancelled');
    ELSIF NEW.status::text = 'completed' THEN
      UPDATE public.queue_entries
         SET status = 'completed',
             completed_at = COALESCE(completed_at, now())
       WHERE appointment_id = NEW.id
         AND status <> 'completed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointments_sync_queue_status
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.sync_queue_entry_on_appointment_status();