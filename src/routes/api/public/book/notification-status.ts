/**
 * Public API — POST /api/public/book/notification-status
 *
 * Body: { reference: "BMC-YYYYMMDD-XXXX" | "BAA-XXXXXXXX", phone_last4: "NNNN" }
 *
 * Resolves the appointment by reference + last-4 of phone (same pairing the
 * /track flow uses), then aggregates the latest delivery status per channel
 * from `notification_delivery_logs` (joined via `notifications.appointment_id`).
 *
 * Returns compact per-channel summaries — no recipient, no error message, no
 * PII — so the booking-success UI can display "sent/failed/pending" chips
 * without exposing anyone else's data.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

const REF_RE = /^(BMC-\d{8}-\d{4}|BAA-[0-9A-F]{8})$/;

const schema = z.object({
  reference: z.string().trim().toUpperCase().regex(REF_RE, "invalid reference"),
  phone_last4: z.string().trim().regex(/^\d{4}$/, "phone_last4"),
});

type Channel = "sms" | "whatsapp" | "email";
const TRACKED: Channel[] = ["sms", "whatsapp", "email"];

type ChannelStatus = {
  channel: Channel;
  status: "sent" | "failed" | "pending" | "unknown";
  updated_at: string | null;
  attempts: number;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function last4(phone: string | null | undefined): string {
  return (phone?.match(/\d/g) ?? []).slice(-4).join("");
}

function normalizeStatus(raw: string | null | undefined): ChannelStatus["status"] {
  const s = (raw ?? "").toLowerCase();
  if (["sent", "delivered", "success", "read"].includes(s)) return "sent";
  if (["failed", "error", "bounced", "dlq", "undelivered", "rejected"].includes(s)) return "failed";
  if (["pending", "queued", "sending", "processing", "retry"].includes(s)) return "pending";
  return "unknown";
}

export const Route = createFileRoute("/api/public/book/notification-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rl = await applyRateLimit(request, { category: "reads" });
        if (rl) return rl;

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json(400, { ok: false, message: "invalid body" });
        }

        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          return json(400, { ok: false, message: "invalid input" });
        }

        const { reference, phone_last4 } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve appointment by reference. BMC references have a first-class
        // column; BAA is a legacy hex prefix of the row UUID.
        let appointmentId: string | null = null;
        let patientPhone: string | null = null;

        if (reference.startsWith("BMC-")) {
          const { data } = await supabaseAdmin
            .from("appointments")
            .select("id, patient_phone")
            .eq("reference_number", reference)
            .maybeSingle();
          if (data) {
            appointmentId = data.id;
            patientPhone = data.patient_phone ?? null;
          }
        } else {
          const hex = reference.slice(4).toLowerCase();
          // Match rows whose UUID begins with the 8-char hex prefix. Guard by
          // phone last4 below to prevent enumeration.
          const { data } = await supabaseAdmin
            .from("appointments")
            .select("id, patient_phone")
            .ilike("id", `${hex}%`)
            .limit(2);
          if (data && data.length === 1) {
            appointmentId = data[0].id;
            patientPhone = data[0].patient_phone ?? null;
          }
        }

        if (!appointmentId || last4(patientPhone) !== phone_last4) {
          // Do not leak whether reference or phone was wrong.
          return json(404, { ok: false, message: "not found" });
        }

        // Notifications linked to this appointment.
        const { data: notifs } = await supabaseAdmin
          .from("notifications")
          .select("id, channel")
          .eq("appointment_id", appointmentId)
          .in("channel", TRACKED);

        const notifIds = (notifs ?? []).map((n) => n.id);
        const channels: Record<Channel, ChannelStatus> = {
          sms: { channel: "sms", status: "unknown", updated_at: null, attempts: 0 },
          whatsapp: { channel: "whatsapp", status: "unknown", updated_at: null, attempts: 0 },
          email: { channel: "email", status: "unknown", updated_at: null, attempts: 0 },
        };

        // Seed from notifications (send_status) so we at least know a message
        // was queued even before any delivery-log row exists.
        for (const n of notifs ?? []) {
          const ch = n.channel as Channel;
          if (!channels[ch]) continue;
          channels[ch].status = "pending";
        }

        if (notifIds.length) {
          const { data: logs } = await supabaseAdmin
            .from("notification_delivery_logs")
            .select("channel, status, updated_at, attempt")
            .in("notification_id", notifIds)
            .order("updated_at", { ascending: false })
            .limit(200);

          for (const row of logs ?? []) {
            const ch = (row.channel as Channel) ?? null;
            if (!ch || !channels[ch]) continue;
            const cur = channels[ch];
            cur.attempts = Math.max(cur.attempts, Number(row.attempt ?? 0));
            // First row we see per channel wins because the query is ordered
            // by updated_at desc.
            if (cur.status === "unknown" || cur.status === "pending") {
              cur.status = normalizeStatus(row.status);
              cur.updated_at = row.updated_at ?? null;
            }
          }
        }

        return json(200, {
          ok: true,
          channels: TRACKED.map((c) => channels[c]),
        });
      },
    },
  },
});
