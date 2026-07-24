/**
 * DR drill orchestrator — server-only.
 *
 * Runs a scripted failover exercise:
 *
 *   1. Probe the primary region until it fails (or a synthetic-fail marker
 *      is injected). Failure is: `n_consecutive` samples with status="down".
 *   2. Mark `primary_failure_detected_at_ms`; initiate cutover.
 *   3. Probe the secondary region until it becomes healthy (`n_consecutive`
 *      samples with status="ok").
 *   4. Compute RPO/RTO, evaluate budgets, build the report.
 *
 * Backup freshness is provided by the caller via `getLastBackupAtMs()` —
 * that hook is expected to return the timestamp of the most recent
 * successfully-verified backup replica in the secondary region.
 */
import {
  type DrillBudgets,
  type DrillTimeline,
  type ProbeSample,
  type ProbeStatus,
  decideOutcome,
} from "./probes";
import { buildReport, type DrillReport } from "./report";

export interface DrillPlan {
  drill_id: string;
  scenario: string;
  operator: string;
  git_sha?: string | null;
  primary: { region: string; healthUrl: string };
  secondary: { region: string; healthUrl: string };
  budgets: DrillBudgets;
  /** How many consecutive samples define a state change. */
  consecutive_samples: number;
  /** Delay between probes (ms). */
  probe_interval_ms: number;
  /** Hard timeout for the whole drill (ms). */
  max_duration_ms: number;
}

export interface DrillHooks {
  now?: () => number;
  fetchImpl?: typeof fetch;
  getLastBackupAtMs: () => Promise<number> | number;
  /**
   * Optional short-circuit: when this returns true for a probe, the probe
   * is treated as `down` regardless of the real HTTP response. Used to
   * inject a synthetic primary failure during drills so we don't need to
   * actually take production offline.
   */
  shouldSimulateDown?: (region: string, elapsed_ms: number) => boolean;
}

export async function runDrill(plan: DrillPlan, hooks: DrillHooks): Promise<DrillReport> {
  const now = hooks.now ?? Date.now;
  const doFetch = hooks.fetchImpl ?? fetch;
  const started = now();
  const deadline = started + plan.max_duration_ms;
  const samples: ProbeSample[] = [];

  const backupAt = await hooks.getLastBackupAtMs();

  // Phase 1: probe primary until it goes down.
  let primaryDownAt: number | null = null;
  let consecutiveDown = 0;
  while (now() < deadline && primaryDownAt === null) {
    const s = await probeOnce(plan.primary, doFetch, now, hooks.shouldSimulateDown, started);
    samples.push(s);
    consecutiveDown = s.status === "down" ? consecutiveDown + 1 : 0;
    if (consecutiveDown >= plan.consecutive_samples) primaryDownAt = s.timestamp_ms;
    if (primaryDownAt === null) await sleep(plan.probe_interval_ms);
  }

  if (primaryDownAt === null) return abortReport(plan, samples, started, now, backupAt, "primary_never_failed");

  // Phase 2: initiate cutover, probe secondary until healthy.
  const failoverInitiatedAt = now();
  let secondaryHealthyAt: number | null = null;
  let consecutiveOk = 0;
  while (now() < deadline && secondaryHealthyAt === null) {
    const s = await probeOnce(plan.secondary, doFetch, now, undefined, started);
    samples.push(s);
    consecutiveOk = s.status === "ok" ? consecutiveOk + 1 : 0;
    if (consecutiveOk >= plan.consecutive_samples) secondaryHealthyAt = s.timestamp_ms;
    if (secondaryHealthyAt === null) await sleep(plan.probe_interval_ms);
  }

  if (secondaryHealthyAt === null) {
    return abortReport(plan, samples, started, now, backupAt, "secondary_never_healthy", {
      primary_failure_detected_at_ms: primaryDownAt,
      failover_initiated_at_ms: failoverInitiatedAt,
    });
  }

  const timeline: DrillTimeline = {
    drill_started_at_ms: started,
    last_successful_backup_at_ms: backupAt,
    primary_failure_detected_at_ms: primaryDownAt,
    failover_initiated_at_ms: failoverInitiatedAt,
    secondary_healthy_at_ms: secondaryHealthyAt,
    drill_completed_at_ms: now(),
  };
  const outcome = decideOutcome(timeline, samples, plan.budgets, {
    primary_region: plan.primary.region,
    secondary_region: plan.secondary.region,
  });
  return buildReport({
    drill_id: plan.drill_id,
    scenario: plan.scenario,
    operator: plan.operator,
    git_sha: plan.git_sha,
    primary_region: plan.primary.region,
    secondary_region: plan.secondary.region,
    outcome,
    probes: samples,
  });
}

async function probeOnce(
  target: { region: string; healthUrl: string },
  doFetch: typeof fetch,
  now: () => number,
  simulate: DrillHooks["shouldSimulateDown"] | undefined,
  drillStart: number,
): Promise<ProbeSample> {
  const t0 = now();
  if (simulate?.(target.region, t0 - drillStart)) {
    return {
      region: target.region,
      url: target.healthUrl,
      status: "down",
      http_status: null,
      latency_ms: 0,
      timestamp_ms: t0,
      error: "simulated_down",
    };
  }
  try {
    const res = await doFetch(target.healthUrl, { method: "GET" });
    const latency = now() - t0;
    let status: ProbeStatus = "down";
    if (res.ok) status = latency > 2000 ? "degraded" : "ok";
    else if (res.status >= 500) status = "down";
    else status = "degraded";
    return {
      region: target.region,
      url: target.healthUrl,
      status,
      http_status: res.status,
      latency_ms: latency,
      timestamp_ms: t0,
    };
  } catch (e) {
    return {
      region: target.region,
      url: target.healthUrl,
      status: "down",
      http_status: null,
      latency_ms: now() - t0,
      timestamp_ms: t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function abortReport(
  plan: DrillPlan,
  samples: ProbeSample[],
  started: number,
  now: () => number,
  backupAt: number,
  reason: string,
  partial: Partial<DrillTimeline> = {},
): DrillReport {
  const t = now();
  const timeline: DrillTimeline = {
    drill_started_at_ms: started,
    last_successful_backup_at_ms: backupAt,
    primary_failure_detected_at_ms: partial.primary_failure_detected_at_ms ?? t,
    failover_initiated_at_ms: partial.failover_initiated_at_ms ?? t,
    secondary_healthy_at_ms: t,
    drill_completed_at_ms: t,
  };
  const outcome = decideOutcome(timeline, samples, plan.budgets, {
    primary_region: plan.primary.region,
    secondary_region: plan.secondary.region,
    aborted: true,
  });
  const report = buildReport({
    drill_id: plan.drill_id,
    scenario: `${plan.scenario} [aborted: ${reason}]`,
    operator: plan.operator,
    git_sha: plan.git_sha,
    primary_region: plan.primary.region,
    secondary_region: plan.secondary.region,
    outcome,
    probes: samples,
  });
  return report;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
