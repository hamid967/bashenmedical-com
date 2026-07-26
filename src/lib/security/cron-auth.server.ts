/**
 * Shared verifier for internal cron/hook endpoints. Requires a dedicated
 * server-only INTERNAL_CRON_SECRET (never the public Supabase publishable
 * key). Compares in constant time.
 */
import { timingSafeEqual } from "node:crypto";

export function verifyInternalCronSecret(request: Request): Response | null {
  const expected = process.env.INTERNAL_CRON_SECRET;
  if (!expected) return new Response("not_configured", { status: 500 });

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-cron-secret") ??
    bearer ||
    url.searchParams.get("secret") ||
    "";

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return ok ? null : new Response("unauthorized", { status: 401 });
}
