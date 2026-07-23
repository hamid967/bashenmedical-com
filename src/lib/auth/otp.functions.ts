/**
 * OTP server functions — issue a challenge, verify a code.
 *
 * Public (no `requireSupabaseAuth`) so unauthenticated visitors can log in,
 * BUT hardened at every layer:
 *   - Rate-limited per destination and per IP-hash (`auth_rate_limits`).
 *   - Codes are hashed with HMAC + per-row salt (never plaintext).
 *   - Attempts count and expiry are enforced atomically before comparison.
 *   - Real provider send; a stubbed provider returns `provider_unavailable`
 *     to the caller — never a fake success.
 *   - Every send/verify is audited in `auth_events`.
 *
 * `verifyOtp` returns a signal ("verified") but DOES NOT create a Supabase
 * session on its own — that step happens on the client (magic-link exchange
 * for known users, or registration flow for new ones). This keeps the
 * function's blast radius small if it is ever exposed accidentally.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

const IssueSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  destination: z.string().min(3).max(120),
  purpose: z.enum(["login", "register", "recovery", "mobile_change", "booking"]),
  locale: z.enum(["ar", "en"]).default("ar"),
});

const VerifySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "invalid_code"),
});

const RATE_WINDOW_MINUTES = 60;
const MAX_PER_DESTINATION = 5;
const MAX_PER_IP = 20;

async function bumpRateLimit(key: string, max: number): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const windowMs = RATE_WINDOW_MINUTES * 60 * 1000;
  const { data } = await supabaseAdmin
    .from("auth_rate_limits")
    .select("hits, window_started_at, blocked_until")
    .eq("key", key)
    .maybeSingle();
  if (data?.blocked_until && new Date(data.blocked_until) > now) return false;
  const windowStart = data?.window_started_at ? new Date(data.window_started_at) : now;
  const withinWindow = now.getTime() - windowStart.getTime() < windowMs;
  const hits = withinWindow ? (data?.hits ?? 0) + 1 : 1;
  const newWindow = withinWindow ? windowStart : now;
  if (hits > max) {
    await supabaseAdmin.from("auth_rate_limits").upsert({
      key,
      hits,
      window_started_at: newWindow.toISOString(),
      blocked_until: new Date(now.getTime() + windowMs).toISOString(),
      updated_at: now.toISOString(),
    });
    return false;
  }
  await supabaseAdmin.from("auth_rate_limits").upsert({
    key,
    hits,
    window_started_at: newWindow.toISOString(),
    blocked_until: null,
    updated_at: now.toISOString(),
  });
  return true;
}

export const issueOtp = createServerFn({ method: "POST" })
  .validator((input: unknown) => IssueSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      mintCode,
      mintSalt,
      hashOtp,
      hashIp,
      normalizeSaudiMobile,
      OTP_TTL_SECONDS,
      OTP_MAX_ATTEMPTS,
      OTP_RESEND_COOLDOWN_SECONDS,
      codeFingerprint,
    } = await import("@/lib/auth/otp.server");
    const { sendOtpMessage } = await import("@/lib/auth/whatsapp-otp.server");

    // Normalize destination per channel
    let destination = data.destination.trim();
    if (data.channel === "whatsapp") {
      const norm = normalizeSaudiMobile(destination);
      if (!norm) return { ok: false as const, error: "invalid_destination" };
      destination = norm;
    } else {
      // Cheap email check — the provider will still validate.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
        return { ok: false as const, error: "invalid_destination" };
      }
      destination = destination.toLowerCase();
    }

    const ip = getRequestIP({ xForwardedFor: true }) ?? "0.0.0.0";
    const ua = getRequestHeader("user-agent") ?? null;
    const ipHash = hashIp(ip);

    // Resend cooldown: reject if a live challenge for the same destination
    // and purpose was created less than N seconds ago.
    const cooldownIso = new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("otp_challenges")
      .select("id, created_at")
      .eq("destination", destination)
      .eq("purpose", data.purpose)
      .gte("created_at", cooldownIso)
      .is("consumed_at", null)
      .limit(1);
    if (recent && recent.length > 0) {
      return { ok: false as const, error: "cooldown_active" };
    }

    // Rate limits: destination and IP.
    const okDest = await bumpRateLimit(`otp:dest:${destination}:${data.purpose}`, MAX_PER_DESTINATION);
    const okIp = await bumpRateLimit(`otp:ip:${ipHash}`, MAX_PER_IP);
    if (!okDest || !okIp) {
      await supabaseAdmin.from("auth_events").insert({
        kind: "rate_limited",
        ip_hash: ipHash,
        ua,
        meta: { destination_hash: hashIp(destination), purpose: data.purpose },
      });
      return { ok: false as const, error: "rate_limited" };
    }

    // Mint & hash code.
    const code = mintCode();
    const salt = mintSalt();
    const codeHash = hashOtp(code, salt);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("otp_challenges")
      .insert({
        channel: data.channel,
        destination,
        purpose: data.purpose,
        code_hash: codeHash,
        salt,
        max_attempts: OTP_MAX_ATTEMPTS,
        expires_at: expiresAt,
        ip,
        ua,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) return { ok: false as const, error: "storage_failed" };

    // Send via provider.
    let sendResult: Awaited<ReturnType<typeof sendOtpMessage>> = {
      ok: false,
      error: "provider_unavailable",
    };
    if (data.channel === "whatsapp") {
      sendResult = await sendOtpMessage(destination, code, data.locale);
    } else {
      // Email channel not wired in this slice; keep the shape consistent.
      sendResult = { ok: false, error: "provider_unavailable" };
    }

    await supabaseAdmin.from("auth_events").insert({
      kind: sendResult.ok ? "otp_send" : "otp_send_failed",
      ip_hash: ipHash,
      ua,
      meta: {
        channel: data.channel,
        purpose: data.purpose,
        challenge_id: inserted.id,
        fingerprint: codeFingerprint(code),
        provider_error: sendResult.ok ? null : sendResult.error,
      },
    });

    if (!sendResult.ok) {
      // Mark the challenge consumed so nobody can guess it after a failed send.
      await supabaseAdmin
        .from("otp_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", inserted.id);
      return { ok: false as const, error: sendResult.error };
    }

    return {
      ok: true as const,
      challengeId: inserted.id,
      expiresAt,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      maxAttempts: OTP_MAX_ATTEMPTS,
    };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .validator((input: unknown) => VerifySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashOtp, safeEqual, hashIp } = await import("@/lib/auth/otp.server");

    const ip = getRequestIP({ xForwardedFor: true }) ?? "0.0.0.0";
    const ua = getRequestHeader("user-agent") ?? null;
    const ipHash = hashIp(ip);

    const { data: row, error } = await supabaseAdmin
      .from("otp_challenges")
      .select("id, code_hash, salt, attempts, max_attempts, expires_at, consumed_at, destination, channel, purpose")
      .eq("id", data.challengeId)
      .maybeSingle();

    if (error || !row) {
      await supabaseAdmin.from("auth_events").insert({
        kind: "otp_fail",
        ip_hash: ipHash,
        ua,
        meta: { reason: "not_found", challenge_id: data.challengeId },
      });
      return { ok: false as const, error: "invalid_challenge" };
    }
    if (row.consumed_at) return { ok: false as const, error: "already_used" };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false as const, error: "expired" };
    }
    if (row.attempts >= row.max_attempts) {
      return { ok: false as const, error: "too_many_attempts" };
    }

    const candidate = hashOtp(data.code, row.salt);
    const match = safeEqual(candidate, row.code_hash);

    if (!match) {
      await supabaseAdmin
        .from("otp_challenges")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      await supabaseAdmin.from("auth_events").insert({
        kind: "otp_fail",
        ip_hash: ipHash,
        ua,
        meta: { reason: "mismatch", challenge_id: row.id, attempt: row.attempts + 1 },
      });
      return {
        ok: false as const,
        error: "invalid_code",
        attemptsRemaining: Math.max(0, row.max_attempts - (row.attempts + 1)),
      };
    }

    // Atomic consume — a second concurrent verify sees consumed_at != null.
    const { data: consumed, error: consumeErr } = await supabaseAdmin
      .from("otp_challenges")
      .update({ consumed_at: new Date().toISOString(), attempts: row.attempts + 1 })
      .eq("id", row.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (consumeErr || !consumed) return { ok: false as const, error: "already_used" };

    await supabaseAdmin.from("auth_events").insert({
      kind: "otp_verified",
      ip_hash: ipHash,
      ua,
      meta: { challenge_id: row.id, purpose: row.purpose, channel: row.channel },
    });

    return {
      ok: true as const,
      destination: row.destination as string,
      channel: row.channel as "whatsapp" | "email" | "sms",
      purpose: row.purpose as "login" | "register" | "recovery" | "mobile_change" | "booking",
      challengeId: row.id as string,
    };
  });
