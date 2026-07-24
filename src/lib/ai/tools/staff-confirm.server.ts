/**
 * Two-phase confirmation tokens for staff-scope mutation tools (Phase 10.b).
 *
 * Stateless HMAC-signed tokens bind (userId, tool, paramsHash, exp) so the
 * "execute" phase cannot be forged, replayed with different params, or run
 * by a different user than the one who prepared it. TTL is intentionally
 * short (5 minutes) — the staff member must confirm interactively.
 *
 * Signing key: LOVABLE_API_KEY. It never leaves the server and is not the
 * DB service role, so this reuse is safe.
 */

import { createHmac, timingSafeEqual, createHash } from "node:crypto";

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signingKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY missing — cannot sign staff confirm tokens");
  return k;
}

/** Deterministic hash over the exact params blob so execute cannot swap params. */
export function hashParams(params: unknown): string {
  const stable = JSON.stringify(params, Object.keys(params ?? {}).sort());
  return createHash("sha256").update(stable).digest("hex");
}

interface TokenPayload {
  u: string; // userId
  t: string; // tool
  p: string; // paramsHash
  e: number; // exp (ms since epoch)
}

export function mintConfirmToken(input: {
  userId: string;
  tool: string;
  params: unknown;
}): { token: string; expiresAt: number } {
  const payload: TokenPayload = {
    u: input.userId,
    t: input.tool,
    p: hashParams(input.params),
    e: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", signingKey()).update(body).digest());
  return { token: `${body}.${sig}`, expiresAt: payload.e };
}

export type VerifyResult =
  | { ok: true; userId: string; tool: string; paramsHash: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyConfirmToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  let expected: Buffer;
  let given: Buffer;
  try {
    expected = createHmac("sha256", signingKey()).update(body).digest();
    given = b64urlDecode(sig);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (given.length !== expected.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.e !== "number" || payload.e < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, userId: payload.u, tool: payload.t, paramsHash: payload.p };
}
