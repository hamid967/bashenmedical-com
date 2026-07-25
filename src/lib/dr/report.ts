/**
 * Markdown + JSON report generation for a completed DR drill.
 *
 * The report is designed to be uploaded as a CI artifact AND surfaced in
 * the admin console. It contains no PII — only region names, timestamps,
 * counters, and latencies.
 */
import type { DrillOutcome, ProbeSample } from "./probes";

export interface DrillReportInput {
  drill_id: string;
  scenario: string;
  primary_region: string;
  secondary_region: string;
  outcome: DrillOutcome;
  probes: ProbeSample[];
  operator: string;
  git_sha?: string | null;
}

export interface DrillReport {
  version: 1;
  drill_id: string;
  scenario: string;
  status: DrillOutcome["status"];
  operator: string;
  git_sha: string | null;
  primary_region: string;
  secondary_region: string;
  measurements: DrillOutcome["measurements"];
  budgets_breached: DrillOutcome["breaches"];
  timeline: DrillOutcome["timeline"];
  probe_counts: {
    total: number;
    ok: number;
    degraded: number;
    down: number;
    per_region: Record<string, { ok: number; degraded: number; down: number }>;
  };
  generated_at_iso: string;
}

export function buildReport(input: DrillReportInput): DrillReport {
  const per_region: DrillReport["probe_counts"]["per_region"] = {};
  let ok = 0;
  let degraded = 0;
  let down = 0;
  for (const p of input.probes) {
    const bucket = (per_region[p.region] ??= { ok: 0, degraded: 0, down: 0 });
    bucket[p.status] += 1;
    if (p.status === "ok") ok += 1;
    else if (p.status === "degraded") degraded += 1;
    else down += 1;
  }
  return {
    version: 1,
    drill_id: input.drill_id,
    scenario: input.scenario,
    status: input.outcome.status,
    operator: input.operator,
    git_sha: input.git_sha ?? null,
    primary_region: input.primary_region,
    secondary_region: input.secondary_region,
    measurements: input.outcome.measurements,
    budgets_breached: input.outcome.breaches,
    timeline: input.outcome.timeline,
    probe_counts: { total: input.probes.length, ok, degraded, down, per_region },
    generated_at_iso: new Date().toISOString(),
  };
}

export function renderReportMarkdown(r: DrillReport): string {
  const statusBadge =
    r.status === "passed" ? "✅ PASSED" : r.status === "breached" ? "❌ BREACHED" : "⚠️ ABORTED";
  const breaches = r.budgets_breached.length
    ? r.budgets_breached
        .map((b) => `- **${b.kind.toUpperCase()}**: actual \`${b.actual}\`, budget \`${b.budget}\``)
        .join("\n")
    : "_None — all budgets met._";
  const regionRows = Object.entries(r.probe_counts.per_region)
    .map(([reg, c]) => `| ${reg} | ${c.ok} | ${c.degraded} | ${c.down} |`)
    .join("\n");
  const t = r.timeline;
  const iso = (ms: number) => new Date(ms).toISOString();
  return `# DR Drill Report — ${r.drill_id}

**Status:** ${statusBadge}
**Scenario:** ${r.scenario}
**Operator:** ${r.operator}
**Git SHA:** \`${r.git_sha ?? "n/a"}\`
**Generated:** ${r.generated_at_iso}

## Regions
- **Primary:** ${r.primary_region}
- **Secondary:** ${r.secondary_region}

## Measurements
| Metric | Value |
|---|---|
| RPO | ${r.measurements.rpo_seconds}s |
| RTO | ${r.measurements.rto_seconds}s |
| Primary p95 latency | ${r.measurements.primary_p95_ms ?? "n/a"} ms |
| Secondary p95 latency | ${r.measurements.secondary_p95_ms ?? "n/a"} ms |
| Probe success rate | ${(r.measurements.probe_success_rate * 100).toFixed(1)}% |

## Budgets Breached
${breaches}

## Timeline (UTC)
- Drill started: ${iso(t.drill_started_at_ms)}
- Last backup: ${iso(t.last_successful_backup_at_ms)}
- Primary failure detected: ${iso(t.primary_failure_detected_at_ms)}
- Failover initiated: ${iso(t.failover_initiated_at_ms)}
- Secondary healthy: ${iso(t.secondary_healthy_at_ms)}
- Drill completed: ${iso(t.drill_completed_at_ms)}

## Probe Counts
| Region | OK | Degraded | Down |
|---|---|---|---|
${regionRows || "| _no samples_ | 0 | 0 | 0 |"}

Total samples: **${r.probe_counts.total}**
`;
}
