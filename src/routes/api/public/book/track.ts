/**
 * Public API — POST /api/public/book/track
 *
 * Public endpoint that looks up a single appointment's status by:
 *   - reference: "BAA-XXXXXXXX" (8 uppercase hex chars derived from the
 *     appointment UUID's first 8 characters)
 *   - phone_last4: the last 4 digits of the patient's phone number
 *
 * Both fields are required. The lookup is performed via a SECURITY DEFINER
 * Postgres function `public.track_appointment(_ref, _phone_last4)` that
 * validates the inputs, bypasses RLS internally, and returns AT MOST one
 * row containing the minimum information needed to display status: date,
 * time, doctor name, specialty name, patient first name (already known to
 * the caller).
 *
 * The function returns nothing when either input is malformed or when no
 * matching row exists — this handler translates that into a generic Arabic
 * "not found" response so we never leak whether the reference or the phone
 * digits were the mismatch.
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
    .regex(/^BAA-[0-9A-F]{8}$/, "رقم الطلب غير صالح (BAA-XXXXXXXX)"),
  phone_last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "أدخل آخر 4 أرقام من جوالك"),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/book/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "reads" }); if (_rl) return _rl;
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

        const supa = createClient(url, anonKey, {
          auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        const { data, error } = await supa.rpc("track_appointment", {
          _ref: parsed.data.reference,
          _phone_last4: parsed.data.phone_last4,
        });

        if (error) {
          return json(500, { ok: false, message: "تعذّر تنفيذ البحث" });
        }

        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          return json(404, {
            ok: false,
            message: "لم نعثر على طلب مطابق. تأكّد من رقم الطلب وآخر 4 أرقام من جوالك.",
          });
        }

        return json(200, { ok: true, appointment: row });
      },
    },
  },
});
