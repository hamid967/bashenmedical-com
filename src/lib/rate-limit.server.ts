/**
 * In-memory sliding-window rate limiter for public API routes.
 *
 * Best-effort: Cloudflare Workers are stateless across instances so a
 * distributed attacker can spread traffic; still blocks the common case
 * of one client bursting a single endpoint. Combine with DB-backed
 * per-identity limits (e.g. per mobile) for defense in depth.
 */
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";

type Bucket = number[];
type RLRule = { windowMs: number; max: number };

const STORE: Map<string, Bucket> =
  (globalThis as unknown as { __publicRlStore?: Map<string, Bucket> }).__publicRlStore ??
  new Map<string, Bucket>();
(globalThis as unknown as { __publicRlStore?: Map<string, Bucket> }).__publicRlStore = STORE;

export function checkRateLimit(
  key: string,
  rules: RLRule[],
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const maxWindow = Math.max(...rules.map((r) => r.windowMs));
  const arr = (STORE.get(key) ?? []).filter((t) => now - t < maxWindow);
  for (const rule of rules) {
    const inWindow = arr.filter((t) => now - t < rule.windowMs);
    if (inWindow.length >= rule.max) {
      const oldest = inWindow.sort((a, b) => a - b)[0] ?? now;
      const retryAfter = Math.max(1, Math.ceil((rule.windowMs - (now - oldest)) / 1000));
      STORE.set(key, arr);
      return { ok: false, retryAfter };
    }
  }
  arr.push(now);
  STORE.set(key, arr);
  // Occasional GC to bound memory
  if (STORE.size > 5000 && Math.random() < 0.02) {
    for (const [k, v] of STORE) {
      const kept = v.filter((t) => now - t < maxWindow);
      if (kept.length === 0) STORE.delete(k);
      else STORE.set(k, kept);
    }
  }
  return { ok: true };
}

export function getClientIp(request?: Request): string {
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) return ip;
  } catch {
    /* noop */
  }
  try {
    const h =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-real-ip") ??
      getRequestHeader("x-forwarded-for");
    if (h) return h.toString().split(",")[0]!.trim();
  } catch {
    /* noop */
  }
  if (request) {
    const h =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (h) return h;
  }
  return "unknown";
}

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(extraHeaders ?? {}) },
  });
}

export function rateLimitedResponse(retryAfter: number, message = "too_many_requests") {
  return jsonResponse(
    429,
    { ok: false, kind: "rate_limited", message, retry_after: retryAfter },
    { "Retry-After": String(retryAfter) },
  );
}
