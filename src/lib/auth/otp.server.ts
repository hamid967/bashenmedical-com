/**
 * OTP hashing, verification, and rate-limit helpers. Server-only: uses
 * `AUTH_OTP_PEPPER` (an app secret) plus per-row salt so a database dump
 * cannot be used to brute-force codes. Never stores or logs the plaintext
 * code — the caller passes the code once to `hashOtp` and once to `verify`.
 *
 * All helpers are pure and free of Supabase imports so this file stays a
 * safe `.server.ts` leaf, callable from any handler in a server function.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Random 6-digit code as a string, zero-padded. */
export function mintCode(): string {
  // Use crypto random ints to avoid modulo bias entirely.
  const buf = randomBytes(4);
  const n = buf.readUInt32BE(0) % 1_000_000;
  return String(n).padStart(OTP_LENGTH, "0");
}

/** Per-row 16-byte salt (base64). */
export function mintSalt(): string {
  return randomBytes(16).toString("base64");
}

/** HMAC-SHA256(code, pepper+salt) → base64. Deterministic for the same
 *  inputs so verify can recompute and compare. */
export function hashOtp(code: string, salt: string): string {
  const pepper = process.env.AUTH_OTP_PEPPER;
  if (!pepper) throw new Error("AUTH_OTP_PEPPER not configured");
  return createHmac("sha256", `${pepper}:${salt}`).update(code).digest("base64");
}

/** Constant-time compare — two candidate hashes of equal length. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Stable, short-lived identifier for logs (never the plaintext code). */
export function codeFingerprint(code: string): string {
  // Last 2 digits + hash prefix so support can eyeball a match without
  // exposing the code itself. The hash uses a throwaway salt so the same
  // code doesn't produce the same fingerprint across sessions.
  const tail = code.slice(-2);
  const hp = createHmac("sha256", "fp").update(code).digest("hex").slice(0, 6);
  return `${hp}·${tail}`;
}

/** Hash an IP for storage — we never keep raw IPs (PII minimisation). */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const pepper = process.env.AUTH_OTP_PEPPER || "ip";
  return createHmac("sha256", pepper).update(ip).digest("hex").slice(0, 32);
}

/** Normalize a Saudi mobile number to E.164. Accepts:
 *   05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX.
 *  Returns `+9665XXXXXXXX` on success, `null` on invalid shape. */
export function normalizeSaudiMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let m = digits;
  if (m.startsWith("+966")) m = m.slice(4);
  else if (m.startsWith("966")) m = m.slice(3);
  else if (m.startsWith("0")) m = m.slice(1);
  if (!/^5\d{8}$/.test(m)) return null;
  return `+966${m}`;
}
