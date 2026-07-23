/**
 * WhatsApp OTP sender.
 *
 * The project's WhatsApp provider (`src/lib/notifications/whatsapp.server.ts`)
 * is currently stubbed — no provider is wired. Per the Phase 2 rules we must
 * NEVER fake a successful send: this helper returns `provider_unavailable`
 * so callers can bubble a real error to the user instead of pretending an
 * OTP was delivered.
 *
 * When the provider is enabled later (Twilio / Sinch env vars), replace the
 * body of `sendOtpMessage` with the real API call — the return shape stays
 * the same.
 */

export type SendOtpResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: "provider_unavailable" | "invalid_destination" | "send_failed" };

function isProviderConfigured(): boolean {
  const provider = process.env.WHATSAPP_PROVIDER;
  if (!provider) return false;
  if (provider === "twilio") {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_WHATSAPP_FROM);
  }
  if (provider === "sinch") {
    return Boolean(
      process.env.SINCH_PROJECT_ID && process.env.SINCH_SERVICE_PLAN_ID && process.env.SINCH_FROM,
    );
  }
  return false;
}

/** Compose the localized OTP body. Never logs the code. */
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
  if (!isProviderConfigured()) return { ok: false, error: "provider_unavailable" };

  // Real send goes here. Kept as a placeholder so a misconfigured provider
  // fails closed rather than silently "succeeding".
  const _body = composeOtpMessage(code, locale);
  return { ok: false, error: "provider_unavailable" };
}
