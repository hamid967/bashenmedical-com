/**
 * Hook — G3 complaint classification. Called from a DB trigger via pg_net
 * (or manually) with { complaint_id }.
 * Auth: server-only INTERNAL_CRON_SECRET (constant-time compare).
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyInternalCronSecret } from "@/lib/security/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/classify-complaint")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyInternalCronSecret(request);
        if (denied) return denied;
        let body: { complaint_id?: string } = {};
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!body.complaint_id) return new Response("Missing complaint_id", { status: 400 });
        const { classifyComplaint } = await import("@/lib/ai/classify-complaint.server");
        try {
          const result = await classifyComplaint(body.complaint_id);
          return Response.json({ ok: true, result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "error";
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
