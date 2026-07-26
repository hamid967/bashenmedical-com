/**
 * Cron hook — G3 daily AI recommendations.
 * Auth: server-only INTERNAL_CRON_SECRET (constant-time compare).
 */
import { createFileRoute } from "@tanstack/react-router";
import { verifyInternalCronSecret } from "@/lib/security/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/generate-recommendations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyInternalCronSecret(request);
        if (denied) return denied;
        const { runGenerateRecommendations } =
          await import("@/lib/ai/generate-recommendations.server");
        try {
          const result = await runGenerateRecommendations();
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
