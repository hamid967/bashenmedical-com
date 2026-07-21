/**
 * Registers a deployment marker right after a migration is merged.
 * Called by CI (post-merge job) with the migration filename as `ref`.
 *
 * Auth: apikey (Supabase anon) — read of api_permission_errors happens with
 * service role inside the handler to compute the 7-day baseline.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/record-deployment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY
          ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || (expected && apikey !== expected)) {
          return json({ error: "unauthorized" }, 401);
        }
        let body: { ref?: string; notes?: string } = {};
        try { body = await request.json(); } catch { /* empty */ }
        const ref = (body.ref ?? "").slice(0, 200);
        if (!ref) return json({ error: "missing ref" }, 400);

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Compute baseline: avg errors/hour over the trailing 7 days
        // (excluding the last 24h to avoid contamination from recent issues).
        const { data: baseRows, error: baseErr } = await supabaseAdmin
          .from("api_permission_errors")
          .select("id", { count: "exact", head: true })
          .lte("occurred_at", new Date(Date.now() - 24 * 3600_000).toISOString())
          .gte("occurred_at", new Date(Date.now() - 8 * 24 * 3600_000).toISOString());
        if (baseErr) return json({ error: baseErr.message }, 500);
        const baselineCount = (baseRows as unknown as { count?: number })?.count ?? 0;
        const baseline = baselineCount / (7 * 24);

        const { error } = await supabaseAdmin
          .from("deployment_markers")
          .upsert(
            {
              migration_ref: ref,
              baseline_errors_per_hour: baseline,
              notes: body.notes?.slice(0, 500) ?? null,
              merged_at: new Date().toISOString(),
            },
            { onConflict: "migration_ref" },
          );
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, migration_ref: ref, baseline_per_hour: baseline });
      },
    },
  },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
