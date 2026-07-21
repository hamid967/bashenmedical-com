
-- 1) Verified phone column (only writable by SECURITY DEFINER helpers / service role)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_phone text,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

-- Trigger: block clients from modifying verified_phone / phone_verified_at directly.
-- Service role and SECURITY DEFINER functions bypass RLS but still hit triggers;
-- allow them by checking session_user (service role runs as 'postgres'/'authenticator'
-- with role 'service_role' set). We use a GUC set by the definer function instead.
CREATE OR REPLACE FUNCTION public._guard_profile_verified_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.verified_phone IS NOT NULL OR NEW.phone_verified_at IS NOT NULL THEN
      IF current_setting('app.allow_verified_phone_write', true) IS DISTINCT FROM 'on' THEN
        NEW.verified_phone := NULL;
        NEW.phone_verified_at := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.verified_phone IS DISTINCT FROM OLD.verified_phone
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    IF current_setting('app.allow_verified_phone_write', true) IS DISTINCT FROM 'on' THEN
      NEW.verified_phone := OLD.verified_phone;
      NEW.phone_verified_at := OLD.phone_verified_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_verified_phone ON public.profiles;
CREATE TRIGGER profiles_guard_verified_phone
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._guard_profile_verified_phone();

-- Helper to set the verified phone after a successful OTP verification.
CREATE OR REPLACE FUNCTION public.set_verified_phone(_user_id uuid, _phone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _phone IS NULL OR length(btrim(_phone)) < 6 THEN
    RAISE EXCEPTION 'invalid arguments';
  END IF;
  PERFORM set_config('app.allow_verified_phone_write', 'on', true);
  UPDATE public.profiles
     SET verified_phone = regexp_replace(_phone, '\D', '', 'g'),
         phone_verified_at = now()
   WHERE id = _user_id;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, verified_phone, phone_verified_at)
    VALUES (_user_id, regexp_replace(_phone, '\D', '', 'g'), now());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_verified_phone(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_verified_phone(uuid, text) TO service_role;

-- 2) Tighten ownership check to require verified_phone
CREATE OR REPLACE FUNCTION public._appointment_belongs_to_me(_phone text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.verified_phone IS NOT NULL
      AND p.phone_verified_at IS NOT NULL
      AND regexp_replace(p.verified_phone, '\D', '', 'g')
          = regexp_replace(_phone, '\D', '', 'g')
  );
$$;

-- 3) Harden public INSERT policy on appointments
DROP POLICY IF EXISTS "anyone create appointments" ON public.appointments;
CREATE POLICY "anyone create appointments"
ON public.appointments
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(btrim(patient_name)) BETWEEN 2 AND 120
  AND length(btrim(patient_phone)) BETWEEN 6 AND 32
  AND appointment_date >= CURRENT_DATE
  AND status IN ('new'::appointment_status, 'held'::appointment_status, 'pending_verification'::appointment_status)
  -- linking to a patient account requires being signed in as that user
  AND (patient_id IS NULL OR patient_id = auth.uid())
  -- referenced doctor must exist and be active
  AND (doctor_id IS NULL OR EXISTS (
    SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND coalesce(d.is_active, true) = true
  ))
  -- referenced branch must exist
  AND (branch_id IS NULL OR EXISTS (
    SELECT 1 FROM public.branches b WHERE b.id = branch_id
  ))
);
