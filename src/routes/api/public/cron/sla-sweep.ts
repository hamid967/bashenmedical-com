/**
 * Public cron endpoint that scans for new SLA breaches and dispatches
 * webhook/email notifications. Callers must pass `SLA_CRON_SECRET` via
 * `Authorization: Bearer <secret>` or `?secret=<secret>`.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/sla-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const secret = process.env.SLA_CRON_SECRET;
  if (!secret) return new Response("not_configured", { status: 500 });

  const auth = request.headers.get("authorization") ?? "";
  const url = new URL(request.url);
  const qsSecret = url.searchParams.get("secret") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const provided = bearer || qsSecret;
  if (provided !== secret) return new Response("unauthorized", { status: 401 });

  try {
    const { runSweep } = await import("@/lib/admin/sla-alerts.server");
    const result = await runSweep();
    return Response.json({ ok: true, ...result });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: e?.message ?? "sweep_failed" }, { status: 500 });
  }
}
