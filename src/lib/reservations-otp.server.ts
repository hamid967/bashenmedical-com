/**
 * Shared helpers for the guest reservation OTP flow (server-only).
 *
 * Handles phone normalization, code generation/hashing (Web Crypto), and
 * session token issuance. Table access lives in each endpoint using
 * supabaseAdmin so we don't leak the service role into the client bundle.
 */

export function normalizeSaPhone(raw: string): string | null {
  const s = (raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  // "+9665XXXXXXXX"
  if (/^\+9665\d{8}$/.test(s)) return s;
  if (/^9665\d{8}$/.test(s)) return `+${s}`;
  if (/^05\d{8}$/.test(s)) return `+966${s.slice(1)}`;
  if (/^5\d{8}$/.test(s)) return `+966${s}`;
  return null;
}

export function generateOtp(): string {
  // 6-digit code, uniformly distributed
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0]! % 1_000_000).padStart(6, "0");
}

export async function hashCode(phone: string, code: string): Promise<string> {
  const salt = process.env.SUPABASE_URL ?? "bmc";
  const data = new TextEncoder().encode(`${salt}::${phone}::${code}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateSessionToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes to enter code
export const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes verified session
export const MAX_ATTEMPTS = 5;
