
-- Add native mobile support to push_subscriptions.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web'
    CHECK (platform IN ('web','ios','android')),
  ADD COLUMN IF NOT EXISTS native_token text,
  ADD COLUMN IF NOT EXISTS app_version text,
  ADD COLUMN IF NOT EXISTS device_model text;

-- Web-push columns become optional (native rows won't have them).
ALTER TABLE public.push_subscriptions
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

-- Exactly one of (web endpoint) or (native token) must be present.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_target_present;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_target_present CHECK (
    (platform = 'web'  AND endpoint IS NOT NULL AND p256dh IS NOT NULL AND auth IS NOT NULL AND native_token IS NULL)
    OR
    (platform IN ('ios','android') AND native_token IS NOT NULL AND endpoint IS NULL)
  );

-- Prevent duplicate native tokens per user (tokens are per-install; rotate on re-register).
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_native_token_uidx
  ON public.push_subscriptions (user_id, platform, native_token)
  WHERE native_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS push_subscriptions_platform_idx
  ON public.push_subscriptions (platform);
