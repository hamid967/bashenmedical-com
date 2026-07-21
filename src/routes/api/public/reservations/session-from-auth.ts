/**
 * Public API — POST /api/public/reservations/session-from-auth
 *
 * Mints a verified guest reservation session for an already-authenticated
 * user, bypassing the SMS OTP round-trip.
 *
 * Contract:
 *   - Client sends its Supabase access token in the Authorization header.
 *   - We validate the token, load the user's `profiles.phone`, and if it
 *     matches Saudi format, insert a pre-verified row into
 *     `guest_reservation_sessions` and return the session token.
 *   - If the profile has no phone (or the token is invalid), we respond
 *     with { ok: false } and the client falls back to the normal OTP flow.
 *
 * The session shape (token + expiry) matches otp/verify so the same list/
 * cancel/reschedule endpoints work with no change.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  SESSION_TTL_MS,
  generateSessionToken,
  jsonResponse,
  normalizeSaPhone,
} from "@/lib/reservations-otp.server";

export const Route = createFileRoute("/api/public/reservations/session-from-auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization") ?? "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : "";
        if (!token) {
          return jsonResponse(401, { ok: false, message: "غير مصرّح." });
        }

        const url = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !anonKey) {
          return jsonResponse(500, { ok: false, message: "تعذّر التحقق حاليًا." });
        }

        // Validate the bearer token by asking Supabase Auth for the user.
        const supaAuth = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userErr } = await supaAuth.auth.getUser(token);
        if (userErr || !userData?.user) {
          return jsonResponse(401, { ok: false, message: "جلسة غير صالحة." });
        }
        const userId = userData.user.id;

        // Load profile phone with the service role — we already validated
        // the caller above, and we need to bypass any RLS on profiles.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profile, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("phone")
          .eq("id", userId)
          .maybeSingle();
        if (profErr) {
          return jsonResponse(500, { ok: false, message: "تعذّر جلب البيانات." });
        }

        const rawPhone = profile?.phone ?? userData.user.phone ?? "";
        const phone = normalizeSaPhone(String(rawPhone));
        if (!phone) {
          return jsonResponse(200, {
            ok: false,
            reason: "no_phone",
            message: "لا يوجد رقم جوال محفوظ في ملفّك — أدخله يدويًا.",
          });
        }

        // Record the verified phone against the user's profile so that
        // RLS ownership checks (which require a verified phone, not a
        // freely-editable profile.phone) recognise this user.
        try {
          await supabaseAdmin.rpc("set_verified_phone", {
            _user_id: userId,
            _phone: phone,
          });
        } catch { /* best-effort — session still works via server APIs */ }

        const session_token = generateSessionToken();
        const session_expires_at = new Date(Date.now() + SESSION_TTL_MS).toISOString();

        // Insert a fully-verified session row. Reuse the guest table so
        // downstream list/cancel/reschedule endpoints work unchanged.
        const { error: insErr } = await supabaseAdmin
          .from("guest_reservation_sessions")
          .insert({
            phone,
            code_hash: "auth-bypass",
            code_expires_at: new Date().toISOString(),
            attempts: 0,
            verified_at: new Date().toISOString(),
            session_token,
            session_expires_at,
            ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          });
        if (insErr) {
          return jsonResponse(500, { ok: false, message: "تعذّر إنشاء الجلسة." });
        }


        // Mask phone for display: +9665X****NNNN
        const masked = phone.replace(/^(\+9665\d)(\d{4})(\d{3})$/, "$1****$3");

        return jsonResponse(200, {
          ok: true,
          session_token,
          session_expires_at,
          phone_masked: masked,
        });
      },
    },
  },
});
