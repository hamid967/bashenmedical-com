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
        const rl = checkRateLimit(`resv-cancel:${ip}`, [{ windowMs: 60_000, max: 10 }]);
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

        // Per-session limit — stops a single verified phone from bursting
        // even if their IP rotates.
        const rlSess = checkRateLimit(`resv-cancel:sess:${sess.phone}`, [
          { windowMs: 60_000, max: 5 },
          { windowMs: 3_600_000, max: 30 },
        ]);
        if (!rlSess.ok) {
          return jsonResponse(429, {
            ok: false,
            message: `طلبات كثيرة على هذه الجلسة. حاول بعد ${rlSess.retryAfter} ثانية.`,
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: appt, error: readErr } = await supabaseAdmin
            .from("appointments")
            .select(
              "id, status, appointment_date, appointment_time, doctor_id, branch_id, patient_phone",
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
            return jsonResponse(200, {
              ok: true,
              message: "تم الإلغاء مسبقًا.",
              already_cancelled: true,
              released: false,
              waitlist_notified: false,
            });
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

          const cancelledAt = new Date();
          const { error: updErr } = await supabaseAdmin
            .from("appointments")
            .update({
              status: "cancelled",
              cancelled_at: cancelledAt.toISOString(),
              notes: parsed.data.reason ? `[سبب الإلغاء] ${parsed.data.reason}` : undefined,
            })
            .eq("id", parsed.data.appointment_id);
          if (updErr) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر تنفيذ الإلغاء.",
            });
          }
          const { data: released } = await supabaseAdmin.rpc("release_slot", {
            p_appointment_id: parsed.data.appointment_id,
          });

          // Check if any waitlist entry for the freed slot was promoted
          // to 'notified' by the DB trigger (trg_waitlist_on_appt_cancel).
          let waitlist_notified = false;
          try {
            const since = new Date(cancelledAt.getTime() - 2_000).toISOString();
            if (appt.doctor_id && appt.branch_id) {
              const { data: notified } = await supabaseAdmin
                .from("appointment_waitlist")
                .select("id")
                .eq("doctor_id", appt.doctor_id)
                .eq("branch_id", appt.branch_id)
                .eq("offered_date", appt.appointment_date)
                .eq("status", "notified")
                .gte("notified_at", since)
                .limit(1);
              waitlist_notified = !!(notified && notified.length > 0);
            }
          } catch {
            /* non-fatal */
          }

          try {
            const { logReservationEvent } = await import("@/lib/reservation-events.server");
            await logReservationEvent({
              event_type: "cancel",
              phone: sess.phone,
              appointment_id: appt.id,
              released: released === true,
              waitlist_notified,
              ip,
            });
          } catch {
            /* telemetry best-effort */
          }

          return jsonResponse(200, {
            ok: true,
            released: released === true,
            waitlist_notified,
            cancelled_at: cancelledAt.toISOString(),
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
