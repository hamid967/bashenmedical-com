-- Seed admin role for the E2E test user (idempotent).
-- The auth user itself must be created via Cloud → Auth → Users (we don't
-- write to the auth schema from migrations). This block looks up the user
-- by email and grants them the 'admin' role in public.user_roles.
DO $$
DECLARE
  v_user_id uuid;
  v_email   text := 'admin-e2e@bashenmedical.com';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE NOTICE
      'E2E admin user % not found in auth.users. Create it in Cloud → Auth → Users, then re-run this migration (safe to re-apply).',
      v_email;
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Granted admin role to E2E user % (id=%)', v_email, v_user_id;
END $$;