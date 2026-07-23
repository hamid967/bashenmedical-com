/**
 * V3 auto-rollback watchdog.
 *
 * Invoked by pg_cron (every 5 minutes recommended). Computes per-flag health
 * across enabled V3 flags and auto-disables any flag with severity=rollback.
 * Records each auto-rollback in `audit_logs` with metadata.triggered_by='auto'.
 *
 * Auth: server-only CRON_SECRET (via `x-cron-secret` or `Authorization: Bearer`).
 * The Supabase publishable/anon key is NOT accepted — it is not a secret.
 */
import { createFileRoute } from "@tanstack/react-router";
import { computeV3Health } from "@/lib/v3/rollback.functions";
import { V3_FLAGS } from "@/lib/v3/flags.functions";
import { verifyCronSecret, unauthorizedCronResponse } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/v3-rollback-watchdog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyCronSecret(request)) return unauthorizedCronResponse();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: flagRows, error } = await supabaseAdmin
          .from("ai_feature_flags")
          .select("key, enabled")
          .in(
            "key",
            V3_FLAGS.map((f) => f.key),
          );
        if (error) return json({ error: error.message }, 500);

        const health = await computeV3Health(
          supabaseAdmin,
          (flagRows ?? []) as Array<{ key: string; enabled: boolean }>,
        );

        const toRollback = health.flags.filter((f) => f.severity === "rollback" && f.enabled);
        const results: Array<{ key: string; ok: boolean; error?: string }> = [];

        for (const f of toRollback) {
          const def = V3_FLAGS.find((d) => d.key === f.key)!;
          const { error: upErr } = await supabaseAdmin.from("ai_feature_flags").upsert(
            {
              key: f.key,
              enabled: false,
              notes: `[auto-rollback] ${f.reason}`,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" },
          );
          if (upErr) {
            results.push({ key: f.key, ok: false, error: upErr.message });
            continue;
          }

          if (f.key === "v3.platform.rate_limit_unified") {
            const { bustRateLimitFlagCache } = await import("@/lib/v3/rate-limit-unified.server");
            bustRateLimitFlagCache();
          }

          await supabaseAdmin.from("audit_logs").insert({
            action: "v3_rollback",
            entity_type: "v3_flag",
            entity_id: f.key,
            after_data: { enabled: false },
            metadata: {
              pillar: def.pillar,
              phase: def.phase,
              triggered_by: "auto",
              reason: f.reason,
              observed_per_hour: f.observed_per_hour,
              baseline_per_hour: f.baseline_per_hour,
              ratio: f.ratio,
              sample_size: f.sample_size,
            },
          });

          results.push({ key: f.key, ok: true });
        }

        return json({
          status: toRollback.length > 0 ? "rolled_back" : "ok",
          window_minutes: health.window_minutes,
          summary: health.summary,
          rolled_back: results,
        });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
