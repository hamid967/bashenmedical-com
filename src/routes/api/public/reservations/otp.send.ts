/**
 * Public API — POST /api/public/reservations/otp/send
 *
 * Starts the phone-OTP flow for the unified "Manage My Reservations" page.
 * Accepts a Saudi mobile number, normalizes it to E.164, rate-limits by
 * IP+phone, generates a 6-digit code, stores its salted hash, and hands
 * the plaintext to the WhatsApp helper (currently a no-op logger until
 * a provider is wired). Never returns the code to the client in prod.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import {
  generateOtp,
  hashCode,
  jsonResponse,
  normalizeSaPhone,
  OTP_TTL_MS,
} from "@/lib/reservations-otp.server";

const schema = z.object({
  phone: z.string().trim().min(6).max(32),
});

export const Route = createFileRoute("/api/public/reservations/otp/send")({
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
            message: "أدخل رقم جوال صحيح.",
          });
        }
        const phone = normalizeSaPhone(parsed.data.phone);
        if (!phone) {
          return jsonResponse(400, {
            ok: false,
            message: "رقم الجوال غير صحيح. الصيغة المتوقعة 05XXXXXXXX.",
          });
        }

        const ip = getClientIp(request);
        const rl = checkRateLimit(`resv-otp-send:${ip}:${phone}`, [
          { windowMs: 60_000, max: 2 },
          { windowMs: 3_600_000, max: 6 },
        ]);
        if (!rl.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              message: `طلبات كثيرة. حاول بعد ${rl.retryAfter} ثانية.`,
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

        const code = generateOtp();
        const code_hash = await hashCode(phone, code);
        const code_expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.from("guest_reservation_sessions").insert({
            phone,
            code_hash,
            code_expires_at,
            ip,
          });
          if (error) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر إرسال الرمز. حاول مرة أخرى.",
            });
          }

          // TODO: wire real SMS/WhatsApp provider. Until then, we log only.
          // The code is intentionally NOT returned in the response.
          // eslint-disable-next-line no-console
          console.log(
            `[reservations-otp] Sent code to ${phone.replace(/(\d{3})\d+(\d{2})/, "$1***$2")} (dev only log)`,
          );

          const devEcho = process.env.NODE_ENV !== "production" ? { dev_code: code } : {};

          try {
            const { logReservationEvent } = await import("@/lib/reservation-events.server");
            await logReservationEvent({
              event_type: "otp_sent",
              phone,
              ip,
            });
          } catch {
            /* telemetry best-effort */
          }

          return jsonResponse(200, {
            ok: true,
            message: "تم إرسال رمز التحقق إلى جوالك.",
            phone_masked: phone.replace(/(\+966)(\d{2})\d{4}(\d{2})/, "$1$2****$3"),
            ttl_seconds: OTP_TTL_MS / 1000,
            ...devEcho,
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
