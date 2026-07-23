/**
 * Public API — POST /api/public/appointments/verify
 *
 * Verifies an appointment by its PUBLIC reference number
 * ("BMC-YYYYMMDD-XXXX") plus the last 4 digits of the patient phone.
 *
 * The database id is NEVER accepted as input and NEVER returned. The RPC
 * `public.verify_appointment_by_reference` projects only non-identifying
 * columns (date, time, status, doctor/branch/specialty names).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

const schema = z.object({
  reference: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^BMC-\d{8}-[0-9A-Z]{4}$/, "رقم الحجز غير صالح (BMC-YYYYMMDD-XXXX)"),
  phone_last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "أدخل آخر 4 أرقام من رقم الجوال"),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/appointments/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "reads" });
        if (_rl) return _rl;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, message: "طلب غير صالح" });
        }

        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return json(400, {
            ok: false,
            message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
          });
        }

        const url = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !anonKey) {
          return json(500, { ok: false, message: "الخدمة غير متاحة حاليًا" });
        }

        const key = anonKey;
        const supa = createClient(url, key, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          // Opaque sb_ keys aren't JWTs; PostgREST rejects them as bearer.
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
                h.delete("Authorization");
              }
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        const { data, error } = await supa.rpc("verify_appointment_by_reference" as never, {
          _reference: parsed.data.reference,
          _phone_last4: parsed.data.phone_last4,
        });

        if (error) {
          return json(500, { ok: false, message: "تعذّر التحقق حالياً" });
        }

        const row = Array.isArray(data) ? data[0] : null;
        if (!row) {
          // Generic "not found" — do not leak which field mismatched.
          return json(404, {
            ok: false,
            message: "لم نعثر على حجز مطابق لهذا الرقم مع آخر 4 أرقام من الجوال.",
          });
        }

        return json(200, {
          ok: true,
          appointment: {
            reference: row.reference,
            appointment_date: row.appointment_date,
            appointment_time: row.appointment_time,
            status: row.status,
            doctor: {
              name_ar: row.doctor_name_ar ?? null,
              name_en: row.doctor_name_en ?? null,
            },
            branch: {
              name_ar: row.branch_name_ar ?? null,
              name_en: row.branch_name_en ?? null,
            },
            specialty: {
              name_ar: row.specialty_name_ar ?? null,
              name_en: row.specialty_name_en ?? null,
            },
          },
        });
      },
    },
  },
});
