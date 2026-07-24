/**
 * Public cron endpoint — publishes scheduled CMS entries that are due.
 * Auth: Supabase publishable/anon key via `apikey` header (canonical
 * pg_cron pattern; `/api/public/*` bypasses site auth).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/cms-publish")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!expected) return new Response("not_configured", { status: 500 });

  const provided =
    request.headers.get("apikey") ??
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("apikey") ??
    "";
  if (provided !== expected) return new Response("unauthorized", { status: 401 });

  try {
    const { runCmsPublishSweep } = await import("@/lib/admin/cms/cms-publish.server");
    const result = await runCmsPublishSweep();
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "sweep_failed" }, { status: 500 });
  }
}
