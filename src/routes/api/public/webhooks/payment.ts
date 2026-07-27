/**
 * Batch B3 — Payment gateway webhook.
 *
 * `/api/public/webhooks/payment` is a bypass-auth route. Every request is
 * authenticated by HMAC (`x-webhook-signature` header) using
 * `PAYMENT_WEBHOOK_SECRET`. Successful and rejected events are recorded
 * to `payment_webhook_events` for full audit, and each provider event id
 * is deduplicated via the (`provider`,`event_id`) unique index.
 *
 * The concrete provider payload mapping (Paddle / Stripe / HyperPay) is
 * stubbed pending the payment-gateway manifest sign-off; today we log
 * the event and echo an `ok` back so integrators can wire the URL
 * ahead of go-live without accidental writes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

async function record(fields: {
  provider: string;
  event_id: string;
  event_type: string | null;
  signature_valid: boolean;
  http_status: number;
  raw: unknown;
  error_message?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("payment_webhook_events")
      .insert(fields as never)
      .throwOnError();
  } catch {
    // Auditing is best-effort; never break the webhook response.
  }
}

export const Route = createFileRoute("/api/public/webhooks/payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYMENT_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Webhook secret not configured", { status: 503 });
        }
        const signature = request.headers.get("x-webhook-signature") ?? "";
        const provider = request.headers.get("x-webhook-provider") ?? "unknown";
        const body = await request.text();

        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expected);
        const valid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);

        let parsed: unknown = {};
        try {
          parsed = body ? JSON.parse(body) : {};
        } catch {
          await record({
            provider,
            event_id: "invalid-json",
            event_type: null,
            signature_valid: valid,
            http_status: 400,
            raw: { body },
            error_message: "invalid JSON",
          });
          return new Response("Invalid JSON", { status: 400 });
        }

        const eventId =
          parsed.id ??
          parsed.event_id ??
          request.headers.get("x-webhook-event-id") ??
          crypto.randomUUID();
        const eventType = parsed.type ?? parsed.event_type ?? null;

        if (!valid) {
          await record({
            provider,
            event_id: String(eventId),
            event_type: eventType,
            signature_valid: false,
            http_status: 401,
            raw: parsed,
            error_message: "signature mismatch",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        // Dedup + persist; provider-specific payment linking is a follow-up.
        await record({
          provider,
          event_id: String(eventId),
          event_type: eventType,
          signature_valid: true,
          http_status: 200,
          raw: parsed,
        });

        return Response.json({ ok: true, deduplicated_on: "provider+event_id" });
      },
    },
  },
});
