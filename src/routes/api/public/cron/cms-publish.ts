/**
 * Public cron endpoint — publishes scheduled CMS entries that are due.
 * Auth: server-only INTERNAL_CRON_SECRET (constant-time compare).
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyInternalCronSecret } from "@/lib/security/cron-auth.server";

export const Route = createFileRoute("/api/public/cron/cms-publish")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const denied = verifyInternalCronSecret(request);
  if (denied) return denied;


  try {
    const { runCmsPublishSweep } = await import("@/lib/admin/cms/cms-publish.server");
    const result = await runCmsPublishSweep();
    return Response.json({ ok: true, ...result });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "sweep_failed" }, { status: 500 });
  }
}
