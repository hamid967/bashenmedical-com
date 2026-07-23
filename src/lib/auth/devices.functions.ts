/**
 * Device / session management server functions.
 *
 * `recordDevice` is called by the client right after Supabase confirms a
 * successful sign-in. `listDevices` and `revokeOthers` power the "manage
 * my devices" UI. All privileged writes go through `supabaseAdmin` after
 * the caller is authenticated by `requireSupabaseAuth`.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** UA family for suspicious-login detection (crude — just enough to catch
 *  "new browser on a new machine" vs a token refresh in the same UA). */
function uaFamily(ua: string | null): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (s.includes("edg/")) return "edge";
  if (s.includes("chrome/")) return "chrome";
  if (s.includes("firefox/")) return "firefox";
  if (s.includes("safari/")) return "safari";
  return "other";
}

export const recordDeviceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ fingerprint: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashIp } = await import("@/lib/auth/otp.server");

    const ua = getRequestHeader("user-agent") ?? null;
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ipHash = hashIp(ip);
    const nowIso = new Date().toISOString();

    // Suspicious? New UA-family within last 24h.
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("device_sessions")
      .select("ua")
      .eq("user_id", context.userId)
      .gte("last_seen_at", dayAgo);
    const knownFamilies = new Set((recent ?? []).map((r) => uaFamily(r.ua)));
    const currentFamily = uaFamily(ua);
    const suspicious = knownFamilies.size > 0 && !knownFamilies.has(currentFamily);

    await supabaseAdmin.from("device_sessions").upsert(
      {
        user_id: context.userId,
        session_fingerprint: data.fingerprint,
        ua,
        ip_hash: ipHash,
        last_seen_at: nowIso,
      },
      { onConflict: "user_id,session_fingerprint" },
    );

    await supabaseAdmin.from("auth_events").insert({
      user_id: context.userId,
      kind: suspicious ? "suspicious" : "login_ok",
      ip_hash: ipHash,
      ua,
      meta: { fingerprint_prefix: data.fingerprint.slice(0, 6) },
    });

    return { ok: true, suspicious };
  });

export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("device_sessions")
      .select("id, ua, city, country, first_seen_at, last_seen_at, revoked_at")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { devices: data ?? [] };
  });

export const revokeAllOtherDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ keepFingerprint: z.string().min(8).max(128) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("device_sessions")
      .update({ revoked_at: nowIso, revoke_reason: "user_requested" })
      .eq("user_id", context.userId)
      .neq("session_fingerprint", data.keepFingerprint)
      .is("revoked_at", null);
    // Global sign-out on Supabase side so refresh tokens on other devices die.
    await supabaseAdmin.auth.admin.signOut(context.userId, "others");
    await supabaseAdmin.from("auth_events").insert({
      user_id: context.userId,
      kind: "logout_all",
      meta: {},
    });
    return { ok: true };
  });
