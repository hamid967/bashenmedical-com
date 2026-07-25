/**
 * FCM HTTP v1 sender — server-only.
 *
 * Handles both APNs (iOS) and FCM (Android) through a single Firebase
 * project. Requires a Google service account (Firebase project settings →
 * service accounts) exposed as `FCM_SERVICE_ACCOUNT_JSON` (the entire
 * JSON blob as a single string). Optional `FCM_PROJECT_ID` overrides the
 * `project_id` in the JSON.
 *
 * Signing uses SubtleCrypto (RSASSA-PKCS1-v1_5 / SHA-256) so it works on
 * Cloudflare Workers without pulling `jsonwebtoken`.
 */

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

let cachedToken: { token: string; exp: number } | null = null;

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) return null;
    if (process.env.FCM_PROJECT_ID) sa.project_id = process.env.FCM_PROJECT_ID;
    sa.token_uri = sa.token_uri || "https://oauth2.googleapis.com/token";
    // The private_key field in a JSON secret often has literal "\n" escapes.
    sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    return sa;
  } catch {
    return null;
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const clean = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s+/g, "");
  const bin = atob(clean);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri!,
    iat: now,
    exp: now + 3600,
  };
  const key = await importPrivateKey(sa.private_key);
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data)),
  );
  const jwt = `${data}.${b64url(sig)}`;
  const res = await fetch(sa.token_uri!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

export type FcmSendResult =
  { ok: true } | { ok: false; error: string; unregistered: boolean; skipped?: boolean };

export function fcmConfigured(): boolean {
  return loadServiceAccount() !== null;
}

export async function sendFcm(opts: {
  token: string;
  platform: "ios" | "android";
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  deepLink?: string;
}): Promise<FcmSendResult> {
  const sa = loadServiceAccount();
  if (!sa)
    return {
      ok: false,
      error: "FCM_SERVICE_ACCOUNT_JSON missing",
      unregistered: false,
      skipped: true,
    };

  const dataPayload: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.data ?? {})) dataPayload[k] = String(v);
  if (opts.deepLink) dataPayload.deepLink = opts.deepLink;
  if (typeof opts.badge === "number") dataPayload.badge = String(opts.badge);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message: any = {
    token: opts.token,
    notification: { title: opts.title, body: opts.body },
    data: dataPayload,
  };
  if (opts.platform === "ios") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aps: any = { sound: "default", "mutable-content": 1 };
    if (typeof opts.badge === "number") aps.badge = opts.badge;
    message.apns = { payload: { aps } };
  } else {
    message.android = {
      priority: "HIGH",
      notification: { channel_id: "default", default_sound: true },
    };
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      unregistered: false,
    };
  }

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
  if (res.ok) return { ok: true };
  const text = await res.text();
  const unregistered =
    res.status === 404 ||
    /UNREGISTERED|registration-token-not-registered|NOT_FOUND|INVALID_ARGUMENT/i.test(text);
  return {
    ok: false,
    error: `fcm ${res.status}: ${text.slice(0, 400)}`,
    unregistered,
  };
}

/**
 * Build a same-origin deep link path for a notification. The Capacitor
 * shell loads bashenmedical.com; setting window.location.href to a
 * same-origin URL triggers the SPA router without leaving the app.
 */
export function deriveDeepLink(
  kind: string,
  appointmentId: string | null,
  metadata: unknown,
): string {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const base = "https://bashenmedical.com";
  if (
    (kind === "refund_processed" || kind === "refund_canceled") &&
    typeof meta.refund_id === "string"
  ) {
    return `${base}/portal/refunds?receipt=${encodeURIComponent(meta.refund_id)}`;
  }
  if (kind.startsWith("reminder_") && appointmentId) {
    return `${base}/patient/appointments`;
  }
  if (appointmentId) return `${base}/patient/appointments`;
  return `${base}/patient/notifications`;
}
