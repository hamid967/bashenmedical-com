/**
 * Public API — POST /api/public/reservations/reschedule
 *
 * Moves a guest-owned appointment to a new date/time. Uses the same
 * session-token → phone match as cancel. Enforces same-doctor
 * clash prevention by peeking at existing bookings; the appointments
 * table's UNIQUE index is still the source of truth on race conditions.
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح."),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "الوقت غير صالح."),
});

export const Route = createFileRoute("/api/public/reservations/reschedule")({
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
        const rl = checkRateLimit(`resv-reschedule:${ip}`, [
          { windowMs: 60_000, max: 6 },
          { windowMs: 3_600_000, max: 20 },
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

        const rlSess = checkRateLimit(`resv-reschedule:sess:${sess.phone}`, [
          { windowMs: 60_000, max: 4 },
          { windowMs: 3_600_000, max: 15 },
        ]);
        if (!rlSess.ok) {
          return jsonResponse(429, {
            ok: false,
            message: `طلبات كثيرة على هذه الجلسة. حاول بعد ${rlSess.retryAfter} ثانية.`,
          });
        }

        const today = riyadhTodayIso();
        if (parsed.data.date < today) {
          return jsonResponse(400, {
            ok: false,
            message: "اختر تاريخًا لاحقًا لليوم.",
          });
        }
        const time = parsed.data.time.length === 5 ? `${parsed.data.time}:00` : parsed.data.time;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: appt, error: readErr } = await supabaseAdmin
            .from("appointments")
            .select("id, status, doctor_id, patient_phone")
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
          if (appt.status === "cancelled" || appt.status === "completed") {
            return jsonResponse(409, {
              ok: false,
              message: "لا يمكن إعادة جدولة حجز منتهٍ أو ملغى.",
            });
          }

          if (appt.doctor_id) {
            const { data: clash } = await supabaseAdmin
              .from("appointments")
              .select("id")
              .eq("doctor_id", appt.doctor_id)
              .eq("appointment_date", parsed.data.date)
              .eq("appointment_time", time)
              .in("status", ["new", "confirmed"])
              .neq("id", appt.id)
              .maybeSingle();
            if (clash) {
              return jsonResponse(409, {
                ok: false,
                message: "الوقت الجديد غير متاح. اختر وقتًا آخر.",
              });
            }
          }

          const { error: updErr } = await supabaseAdmin
            .from("appointments")
            .update({
              appointment_date: parsed.data.date,
              appointment_time: time,
              status: "new",
            })
            .eq("id", parsed.data.appointment_id);
          if (updErr) {
            const msg = /duplicate|unique/i.test(updErr.message)
              ? "الوقت الجديد غير متاح."
              : "تعذّر تنفيذ إعادة الجدولة.";
            return jsonResponse(409, { ok: false, message: msg });
          }
          try {
            const { logReservationEvent } = await import("@/lib/reservation-events.server");
            await logReservationEvent({
              event_type: "reschedule",
              phone: sess.phone,
              appointment_id: parsed.data.appointment_id,
              ip,
            });
          } catch {
            /* telemetry best-effort */
          }
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
