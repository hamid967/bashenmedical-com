
-- Extend otp_challenges.purpose to allow the 'booking' value used by the public /book flow.
ALTER TABLE public.otp_challenges DROP CONSTRAINT IF EXISTS otp_challenges_purpose_check;
ALTER TABLE public.otp_challenges
  ADD CONSTRAINT otp_challenges_purpose_check
  CHECK (purpose = ANY (ARRAY['login'::text, 'register'::text, 'recovery'::text, 'mobile_change'::text, 'booking'::text]));

-- Speed up create.ts lookup: consumed booking challenge for a given phone within the last 15 min.
CREATE INDEX IF NOT EXISTS otp_challenges_booking_lookup_idx
  ON public.otp_challenges (destination, purpose, consumed_at DESC)
  WHERE purpose = 'booking' AND consumed_at IS NOT NULL;
