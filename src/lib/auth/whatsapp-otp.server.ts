/**
 * WhatsApp OTP sender — real provider wiring (Twilio via Lovable connector
 * gateway) with fail-closed defaults.
 *
 * Contract (unchanged from the scaffold):
 *   - Returns `{ ok: true }` ONLY on a confirmed provider accept
 *     (Twilio `queued`/`accepted`/`sending`/`sent`/`delivered`).
 *   - Returns `{ ok: false, error: "provider_unavailable" }` when any piece
 *     of provider config is missing OR when the connector gateway itself
 *     is unreachable — never a fake success.
 *   - Returns `{ ok: false, error: "send_failed" }` when the provider
 *     responded but rejected the message (bad body, blocked number, etc.).
 *
 * Required env for a working send:
 *   - `LOVABLE_API_KEY`          (auto-injected by Lovable)
 *   - `TWILIO_API_KEY`           (set by linking the Twilio connector)
 *   - `TWILIO_WHATSAPP_FROM`     (E.164 sender number, e.g. `+14155238886`
 *                                 — the WhatsApp-enabled Twilio number)
 *
 * If any of these are absent the helper short-circuits with
 * `provider_unavailable` so the caller can bubble a real error to the
 * user instead of pretending an OTP was delivered.
 */

export type SendOtpResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: "provider_unavailable" | "invalid_destination" | "send_failed" };

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

// Provider states Twilio returns when the message has been accepted /
// dispatched. Anything else (`failed`, `undelivered`, missing `sid`) is a
// send failure regardless of HTTP status.
const ACCEPTED_STATUSES = new Set(["queued", "accepted", "sending", "sent", "delivered"]);

function providerConfig(): {
  lovableKey: string;
  twilioKey: string;
  fromNumber: string;
} | null {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const fromRaw = process.env.TWILIO_WHATSAPP_FROM;
  if (!lovableKey || !twilioKey || !fromRaw) return null;
  // Accept both `+14155238886` and `whatsapp:+14155238886` for convenience.
  const from = fromRaw.startsWith("whatsapp:") ? fromRaw.slice("whatsapp:".length) : fromRaw;
  if (!/^\+\d{8,15}$/.test(from)) return null;
  return { lovableKey, twilioKey, fromNumber: from };
}

export function isProviderConfigured(): boolean {
  return providerConfig() !== null;
}

/** Localised OTP body. Never logs the code. */
export function composeOtpMessage(code: string, locale: "ar" | "en" = "ar"): string {
  if (locale === "en") {
    return `Baeshen Medical verification code: ${code}\nExpires in 5 minutes. Do not share this code with anyone.`;
  }
  return `رمز التحقق الخاص بمجمع باعشن الطبي: ${code}\nينتهي خلال 5 دقائق. لا تشارك هذا الرمز مع أي شخص.`;
}

export async function sendOtpMessage(
  destination: string,
  code: string,
  locale: "ar" | "en" = "ar",
): Promise<SendOtpResult> {
  if (!/^\+\d{8,15}$/.test(destination)) return { ok: false, error: "invalid_destination" };

  const cfg = providerConfig();
  if (!cfg) return { ok: false, error: "provider_unavailable" };

  const body = composeOtpMessage(code, locale);
  const form = new URLSearchParams({
    To: `whatsapp:${destination}`,
    From: `whatsapp:${cfg.fromNumber}`,
    Body: body,
  });

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.lovableKey}`,
        "X-Connection-Api-Key": cfg.twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch (err) {
    // Network/gateway failure. Log server-side (no PII: destination is not
    // logged, code was never in the log path) and fail closed.
    console.error("[otp] Twilio gateway unreachable:", err instanceof Error ? err.message : err);
    return { ok: false, error: "provider_unavailable" };
  }

  // Twilio returns provider errors inline with status + body — always read
  // the body before deciding, so the log entry carries the real reason.
  let payload: {
    sid?: string;
    status?: string;
    error_code?: number | string | null;
    message?: string;
  } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Non-JSON body from an error page or provider auth failure.
    console.error("[otp] Twilio non-JSON response, status=", response.status);
    return { ok: false, error: response.ok ? "send_failed" : "provider_unavailable" };
  }

  if (!response.ok) {
    // 401/403 from the gateway means credentials aren't usable — treat as
    // provider_unavailable so the UI tells the user to try another channel
    // instead of "message rejected".
    const unavailable = response.status === 401 || response.status === 403 || response.status >= 500;
    console.error(
      `[otp] Twilio send failed status=${response.status} code=${payload.error_code ?? "?"} msg=${payload.message ?? "?"}`,
    );
    return { ok: false, error: unavailable ? "provider_unavailable" : "send_failed" };
  }

  if (!payload.sid || (payload.status && !ACCEPTED_STATUSES.has(payload.status))) {
    console.error(
      `[otp] Twilio returned 2xx but did not accept: status=${payload.status ?? "?"} sid=${payload.sid ?? "?"}`,
    );
    return { ok: false, error: "send_failed" };
  }

  return { ok: true, providerMessageId: payload.sid };
}
