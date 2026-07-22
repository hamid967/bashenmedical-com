/**
 * Public API — POST /api/public/inquiries/mark-whatsapp-opened
 *
 * Called by the confirmation UI right before opening wa.me. Marks the
 * inquiry's handoff status as `opened`. Body: { request_number }.
 * Idempotent: only transitions from `not_opened`. Never sets `delivered` —
 * that state is reserved for verified WhatsApp Business API callbacks.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

const schema = z.object({
  request_number: z
    .string()
    .trim()
    .regex(/^BMC-WA-\d{8}-\d{4}$/, "رقم طلب غير صالح"),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/inquiries/mark-whatsapp-opened")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "inquiries" }); if (_rl) return _rl;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) return json(400, { ok: false });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("service_inquiries")
          .select("id, whatsapp_handoff_status")
          .eq("request_number", parsed.data.request_number)
          .maybeSingle();
        if (error || !row) return json(404, { ok: false });

        if (row.whatsapp_handoff_status === "not_opened") {
          await supabaseAdmin
            .from("service_inquiries")
            .update({
              whatsapp_handoff_status: "opened",
              whatsapp_opened_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          await supabaseAdmin.from("service_inquiry_updates").insert({
            inquiry_id: row.id,
            update_type: "whatsapp_handoff",
            metadata: { status: "opened" },
          });
        }
        return json(200, { ok: true });
      },
    },
  },
});
