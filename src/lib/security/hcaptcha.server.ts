/**
 * hCaptcha server-side verifier.
 *
 * Design goals — the request in this project is that captcha CANNOT be
 * bypassed by network retries, partial failures, or a stale/replayed token:
 *
 *  - Fail-CLOSED on production when `HCAPTCHA_SECRET` is unset (503).
 *  - Fail-CLOSED on network / upstream errors (502) — a common retry-bypass
 *    trick is to spam the endpoint hoping the sideverify call times out.
 *  - Token must be present, non-empty, sensible length, and single-use
 *    (hCaptcha itself invalidates tokens on the second `siteverify` call,
 *    so the widget MUST be reset on every submission attempt).
 *  - `remoteip` is passed so hCaptcha can bind the token to the client.
 *
 * In non-production environments where the secret is missing we log a
 * warning and allow the call through so local dev isn't bricked — this
 * gate is `process.env.NODE_ENV === "production"`.
 */

const VERIFY_URL = "https://api.hcaptcha.com/siteverify";

export interface VerifyResult {
  ok: boolean;
  status: number;
  reason?: string;
}

export async function verifyHCaptcha(
  token: string | null | undefined,
  ip: string | null | undefined,
): Promise<VerifyResult> {
  const secret = process.env.HCAPTCHA_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 503, reason: "captcha_not_configured" };
    }
    // eslint-disable-next-line no-console
    console.warn("[hcaptcha] HCAPTCHA_SECRET missing — bypassing verification (non-prod only).");
    return { ok: true, status: 200 };
  }

  if (typeof token !== "string" || token.length < 20 || token.length > 4000) {
    return { ok: false, status: 400, reason: "captcha_missing" };
  }

  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  if (ip) params.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      // Explicit timeout via AbortSignal so a hanging upstream fails closed.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, status: 502, reason: "captcha_upstream_error" };
    }
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      const code = data["error-codes"]?.[0] ?? "captcha_failed";
      return { ok: false, status: 403, reason: code };
    }
    return { ok: true, status: 200 };
  } catch {
    // Network / timeout / abort — treat as failure.
    return { ok: false, status: 502, reason: "captcha_network_error" };
  }
}

export function captchaFailureResponse(v: VerifyResult): Response {
  const message =
    v.reason === "captcha_not_configured"
      ? "التحقق البشري غير مُهيّأ. تواصل مع الدعم."
      : "فشل التحقق البشري. حدّث الصفحة وحاول مرة أخرى.";
  return new Response(
    JSON.stringify({
      ok: false,
      kind: "captcha",
      message,
      reason: v.reason ?? "captcha_failed",
    }),
    {
      status: v.status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}
