/**
 * Cron hook — G3 no-show batch scoring.
 * Authenticated by Supabase anon key in `apikey` header (canonical pg_cron pattern).
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/predict-no-show")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey");
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
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
