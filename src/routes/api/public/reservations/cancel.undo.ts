/**
 * Public API — POST /api/public/reservations/cancel/undo
 *
 * Reverses a very-recent cancellation (within UNDO_WINDOW_SECONDS) done via
 * /api/public/reservations/cancel. Restores appointment status, re-books the
 * availability slot if still free, and reverts any waitlist row that was
 * flipped to 'notified' by the cancellation trigger.
 *
 * Guardrails:
 *   • Session token must be valid and phone must own the appointment.
 *   • Appointment must be currently 'cancelled' with cancelled_at within
 *     the undo window (30s).
 *   • No other non-cancelled appointment may have taken the same
 *     doctor/date/time in the meantime.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { jsonResponse } from "@/lib/reservations-otp.server";
import { resolveGuestSession } from "@/lib/reservations-session.server";

const UNDO_WINDOW_SECONDS = 30;

const schema = z.object({
  session_token: z.string().min(32).max(128),
  appointment_id: z.string().uuid(),
});

export const Route = createFileRoute("/api/public/reservations/cancel/undo")({
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
          return jsonResponse(400, { ok: false, message: "بيانات غير صالحة." });
        }

        const ip = getClientIp(request);
        const rl = checkRateLimit(`resv-cancel-undo:${ip}`, [
          { windowMs: 60_000, max: 15 },
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

        const rlSess = checkRateLimit(`resv-cancel-undo:sess:${sess.phone}`, [
          { windowMs: 60_000, max: 8 },
          { windowMs: 3_600_000, max: 40 },
        ]);
        if (!rlSess.ok) {
          return jsonResponse(429, {
            ok: false,
            message: `طلبات كثيرة على هذه الجلسة. حاول بعد ${rlSess.retryAfter} ثانية.`,
          });
        }


        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data: appt, error: readErr } = await supabaseAdmin
            .from("appointments")
            .select(
              "id, status, cancelled_at, appointment_date, appointment_time, doctor_id, branch_id, patient_phone",
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
          if (appt.status !== "cancelled" || !appt.cancelled_at) {
            return jsonResponse(409, {
              ok: false,
              message: "هذا الحجز غير قابل للاسترجاع.",
            });
          }

          const cancelledAt = new Date(appt.cancelled_at).getTime();
          const ageSec = (Date.now() - cancelledAt) / 1000;
          if (ageSec > UNDO_WINDOW_SECONDS) {
            try {
              const { logReservationEvent } = await import(
                "@/lib/reservation-events.server"
              );
              await logReservationEvent({
                event_type: "cancel_undo_failed",
                phone: sess.phone,
                appointment_id: appt.id,
                meta: { reason: "expired" },
                ip,
              });
            } catch { /* telemetry best-effort */ }
            return jsonResponse(410, {
              ok: false,
              message: "انتهت مهلة التراجع (30 ثانية).",
            });
          }

          // Ensure the slot wasn't grabbed by another appointment.
          if (appt.doctor_id) {
            const { data: conflict } = await supabaseAdmin
              .from("appointments")
              .select("id")
              .eq("doctor_id", appt.doctor_id)
              .eq("appointment_date", appt.appointment_date)
              .eq("appointment_time", appt.appointment_time)
              .neq("id", appt.id)
              .not("status", "in", "(cancelled,no_show)")
              .limit(1);
            if (conflict && conflict.length > 0) {
              try {
                const { logReservationEvent } = await import(
                  "@/lib/reservation-events.server"
                );
                await logReservationEvent({
                  event_type: "cancel_undo_failed",
                  phone: sess.phone,
                  appointment_id: appt.id,
                  meta: { reason: "slot_taken" },
                  ip,
                });
              } catch { /* telemetry best-effort */ }
              return jsonResponse(409, {
                ok: false,
                message: "لم يعد الموعد متاحًا — تم حجزه من قِبل شخص آخر.",
              });
            }
          }

          const { error: updErr } = await supabaseAdmin
            .from("appointments")
            .update({
              status: "confirmed",
              cancelled_at: null,
            })
            .eq("id", appt.id);
          if (updErr) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر استرجاع الحجز.",
            });
          }

          // Try to re-book the availability slot if it's still free.
          let slot_rebooked = false;
          try {
            if (appt.doctor_id) {
              const { data: slotRow } = await supabaseAdmin
                .from("availability_slots")
                .select("id, status")
                .eq("doctor_id", appt.doctor_id)
                .eq("slot_date", appt.appointment_date)
                .eq("start_time", appt.appointment_time)
                .maybeSingle();
              if (slotRow && slotRow.status === "available") {
                const { error: slotErr } = await supabaseAdmin
                  .from("availability_slots")
                  .update({ status: "booked", appointment_id: appt.id })
                  .eq("id", slotRow.id)
                  .eq("status", "available");
                if (!slotErr) slot_rebooked = true;
              }
            }
          } catch {
            /* non-fatal */
          }

          // Revert waitlist rows that our cancellation just notified.
          let waitlist_reverted = false;
          try {
            const since = new Date(cancelledAt - 2_000).toISOString();
            if (appt.doctor_id && appt.branch_id) {
              const { data: notified } = await supabaseAdmin
                .from("appointment_waitlist")
                .select("id")
                .eq("doctor_id", appt.doctor_id)
                .eq("branch_id", appt.branch_id)
                .eq("offered_date", appt.appointment_date)
                .eq("status", "notified")
                .gte("notified_at", since);
              if (notified && notified.length > 0) {
                const ids = notified.map((r) => r.id);
                await supabaseAdmin
                  .from("appointment_waitlist")
                  .update({
                    status: "pending",
                    notified_at: null,
                    offered_date: null,
                    offered_time: null,
                    offered_hold_id: null,
                    offered_expires_at: null,
                  })
                  .in("id", ids);
                waitlist_reverted = true;
              }
            }
          } catch {
            /* non-fatal */
          }

          try {
            const { logReservationEvent } = await import(
              "@/lib/reservation-events.server"
            );
            await logReservationEvent({
              event_type: "cancel_undo_success",
              phone: sess.phone,
              appointment_id: appt.id,
              slot_rebooked,
              waitlist_reverted,
              ip,
            });
          } catch { /* telemetry best-effort */ }

          return jsonResponse(200, {
            ok: true,
            restored_status: "confirmed",
            slot_rebooked,
            waitlist_reverted,
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
