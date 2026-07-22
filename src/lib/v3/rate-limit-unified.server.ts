/**
 * V3 Unified Rate Limiter (flag: v3.platform.rate_limit_unified).
 *
 * Wraps the existing sliding-window limiter (`src/lib/rate-limit.server.ts`)
 * with preset per-category policies and a one-liner API for server routes:
 *
 *   const limited = await applyRateLimit(request, { category: "booking" });
 *   if (limited) return limited;
 *
 * When the feature flag is disabled the helper is a no-op, so we can flip
 * it off instantly if a preset is too aggressive in production.
 *
 * Categories:
 *   - auth_otp   : OTP send/verify, session-from-auth   (very tight)
 *   - booking    : create/cancel/reschedule/waitlist    (tight)
 *   - reads      : availability / list / lookup         (loose)
 *   - inquiries  : contact / WhatsApp events            (medium)
 *   - insurance  : eligibility checks                   (medium)
 *   - ai_chat    : assistant streaming                  (medium, per-session)
 *   - webhook    : internal cron/hooks                  (very loose)
 */
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit.server";

export type RateLimitCategory =
  | "auth_otp"
  | "booking"
  | "reads"
  | "inquiries"
  | "insurance"
  | "ai_chat"
  | "webhook";

const PRESETS: Record<RateLimitCategory, { windowMs: number; max: number }[]> = {
  auth_otp: [
    { windowMs: 60_000, max: 5 },
    { windowMs: 3_600_000, max: 20 },
  ],
  booking: [
    { windowMs: 60_000, max: 10 },
    { windowMs: 3_600_000, max: 40 },
  ],
  reads: [
    { windowMs: 60_000, max: 60 },
    { windowMs: 3_600_000, max: 600 },
  ],
  inquiries: [
    { windowMs: 60_000, max: 5 },
    { windowMs: 3_600_000, max: 30 },
  ],
  insurance: [
    { windowMs: 60_000, max: 10 },
    { windowMs: 3_600_000, max: 60 },
  ],
  ai_chat: [
    { windowMs: 60_000, max: 20 },
    { windowMs: 3_600_000, max: 200 },
  ],
  webhook: [{ windowMs: 60_000, max: 120 }],
};

type FlagCache = { value: boolean; expires: number };
const flagCache: { current?: FlagCache } =
  (globalThis as unknown as { __v3RlFlagCache?: { current?: FlagCache } }).__v3RlFlagCache ?? {};
(globalThis as unknown as { __v3RlFlagCache?: { current?: FlagCache } }).__v3RlFlagCache =
  flagCache;

async function isEnabled(): Promise<boolean> {
  const now = Date.now();
  if (flagCache.current && flagCache.current.expires > now) {
    return flagCache.current.value;
  }
  let value = true; // fail-safe: enforce when the flag lookup fails
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_feature_flags")
      .select("enabled")
      .eq("key", "v3.platform.rate_limit_unified")
      .maybeSingle();
    if (data) value = Boolean(data.enabled);
  } catch {
    /* keep fail-safe default */
  }
  flagCache.current = { value, expires: now + 60_000 };
  return value;
}

export interface ApplyRateLimitOptions {
  category: RateLimitCategory;
  /** Extra key component (e.g. session id, national id) added to the IP key. */
  extraKey?: string | null;
  /** Custom label for the 429 body (defaults to category). */
  message?: string;
}

/**
 * Enforce the unified rate limit for a route. Returns a 429 `Response` when
 * the limit is exceeded, `null` when the caller may proceed.
 */
export async function applyRateLimit(
  request: Request,
  { category, extraKey, message }: ApplyRateLimitOptions,
): Promise<Response | null> {
  if (!(await isEnabled())) return null;
  const ip = getClientIp(request);
  const key = `v3:${category}:${ip}:${extraKey ?? "-"}`;
  const rules = PRESETS[category];
  const result = checkRateLimit(key, rules);
  if (result.ok) return null;
  return rateLimitedResponse(result.retryAfter, message ?? `rate_limited_${category}`);
}
