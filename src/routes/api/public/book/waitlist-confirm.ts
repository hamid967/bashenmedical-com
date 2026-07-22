/**
 * Public API — POST /api/public/book/waitlist-confirm
 *
 * Confirms a waitlist offer using the reference + last 4 digits of phone.
 * Delegates to the SECURITY DEFINER RPC `confirm_waitlist_offer` which
 * atomically books the held slot and updates waitlist state.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

const bodySchema = z.object({
  ref: z
    .string()
    .trim()
    .regex(/^WL-[0-9A-Fa-f]{8}$/, "المرجع غير صالح."),
  phone4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "أدخل آخر ٤ أرقام من الجوال."),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function apptRef(id: string): string {
  return `BAA-${String(id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export const Route = createFileRoute("/api/public/book/waitlist-confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "booking" }); if (_rl) return _rl;
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json(400, { ok: false, kind: "validation", message: "طلب غير صالح." });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return json(400, {
            ok: false,
            kind: "validation",
            message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("confirm_waitlist_offer", {
            _ref: parsed.data.ref.toUpperCase(),
            _phone4: parsed.data.phone4,
          } as any);
          if (error) {
            return json(500, { ok: false, kind: "server", message: "تعذّر تأكيد الحجز." });
          }
          const row = Array.isArray(data) ? data[0] : data;
          if (!row?.ok) {
            return json(409, {
              ok: false,
              kind: "state",
              message: row?.message ?? "تعذّر تأكيد الحجز.",
            });
          }
          return json(200, {
            ok: true,
            appointment_id: row.appointment_id,
            reference: row.appointment_id ? apptRef(row.appointment_id) : null,
          });
        } catch {
          return json(500, { ok: false, kind: "server", message: "خطأ داخلي غير متوقع." });
        }
      },
    },
  },
});
