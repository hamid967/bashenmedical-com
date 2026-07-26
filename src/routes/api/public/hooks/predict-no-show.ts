/**
 * Cron hook — G3 no-show batch scoring.
 * Auth: server-only INTERNAL_CRON_SECRET (constant-time compare).
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyInternalCronSecret } from "@/lib/security/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/predict-no-show")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyInternalCronSecret(request);
        if (denied) return denied;
        const { runPredictNoShowBatch } = await import("@/lib/ai/predict-no-show.server");
        try {
          const result = await runPredictNoShowBatch(48);
          return Response.json({ ok: true, ...result });
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
