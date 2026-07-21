/**
 * Public API — POST /api/public/reservations/list
 *
 * Returns the caller's appointments (upcoming + last 90 days) after the
 * verified session token proves ownership of the phone number. Only
 * safe display columns are projected — never raw uuids or PII beyond
 * what the caller already knows.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.server";
import { jsonResponse } from "@/lib/reservations-otp.server";
import { resolveGuestSession } from "@/lib/reservations-session.server";

const schema = z.object({
  session_token: z.string().min(32).max(128),
});

function toReference(id: string): string {
  return `BAA-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export const Route = createFileRoute("/api/public/reservations/list")({
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
        const rl = checkRateLimit(`resv-list:${ip}`, [
          { windowMs: 60_000, max: 30 },
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
          const since = new Date(
            Date.now() - 90 * 24 * 3600 * 1000,
          ).toISOString();

          const { data, error } = await supabaseAdmin
            .from("appointments")
            .select(
              `
                id,
                appointment_date,
                appointment_time,
                status,
                patient_name,
                doctor:doctors ( full_name_ar, full_name_en ),
                branch:branches ( name_ar, name_en ),
                specialty:specialties ( name_ar, name_en )
              `,
            )
            .eq("patient_phone", sess.phone)
            .gte("created_at", since)
            .order("appointment_date", { ascending: false })
            .order("appointment_time", { ascending: false })
            .limit(50);
          if (error) {
            return jsonResponse(500, {
              ok: false,
              message: "تعذّر جلب الحجوزات.",
            });
          }

          type Row = {
            id: string;
            appointment_date: string;
            appointment_time: string;
            status: string;
            patient_name: string | null;
            doctor: { full_name_ar: string | null; full_name_en: string | null } | null;
            branch: { name_ar: string | null; name_en: string | null } | null;
            specialty: { name_ar: string | null; name_en: string | null } | null;
          };
          const appointments = (data as Row[] | null ?? []).map((r) => ({
            id: r.id,
            reference: toReference(r.id),
            date: r.appointment_date,
            time: (r.appointment_time || "").slice(0, 5),
            status: r.status,
            patient_name: r.patient_name,
            doctor_name_ar: r.doctor?.full_name_ar ?? null,
            doctor_name_en: r.doctor?.full_name_en ?? null,
            branch_name_ar: r.branch?.name_ar ?? null,
            branch_name_en: r.branch?.name_en ?? null,
            specialty_name_ar: r.specialty?.name_ar ?? null,
            specialty_name_en: r.specialty?.name_en ?? null,
          }));

          return jsonResponse(200, { ok: true, appointments });
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
