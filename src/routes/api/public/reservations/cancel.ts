/**
 * Public API — POST /api/public/reservations/cancel
 *
 * Cancels an appointment owned by the caller's verified phone number.
 * Requires a valid session token; verifies the appointment's phone
 * matches before mutating. Releases the slot via release_slot().
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { jsonResponse } from "@/lib/reservations-otp.server";
import { resolveGuestSession } from "@/lib/reservations-session.server";
import { riyadhTodayIso } from "@/lib/riyadh-date";

const schema = z.object({
  session_token: z.string().min(32).max(128),
  appointment_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const Route = createFileRoute("/api/public/reservations/cancel")({
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
            message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة.",
          });
        }

        const ip = getClientIp(request);
        const rl = checkRateLimit(`resv-cancel:${ip}`, [
          { windowMs: 60_000, max: 10 },
        ]);
        if (!rl.ok) {
          return jsonResponse(429, {
            ok: false,
            message: `طلبات كثيرة. حاول بعد ${rl.retryAfter} ثانية.`,
          });
        }

        const sess = await resolveGuestSession(parsed.data.session_token);
        if (!sess) {
          return jsonResponse(401, {
            ok: false,
            message: "انتهت الجلسة. أعد التحقق برقم الجوال.",
          });
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data: appt, error: readErr } = await supabaseAdmin
            .from("appointments")
            .select(
              "id, status, appointment_date, patient_phone",
            )
            .eq("id", parsed.data.appointment_id)
            .maybeSingle();
          if (readErr) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر قراءة الحجز.",
            });
          }
          if (!appt || appt.patient_phone !== sess.phone) {
            return jsonResponse(404, {
              ok: false,
              message: "الحجز غير موجود.",
            });
          }
          if (appt.status === "cancelled") {
            return jsonResponse(200, { ok: true, message: "تم الإلغاء مسبقًا." });
          }
          if (appt.status === "completed" || appt.status === "no_show") {
            return jsonResponse(409, {
              ok: false,
              message: "لا يمكن إلغاء حجز منتهٍ.",
            });
          }
          const today = riyadhTodayIso();
          if (appt.appointment_date < today) {
            return jsonResponse(409, {
              ok: false,
              message: "لا يمكن إلغاء حجز في الماضي.",
            });
          }

          const { error: updErr } = await supabaseAdmin
            .from("appointments")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              notes: parsed.data.reason
                ? `[سبب الإلغاء] ${parsed.data.reason}`
                : undefined,
            })
            .eq("id", parsed.data.appointment_id);
          if (updErr) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر تنفيذ الإلغاء.",
            });
          }
          await supabaseAdmin.rpc("release_slot", {
            p_appointment_id: parsed.data.appointment_id,
          });

          return jsonResponse(200, { ok: true });
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
