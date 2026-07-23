/**
 * Shared cron/webhook auth for server-only automation endpoints.
 *
 * Accepts the server-only `CRON_SECRET` via either the `x-cron-secret`
 * header or `Authorization: Bearer <secret>`. Constant-time compare.
 *
 * Do NOT accept the Supabase publishable/anon key — it ships in every
 * browser bundle and is not a secret.
 */
export function verifyCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export function unauthorizedCronResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
