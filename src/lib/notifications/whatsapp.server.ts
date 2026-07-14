/**
 * WhatsApp notification helper (provider-agnostic).
 *
 * Provider is not wired yet — this module ships the full send flow and
 * message composer so we can toggle a real provider on later by only
 * setting environment variables. Until then, calls are logged and skipped
 * without throwing (never blocks the caller).
 *
 * To enable Twilio WhatsApp later, set:
 *   WHATSAPP_PROVIDER=twilio
 *   TWILIO_ACCOUNT_SID=AC...          (or use connector: TWILIO_API_KEY via gateway)
 *   TWILIO_AUTH_TOKEN=...             (only for direct API; skip when using gateway)
 *   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
 *   PUBLIC_APP_URL=https://bashenmedical.com
 *
 * To enable Sinch WhatsApp later, set:
 *   WHATSAPP_PROVIDER=sinch
 *   SINCH_* (project id, service plan, token, from number)
 */

export type CheckInWhatsAppPayload = {
  toPhone: string | null;
  patientName: string;
  queueNumber: number | null;
  checkedInAt: string; // ISO
  appointmentId: string;
  doctorName?: string | null;
  branchName?: string | null;
  branchLat?: number | null;
  branchLng?: number | null;
  branchMapEmbedUrl?: string | null;
  locale?: "ar" | "en";
};

const APP_URL = (process.env.PUBLIC_APP_URL || "https://bashenmedical.com").replace(
  /\/$/,
  "",
);

function normalizeToE164(phone: string): string | null {
  const s = phone.replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+")) return s;
  // Assume Saudi if 9-10 digits starting with 5/05
  if (/^0?5\d{8}$/.test(s)) return `+966${s.replace(/^0/, "")}`;
  if (/^966\d{8,9}$/.test(s)) return `+${s}`;
  return s.startsWith("00") ? `+${s.slice(2)}` : `+${s}`;
}

function buildMapsLink(p: CheckInWhatsAppPayload): string | null {
  if (typeof p.branchLat === "number" && typeof p.branchLng === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${p.branchLat},${p.branchLng}`;
  }
  if (p.branchName) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.branchName)}`;
  }
  return null;
}

export function composeCheckInMessage(p: CheckInWhatsAppPayload): string {
  const locale = p.locale ?? "ar";
  const listUrl = `${APP_URL}/portal/appointments`;
  const detailsUrl = `${APP_URL}/portal/appointments?a=${p.appointmentId}`;
  const rescheduleUrl = `${APP_URL}/portal/appointments?reschedule=${p.appointmentId}`;
  const mapsUrl = buildMapsLink(p);
  const time = new Date(p.checkedInAt).toLocaleTimeString(
    locale === "ar" ? "ar-SA" : "en-US",
    { hour: "2-digit", minute: "2-digit" },
  );

  if (locale === "en") {
    const lines = [
      `Hello ${p.patientName},`,
      `✅ Your check-in was confirmed${p.doctorName ? ` for Dr. ${p.doctorName}` : ""}${p.branchName ? ` at ${p.branchName}` : ""}.`,
      p.queueNumber ? `🎫 Queue number: ${p.queueNumber}` : null,
      `🕒 Check-in time: ${time}`,
      "",
      `📋 My appointments: ${listUrl}`,
      `🔧 Reschedule / cancel: ${rescheduleUrl}`,
      mapsUrl ? `📍 Branch location: ${mapsUrl}` : null,
      "",
      "Bashen Medical",
    ];
    return lines.filter(Boolean).join("\n");
  }

  const lines = [
    `مرحبًا ${p.patientName}،`,
    `✅ تم تسجيل حضورك${p.doctorName ? ` لدى د. ${p.doctorName}` : ""}${p.branchName ? ` في ${p.branchName}` : ""}.`,
    p.queueNumber ? `🎫 رقم الدور: ${p.queueNumber}` : null,
    `🕒 وقت التسجيل: ${time}`,
    "",
    `📋 قائمة مواعيدي: ${listUrl}`,
    `🔧 تعديل أو إلغاء الموعد: ${rescheduleUrl}`,
    mapsUrl ? `📍 موقع الفرع: ${mapsUrl}` : null,
    "",
    "مركز باشن الطبي",
  ];
  return lines.filter(Boolean).join("\n");
}

type SendResult =
  | { ok: true; provider: string; id?: string }
  | { ok: false; provider: string; skipped?: boolean; error?: string };

async function sendViaTwilio(
  to: string,
  body: string,
): Promise<SendResult> {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) return { ok: false, provider: "twilio", skipped: true, error: "TWILIO_WHATSAPP_FROM not set" };

  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.TWILIO_API_KEY;
  const useGateway = Boolean(lovableKey && connKey);

  const params = new URLSearchParams({
    To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    Body: body,
  });

  try {
    if (useGateway) {
      const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connKey!,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, provider: "twilio", error: `[${res.status}] ${text}` };
      const parsed = JSON.parse(text) as { sid?: string };
      return { ok: true, provider: "twilio", id: parsed.sid };
    }

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      return { ok: false, provider: "twilio", skipped: true, error: "no Twilio credentials" };
    }
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    const text = await res.text();
    if (!res.ok) return { ok: false, provider: "twilio", error: `[${res.status}] ${text}` };
    const parsed = JSON.parse(text) as { sid?: string };
    return { ok: true, provider: "twilio", id: parsed.sid };
  } catch (e) {
    return { ok: false, provider: "twilio", error: (e as Error).message };
  }
}

/**
 * Send the check-in WhatsApp message. Never throws — logs and returns a
 * result descriptor. Safe to `await` from a request handler that must
 * still respond even when the notifier is disabled or fails.
 */
export async function sendCheckInWhatsApp(
  payload: CheckInWhatsAppPayload,
): Promise<SendResult> {
  const provider = (process.env.WHATSAPP_PROVIDER || "").toLowerCase();
  const body = composeCheckInMessage(payload);
  const to = payload.toPhone ? normalizeToE164(payload.toPhone) : null;

  if (!to) {
    console.info("[whatsapp:check-in] skipped — no recipient phone", {
      appointmentId: payload.appointmentId,
    });
    return { ok: false, provider: provider || "none", skipped: true, error: "no phone" };
  }

  if (!provider) {
    // Provider not configured yet — log the composed message so we can
    // verify content in server logs during development.
    console.info("[whatsapp:check-in] provider not configured, message NOT sent", {
      to,
      appointmentId: payload.appointmentId,
      preview: body.slice(0, 180),
    });
    return { ok: false, provider: "none", skipped: true, error: "WHATSAPP_PROVIDER not set" };
  }

  if (provider === "twilio") {
    const r = await sendViaTwilio(to, body);
    if (!r.ok && !r.skipped) {
      console.error("[whatsapp:check-in] twilio failed", { to, error: r.error });
    }
    return r;
  }

  console.warn("[whatsapp:check-in] unsupported provider", { provider });
  return { ok: false, provider, skipped: true, error: "unsupported provider" };
}
