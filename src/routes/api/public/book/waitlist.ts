/**
 * Public API — Waitlist for booking.
 *   POST /api/public/book/waitlist        create a waitlist entry
 *   GET  /api/public/book/waitlist?ref=&phone4=   check status
 *
 * Server-only via supabaseAdmin (table has RLS enabled with no policies).
 * The reference format is WL-XXXXXXXX (first 8 hex chars of the row uuid).
 * A phone4 (last 4 digits) check gates the status read so a bare reference
 * cannot leak the entry to a third party.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NAME_MIN, NAME_MAX, PHONE_MIN, PHONE_MAX, PHONE_RE } from "@/lib/booking-limits";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function refFromId(id: string): string {
  return `WL-${String(id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

const createSchema = z.object({
  patient_name: z.string().trim().min(NAME_MIN, "الاسم قصير جدًا").max(NAME_MAX, "الاسم طويل جدًا"),
  patient_phone: z
    .string()
    .trim()
    .min(PHONE_MIN, "رقم الجوال قصير جدًا")
    .max(PHONE_MAX, "رقم الجوال طويل جدًا")
    .regex(PHONE_RE, "رقم الجوال غير صالح"),
  doctor_id: z.string().uuid("معرّف الطبيب غير صالح"),
  specialty_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  preferred_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ البداية غير صالح"),
  preferred_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ النهاية غير صالح"),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const Route = createFileRoute("/api/public/book/waitlist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "booking" }); if (_rl) return _rl;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, kind: "validation", message: "طلب غير صالح." });
        }
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
          return json(400, {
            ok: false,
            kind: "validation",
            message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
          });
        }
        if (parsed.data.preferred_from > parsed.data.preferred_to) {
          return json(400, { ok: false, kind: "validation", message: "نطاق التاريخ غير صالح." });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Dedupe: same phone + doctor + overlapping range still 'waiting'.
          const { data: existing } = await supabaseAdmin
            .from("appointment_waitlist")
            .select("id, reference, status")
            .eq("patient_phone", parsed.data.patient_phone)
            .eq("doctor_id", parsed.data.doctor_id)
            .eq("status", "waiting")
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            return json(200, { ok: true, reference: existing.reference, duplicate: true });
          }

          // Two-step insert (need the id to derive the reference).
          const { data: inserted, error: insErr } = await supabaseAdmin
            .from("appointment_waitlist")
            .insert({
              reference: "PENDING",
              patient_name: parsed.data.patient_name,
              patient_phone: parsed.data.patient_phone,
              doctor_id: parsed.data.doctor_id,
              specialty_id: parsed.data.specialty_id ?? null,
              branch_id: parsed.data.branch_id ?? null,
              preferred_from: parsed.data.preferred_from,
              preferred_to: parsed.data.preferred_to,
              notes: parsed.data.notes ?? null,
            } as any)
            .select("id")
            .single();
          if (insErr || !inserted) {
            return json(500, {
              ok: false,
              kind: "server",
              message: "تعذّر تسجيل الطلب. حاول لاحقًا.",
            });
          }
          const reference = refFromId(inserted.id);
          await supabaseAdmin
            .from("appointment_waitlist")
            .update({ reference })
            .eq("id", inserted.id);
          return json(200, { ok: true, reference });
        } catch {
          return json(500, { ok: false, kind: "server", message: "خطأ داخلي غير متوقع." });
        }
      },

      GET: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "booking" }); if (_rl) return _rl;
        const url = new URL(request.url);
        const ref = (url.searchParams.get("ref") ?? "").trim().toUpperCase();
        const phone4 = (url.searchParams.get("phone4") ?? "").trim();
        if (!/^WL-[0-9A-F]{8}$/.test(ref)) {
          return json(400, { ok: false, kind: "validation", message: "المرجع غير صالح." });
        }
        if (!/^\d{4}$/.test(phone4)) {
          return json(400, {
            ok: false,
            kind: "validation",
            message: "أدخل آخر ٤ أرقام من الجوال.",
          });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("appointment_waitlist")
            .select(
              "id, patient_phone, status, notified_at, preferred_from, preferred_to, created_at, doctor_id, offered_date, offered_time, offered_expires_at",
            )
            .eq("reference", ref)
            .maybeSingle();
          if (!data)
            return json(404, { ok: false, kind: "not_found", message: "لم يتم العثور على الطلب." });
          const digits = (data.patient_phone ?? "").replace(/\D/g, "");
          if (digits.slice(-4) !== phone4) {
            return json(404, { ok: false, kind: "not_found", message: "لم يتم العثور على الطلب." });
          }
          // Fetch doctor name (optional).
          let doctor_name: string | null = null;
          if (data.doctor_id) {
            const { data: doc } = await supabaseAdmin
              .from("doctors")
              .select("name_ar, name_en")
              .eq("id", data.doctor_id)
              .maybeSingle();
            doctor_name = doc?.name_ar ?? doc?.name_en ?? null;
          }
          return json(200, {
            ok: true,
            status: data.status,
            notified_at: data.notified_at,
            preferred_from: data.preferred_from,
            preferred_to: data.preferred_to,
            created_at: data.created_at,
            doctor_name,
            offered_date: (data as any).offered_date ?? null,
            offered_time: (data as any).offered_time ?? null,
            offered_expires_at: (data as any).offered_expires_at ?? null,
          });
        } catch {
          return json(500, { ok: false, kind: "server", message: "خطأ داخلي غير متوقع." });
        }
      },
    },
  },
});
