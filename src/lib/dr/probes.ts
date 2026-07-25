/**
 * Cross-region DR drill — pure logic layer.
 *
 * This module has NO side effects (no fetch, no fs, no env reads) so it can
 * be exercised in unit tests deterministically. The orchestrator in
 * `drill.server.ts` composes these primitives with real HTTP probes.
 *
 * Terminology
 * -----------
 * RPO (Recovery Point Objective) — the maximum acceptable data-loss window,
 *   measured as `failoverStartedAt - lastBackupAt`. Lower is better.
 * RTO (Recovery Time Objective) — the maximum acceptable outage duration,
 *   measured as `serviceRestoredAt - failoverStartedAt`. Lower is better.
 *
 * A drill is a scripted exercise that:
 *   1. probes the primary region until it fails (or we simulate a fail),
 *   2. cuts over to the secondary region and probes until healthy,
 *   3. measures the actual RPO/RTO,
 *   4. compares against configured budgets,
 *   5. emits alerts on budget breach, and
 *   6. produces a signed, versioned report.
 */

export type ProbeStatus = "ok" | "degraded" | "down";

export interface ProbeSample {
  region: string;
  url: string;
  status: ProbeStatus;
  http_status: number | null;
  latency_ms: number;
  timestamp_ms: number;
  error?: string;
}

export interface DrillBudgets {
  /** Maximum acceptable RPO in seconds. */
  rpo_seconds: number;
  /** Maximum acceptable RTO in seconds. */
  rto_seconds: number;
  /** Maximum acceptable p95 latency (ms) after failover. */
  post_failover_p95_ms?: number;
}

export interface DrillTimeline {
  drill_started_at_ms: number;
  primary_failure_detected_at_ms: number;
  last_successful_backup_at_ms: number;
  failover_initiated_at_ms: number;
  secondary_healthy_at_ms: number;
  drill_completed_at_ms: number;
}

export interface DrillMeasurements {
  rpo_seconds: number;
  rto_seconds: number;
  primary_p95_ms: number | null;
  secondary_p95_ms: number | null;
  probe_success_rate: number;
}

export type BudgetBreach =
  | { kind: "rpo"; actual: number; budget: number }
  | { kind: "rto"; actual: number; budget: number }
  | { kind: "latency"; actual: number; budget: number };

export interface DrillOutcome {
  status: "passed" | "breached" | "aborted";
  breaches: BudgetBreach[];
  measurements: DrillMeasurements;
  timeline: DrillTimeline;
}

/**
 * Compute RPO/RTO from a completed timeline. Both values are clamped to
 * `>= 0` — negative durations indicate a clock-skew bug in the caller, not
 * a legitimate metric, and we surface that by asserting via `assertTimeline`.
 */
export function computeRpoRto(timeline: DrillTimeline): {
  rpo_seconds: number;
  rto_seconds: number;
} {
  assertTimeline(timeline);
  const rpoMs = timeline.failover_initiated_at_ms - timeline.last_successful_backup_at_ms;
  const rtoMs = timeline.secondary_healthy_at_ms - timeline.failover_initiated_at_ms;
  return {
    rpo_seconds: Math.max(0, Math.round(rpoMs / 1000)),
    rto_seconds: Math.max(0, Math.round(rtoMs / 1000)),
  };
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarizeProbes(samples: ProbeSample[], region: string): number | null {
  const latencies = samples
    .filter((s) => s.region === region && s.status !== "down")
    .map((s) => s.latency_ms);
  return percentile(latencies, 95);
}

export function successRate(samples: ProbeSample[]): number {
  if (samples.length === 0) return 0;
  const ok = samples.filter((s) => s.status === "ok").length;
  return ok / samples.length;
}

export function evaluateBudgets(
  measurements: DrillMeasurements,
  budgets: DrillBudgets,
): BudgetBreach[] {
  const breaches: BudgetBreach[] = [];
  if (measurements.rpo_seconds > budgets.rpo_seconds) {
    breaches.push({ kind: "rpo", actual: measurements.rpo_seconds, budget: budgets.rpo_seconds });
  }
  if (measurements.rto_seconds > budgets.rto_seconds) {
    breaches.push({ kind: "rto", actual: measurements.rto_seconds, budget: budgets.rto_seconds });
  }
  if (
    budgets.post_failover_p95_ms !== undefined &&
    measurements.secondary_p95_ms !== null &&
    measurements.secondary_p95_ms > budgets.post_failover_p95_ms
  ) {
    breaches.push({
      kind: "latency",
      actual: measurements.secondary_p95_ms,
      budget: budgets.post_failover_p95_ms,
    });
  }
  return breaches;
}

export function decideOutcome(
  timeline: DrillTimeline,
  samples: ProbeSample[],
  budgets: DrillBudgets,
  opts: { primary_region: string; secondary_region: string; aborted?: boolean } = {
    primary_region: "primary",
    secondary_region: "secondary",
  },
): DrillOutcome {
  const { rpo_seconds, rto_seconds } = computeRpoRto(timeline);
  const measurements: DrillMeasurements = {
    rpo_seconds,
    rto_seconds,
    primary_p95_ms: summarizeProbes(samples, opts.primary_region),
    secondary_p95_ms: summarizeProbes(samples, opts.secondary_region),
    probe_success_rate: successRate(samples),
  };
  const breaches = evaluateBudgets(measurements, budgets);
  const status: DrillOutcome["status"] = opts.aborted
    ? "aborted"
    : breaches.length === 0
      ? "passed"
      : "breached";
  return { status, breaches, measurements, timeline };
}

function assertTimeline(t: DrillTimeline): void {
  // Ordering invariants — any violation is a caller bug, not a drill result.
  const seq = [
    ["drill_started_at_ms", t.drill_started_at_ms],
    ["last_successful_backup_at_ms", t.last_successful_backup_at_ms],
    ["primary_failure_detected_at_ms", t.primary_failure_detected_at_ms],
    ["failover_initiated_at_ms", t.failover_initiated_at_ms],
    ["secondary_healthy_at_ms", t.secondary_healthy_at_ms],
    ["drill_completed_at_ms", t.drill_completed_at_ms],
  ] as const;
  for (const [name, v] of seq) {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`invalid_timeline_field: ${name}`);
  }
  if (t.last_successful_backup_at_ms > t.failover_initiated_at_ms) {
    throw new Error("invalid_timeline: backup after failover");
  }
  if (t.failover_initiated_at_ms > t.secondary_healthy_at_ms) {
    throw new Error("invalid_timeline: healthy before failover");
  }
  if (t.drill_started_at_ms > t.drill_completed_at_ms) {
    throw new Error("invalid_timeline: completed before started");
  }
}
