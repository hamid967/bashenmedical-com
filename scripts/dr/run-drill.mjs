#!/usr/bin/env bun
/**
 * CI entry point — executes a cross-region DR drill and writes the report
 * as JSON + Markdown to `artifacts/dr/`.
 *
 * Environment:
 *   DR_PRIMARY_URL         — health endpoint of the primary region (required)
 *   DR_SECONDARY_URL       — health endpoint of the secondary region (required)
 *   DR_PRIMARY_REGION      — display name (default: "primary")
 *   DR_SECONDARY_REGION    — display name (default: "secondary")
 *   DR_RPO_SECONDS         — RPO budget (default: 300)
 *   DR_RTO_SECONDS         — RTO budget (default: 600)
 *   DR_MAX_DURATION_MS     — drill hard timeout (default: 120_000)
 *   DR_PROBE_INTERVAL_MS   — probe cadence (default: 500)
 *   DR_SIMULATE_PRIMARY_FAIL_AFTER_MS
 *                          — mark primary "down" after N ms so we don't
 *                            need to take production offline (default: 3000)
 *   DR_LAST_BACKUP_ISO     — RFC3339 timestamp of last verified backup
 *                            (default: now - 60s)
 *   DR_ALERT_WEBHOOK_URL   — optional Slack-compatible webhook for breach
 *                            notifications
 *   GITHUB_SHA / DR_OPERATOR — surface in report headers
 *
 * Exit codes:
 *   0 — drill passed
 *   1 — drill breached one or more budgets (report still written)
 *   2 — drill aborted (primary never failed / secondary never healthy)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runDrill } from "../../src/lib/dr/drill.server.ts";
import { renderReportMarkdown } from "../../src/lib/dr/report.ts";
import { dispatchDrillAlert } from "../../src/lib/dr/alerts.server.ts";

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`invalid_env_int: ${name}=${v}`);
  return n;
}
function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env: ${name}`);
  return v;
}

const plan = {
  drill_id: `drill_${new Date().toISOString().replace(/[:.]/g, "-")}`,
  scenario: process.env.DR_SCENARIO ?? "primary_region_outage",
  operator: process.env.DR_OPERATOR ?? process.env.GITHUB_ACTOR ?? "ci",
  git_sha: process.env.GITHUB_SHA ?? null,
  primary: {
    region: process.env.DR_PRIMARY_REGION ?? "primary",
    healthUrl: required("DR_PRIMARY_URL"),
  },
  secondary: {
    region: process.env.DR_SECONDARY_REGION ?? "secondary",
    healthUrl: required("DR_SECONDARY_URL"),
  },
  budgets: {
    rpo_seconds: envInt("DR_RPO_SECONDS", 300),
    rto_seconds: envInt("DR_RTO_SECONDS", 600),
    post_failover_p95_ms: envInt("DR_POST_FAILOVER_P95_MS", 2000),
  },
  consecutive_samples: envInt("DR_CONSECUTIVE_SAMPLES", 2),
  probe_interval_ms: envInt("DR_PROBE_INTERVAL_MS", 500),
  max_duration_ms: envInt("DR_MAX_DURATION_MS", 120_000),
};

const simulateAfterMs = envInt("DR_SIMULATE_PRIMARY_FAIL_AFTER_MS", 3000);
const lastBackupAt = process.env.DR_LAST_BACKUP_ISO
  ? Date.parse(process.env.DR_LAST_BACKUP_ISO)
  : Date.now() - 60_000;

const report = await runDrill(plan, {
  getLastBackupAtMs: () => lastBackupAt,
  shouldSimulateDown: (region, elapsed) =>
    region === plan.primary.region && elapsed >= simulateAfterMs,
});

const dir = join(process.cwd(), "artifacts", "dr");
await mkdir(dir, { recursive: true });
await writeFile(join(dir, `${report.drill_id}.json`), JSON.stringify(report, null, 2));
await writeFile(join(dir, `${report.drill_id}.md`), renderReportMarkdown(report));
console.log(`[dr] report written: artifacts/dr/${report.drill_id}.{json,md}`);

const alert = await dispatchDrillAlert(report);
console.log(
  `[dr] alert channel=${alert.channel} attempted=${alert.attempted} delivered=${alert.delivered}${alert.error ? ` error=${alert.error}` : ""}`,
);

if (report.status === "aborted") process.exit(2);
if (report.status === "breached") process.exit(1);
process.exit(0);
