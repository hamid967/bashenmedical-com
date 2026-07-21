/**
 * Watchdog for post-migration permission-error spikes.
 *
 * Invoked by pg_cron every 15 minutes. Only executes when a deployment was
 * merged in the last 24h. Emits `rollback_recommendations` rows when the
 * 403/permission_denied rate exceeds baseline. Optionally notifies Slack.
 *
 * Auth: apikey (Supabase anon) — the route is under /api/public and is safe
 * because it only performs a bounded read + upsert via SECURITY DEFINER RPCs.
 */
import { createFileRoute } from "@tanstack/react-router";

type SpikeRow = {
  deployment_id: string;
  migration_ref: string;
  merged_at: string;
  baseline: number;
  observed: number;
  ratio: number;
  severity: "ok" | "warn" | "rollback";
  top_routes: Array<{ route: string; n: number }>;
};

export const Route = createFileRoute("/api/public/hooks/permission-watchdog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY
          ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || (expected && apikey !== expected)) {
          return json({ error: "unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const { data, error } = await supabaseAdmin.rpc(
          "evaluate_permission_error_spike",
          { _warn_ratio: 3.0, _rollback_ratio: 6.0, _min_observed_per_hour: 5.0 },
        );
        if (error) return json({ error: error.message }, 500);

        const rows = (data ?? []) as SpikeRow[];
        if (rows.length === 0) return json({ status: "no_recent_deployment" });

        const row = rows[0];
        if (row.severity !== "ok") {
          await notifySlack(row).catch(() => {});
        }
        return json({
          status: row.severity,
          migration_ref: row.migration_ref,
          observed_per_hour: row.observed,
          baseline_per_hour: row.baseline,
          ratio: row.ratio,
          top_routes: row.top_routes,
          rollback_command:
            row.severity === "rollback"
              ? `# revert migration ${row.migration_ref}\n# see docs/security/permission_watchdog.md`
              : null,
        });
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

async function notifySlack(row: SpikeRow): Promise<void> {
  const url = process.env.SLACK_ALERT_WEBHOOK;
  if (!url) return;
  const emoji = row.severity === "rollback" ? ":rotating_light:" : ":warning:";
  const text =
    `${emoji} *Permission-error spike after* \`${row.migration_ref}\`\n` +
    `severity=*${row.severity}* observed=${row.observed.toFixed(2)}/h ` +
    `baseline=${row.baseline.toFixed(2)}/h ratio=${row.ratio.toFixed(2)}x\n` +
    `top routes: ${row.top_routes.slice(0, 3).map((r) => `\`${r.route}\` (${r.n})`).join(", ")}` +
    (row.severity === "rollback"
      ? `\n:arrow_backward: *Automatic rollback recommended* — see rollback_recommendations table.`
      : "");
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
