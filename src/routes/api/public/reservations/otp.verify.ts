/**
 * Public API — POST /api/public/reservations/otp/verify
 *
 * Verifies a 6-digit OTP against the most recent unverified row for the
 * given phone. On success issues an opaque 32-byte session_token stored on
 * the same row with a short TTL. The frontend passes this token to the
 * list/cancel/reschedule endpoints instead of re-sending the phone.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import {
  MAX_ATTEMPTS,
  SESSION_TTL_MS,
  generateSessionToken,
  hashCode,
  jsonResponse,
  normalizeSaPhone,
} from "@/lib/reservations-otp.server";

const schema = z.object({
  phone: z.string().trim().min(6).max(32),
  code: z.string().trim().regex(/^\d{6}$/, "أدخل الرمز المكوّن من 6 أرقام."),
});

export const Route = createFileRoute("/api/public/reservations/otp/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResponse(400, { ok: false, message: "طلب غير صالح." });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(400, {
            ok: false,
            message:
              parsed.error.issues[0]?.message ?? "بيانات غير صالحة.",
          });
        }
        const phone = normalizeSaPhone(parsed.data.phone);
        if (!phone) {
          return jsonResponse(400, {
            ok: false,
            message: "رقم الجوال غير صحيح.",
          });
        }

        const ip = getClientIp(request);
        const rl = checkRateLimit(`resv-otp-verify:${ip}:${phone}`, [
          { windowMs: 60_000, max: 6 },
          { windowMs: 3_600_000, max: 20 },
        ]);
        if (!rl.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              message: `محاولات كثيرة. حاول بعد ${rl.retryAfter} ثانية.`,
              retry_after: rl.retryAfter,
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Retry-After": String(rl.retryAfter),
              },
            },
          );
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data: rows, error: readErr } = await supabaseAdmin
            .from("guest_reservation_sessions")
            .select("id, code_hash, code_expires_at, attempts, verified_at")
            .eq("phone", phone)
            .is("verified_at", null)
            .order("created_at", { ascending: false })
            .limit(1);
          if (readErr) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر التحقق من الرمز.",
            });
          }
          const row = rows?.[0];
          if (!row) {
            return jsonResponse(404, {
              ok: false,
              message: "لم نجد رمزًا فعّالًا. اطلب رمزًا جديدًا.",
            });
          }
          if (new Date(row.code_expires_at).getTime() < Date.now()) {
            return jsonResponse(410, {
              ok: false,
              message: "انتهت صلاحية الرمز. اطلب رمزًا جديدًا.",
            });
          }
          if (row.attempts >= MAX_ATTEMPTS) {
            return jsonResponse(429, {
              ok: false,
              message: "تجاوزت الحد المسموح. اطلب رمزًا جديدًا.",
            });
          }

          const expected = await hashCode(phone, parsed.data.code);
          if (expected !== row.code_hash) {
            await supabaseAdmin
              .from("guest_reservation_sessions")
              .update({ attempts: row.attempts + 1 })
              .eq("id", row.id);
            return jsonResponse(401, {
              ok: false,
              message: "الرمز غير صحيح.",
              attempts_left: Math.max(0, MAX_ATTEMPTS - (row.attempts + 1)),
            });
          }

          const session_token = generateSessionToken();
          const session_expires_at = new Date(
            Date.now() + SESSION_TTL_MS,
          ).toISOString();

          const { error: updErr } = await supabaseAdmin
            .from("guest_reservation_sessions")
            .update({
              verified_at: new Date().toISOString(),
              session_token,
              session_expires_at,
            })
            .eq("id", row.id);
          if (updErr) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر إنشاء جلسة التحقق.",
            });
          }

          return jsonResponse(200, {
            ok: true,
            session_token,
            session_expires_at,
          });
        } catch {
          return jsonResponse(500, {
            ok: false,
            message: "خطأ غير متوقع.",
          });
        }
      },
    },
  },
});
