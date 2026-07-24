/**
 * DR drill invariants — pure-logic tests + a simulated end-to-end drill.
 *
 * Run: bun test tests/unit/dr-drill.test.ts
 *
 * We assert:
 *   - RPO/RTO are computed from the timeline and clamped to >= 0.
 *   - Invalid timelines (backup after failover, healthy before failover)
 *     throw instead of silently returning bogus metrics.
 *   - Budget evaluation flags exactly the breaches present.
 *   - A simulated cross-region drill produces a passed report when the
 *     secondary comes back healthy within budget.
 *   - The orchestrator aborts (instead of hanging) when the secondary
 *     never becomes healthy before the drill timeout.
 *   - Alert dispatch fires on breach and stays silent on pass.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  computeRpoRto,
  decideOutcome,
  evaluateBudgets,
  percentile,
  successRate,
  type DrillBudgets,
  type DrillTimeline,
  type ProbeSample,
} from "../../src/lib/dr/probes";
import { runDrill } from "../../src/lib/dr/drill.server";
import { buildReport, renderReportMarkdown } from "../../src/lib/dr/report";
import { buildAlertText, dispatchDrillAlert } from "../../src/lib/dr/alerts.server";

const BUDGETS: DrillBudgets = { rpo_seconds: 300, rto_seconds: 600, post_failover_p95_ms: 2000 };

function timeline(overrides: Partial<DrillTimeline> = {}): DrillTimeline {
  const base = 1_700_000_000_000;
  return {
    drill_started_at_ms: base,
    last_successful_backup_at_ms: base + 10_000,
    primary_failure_detected_at_ms: base + 30_000,
    failover_initiated_at_ms: base + 40_000,
    secondary_healthy_at_ms: base + 90_000,
    drill_completed_at_ms: base + 95_000,
    ...overrides,
  };
}

describe("RPO/RTO math", () => {
  test("computes seconds from a well-formed timeline", () => {
    const { rpo_seconds, rto_seconds } = computeRpoRto(timeline());
    expect(rpo_seconds).toBe(30); // 40s failover - 10s backup
    expect(rto_seconds).toBe(50); // 90s healthy - 40s failover
  });

  test("rejects a backup timestamp after failover", () => {
    expect(() =>
      computeRpoRto(timeline({ last_successful_backup_at_ms: 1_700_000_000_000 + 60_000 })),
    ).toThrow(/backup after failover/);
  });

  test("rejects a healthy timestamp before failover", () => {
    expect(() =>
      computeRpoRto(
        timeline({
          failover_initiated_at_ms: 1_700_000_000_000 + 100_000,
          secondary_healthy_at_ms: 1_700_000_000_000 + 90_000,
        }),
      ),
    ).toThrow(/healthy before failover/);
  });

  test("percentile handles empty and single-sample sets", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([42], 95)).toBe(42);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)).toBe(100);
  });
});

describe("budget evaluation", () => {
  test("no breaches when within budget", () => {
    const breaches = evaluateBudgets(
      { rpo_seconds: 30, rto_seconds: 50, primary_p95_ms: 100, secondary_p95_ms: 150, probe_success_rate: 1 },
      BUDGETS,
    );
    expect(breaches).toEqual([]);
  });

  test("flags RPO, RTO, and latency independently", () => {
    const breaches = evaluateBudgets(
      { rpo_seconds: 999, rto_seconds: 999, primary_p95_ms: 100, secondary_p95_ms: 5000, probe_success_rate: 0.5 },
      BUDGETS,
    );
    expect(breaches.map((b) => b.kind).sort()).toEqual(["latency", "rpo", "rto"]);
  });
});

describe("decideOutcome", () => {
  const samples: ProbeSample[] = [
    { region: "eu-w1", url: "u", status: "ok", http_status: 200, latency_ms: 100, timestamp_ms: 1 },
    { region: "us-e1", url: "u", status: "ok", http_status: 200, latency_ms: 200, timestamp_ms: 2 },
  ];
  test("passed when all budgets met", () => {
    const outcome = decideOutcome(timeline(), samples, BUDGETS, {
      primary_region: "eu-w1",
      secondary_region: "us-e1",
    });
    expect(outcome.status).toBe("passed");
    expect(outcome.breaches).toEqual([]);
    expect(successRate(samples)).toBe(1);
  });

  test("breached when RTO exceeded", () => {
    const outcome = decideOutcome(
      timeline({ secondary_healthy_at_ms: 1_700_000_000_000 + 700_000 }),
      samples,
      BUDGETS,
      { primary_region: "eu-w1", secondary_region: "us-e1" },
    );
    expect(outcome.status).toBe("breached");
    expect(outcome.breaches.map((b) => b.kind)).toContain("rto");
  });
});

// ---------------------------------------------------------------------------
// End-to-end orchestrator simulation. Uses a virtual clock + injected fetch
// so the "drill" completes in microseconds regardless of probe_interval_ms.
// ---------------------------------------------------------------------------

function virtualClock(start = 1_700_000_000_000) {
  let t = start;
  const orig = globalThis.setTimeout;
  const now = () => t;
  const advance = (ms: number) => {
    t += ms;
  };
  // Replace setTimeout with an immediate-resolve that also advances the clock.
  (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((cb: () => void, ms?: number) => {
    advance(ms ?? 0);
    return orig(cb, 0);
  }) as unknown as typeof setTimeout;
  return { now, advance, restore: () => ((globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = orig) };
}

describe("runDrill orchestrator", () => {
  let clock: ReturnType<typeof virtualClock>;
  beforeEach(() => {
    clock = virtualClock();
  });
  afterEach(() => clock.restore());

  test("passed drill: primary fails, secondary recovers within budget", async () => {
    const startedAt = clock.now();
    const fakeFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("secondary")) return new Response("ok", { status: 200 });
      return new Response("ok", { status: 200 });
    };
    const report = await runDrill(
      {
        drill_id: "test-1",
        scenario: "unit-test",
        operator: "ci",
        primary: { region: "primary", healthUrl: "https://primary.example/health" },
        secondary: { region: "secondary", healthUrl: "https://secondary.example/health" },
        budgets: BUDGETS,
        consecutive_samples: 2,
        probe_interval_ms: 100,
        max_duration_ms: 60_000,
      },
      {
        now: clock.now,
        fetchImpl: fakeFetch,
        getLastBackupAtMs: () => startedAt - 30_000,
        // Primary simulated down starting immediately so the drill converges fast.
        shouldSimulateDown: (region) => region === "primary",
      },
    );

    expect(report.status).toBe("passed");
    expect(report.measurements.rpo_seconds).toBeGreaterThanOrEqual(30);
    expect(report.measurements.rto_seconds).toBeGreaterThanOrEqual(0);
    expect(report.timeline.failover_initiated_at_ms).toBeGreaterThanOrEqual(
      report.timeline.primary_failure_detected_at_ms,
    );
    expect(report.probe_counts.per_region.primary.down).toBeGreaterThanOrEqual(2);
    expect(report.probe_counts.per_region.secondary.ok).toBeGreaterThanOrEqual(2);
  });

  test("aborted drill: secondary never becomes healthy before deadline", async () => {
    const fakeFetch: typeof fetch = async (url) => {
      if (String(url).includes("secondary")) return new Response("bad", { status: 503 });
      return new Response("ok", { status: 200 });
    };
    const report = await runDrill(
      {
        drill_id: "test-2",
        scenario: "unit-test",
        operator: "ci",
        primary: { region: "primary", healthUrl: "https://primary.example/health" },
        secondary: { region: "secondary", healthUrl: "https://secondary.example/health" },
        budgets: BUDGETS,
        consecutive_samples: 2,
        probe_interval_ms: 50,
        max_duration_ms: 2_000,
      },
      {
        now: clock.now,
        fetchImpl: fakeFetch,
        getLastBackupAtMs: () => clock.now() - 5_000,
        shouldSimulateDown: (region) => region === "primary",
      },
    );

    expect(report.status).toBe("aborted");
    expect(report.scenario).toContain("secondary_never_healthy");
  });
});

describe("report rendering", () => {
  test("markdown contains status, measurements, and timeline", () => {
    const outcome = decideOutcome(timeline(), [], BUDGETS, {
      primary_region: "eu",
      secondary_region: "us",
    });
    const report = buildReport({
      drill_id: "r1",
      scenario: "s",
      operator: "op",
      primary_region: "eu",
      secondary_region: "us",
      outcome,
      probes: [],
    });
    const md = renderReportMarkdown(report);
    expect(md).toContain("DR Drill Report — r1");
    expect(md).toContain("RPO");
    expect(md).toContain("RTO");
    expect(md).toContain("Timeline");
  });
});

describe("alert dispatch", () => {
  test("skips when drill passed", async () => {
    const outcome = decideOutcome(timeline(), [], BUDGETS, {
      primary_region: "eu",
      secondary_region: "us",
    });
    const report = buildReport({
      drill_id: "r-pass",
      scenario: "s",
      operator: "op",
      primary_region: "eu",
      secondary_region: "us",
      outcome,
      probes: [],
    });
    const result = await dispatchDrillAlert(report, { webhookUrl: "https://hook.invalid/nope" });
    expect(result.attempted).toBe(false);
  });

  test("posts to webhook when drill breached", async () => {
    const outcome = decideOutcome(
      timeline({ secondary_healthy_at_ms: 1_700_000_000_000 + 800_000 }),
      [],
      BUDGETS,
      { primary_region: "eu", secondary_region: "us" },
    );
    const report = buildReport({
      drill_id: "r-breach",
      scenario: "s",
      operator: "op",
      primary_region: "eu",
      secondary_region: "us",
      outcome,
      probes: [],
    });
    let captured: { url: string; body: string } | null = null;
    const fakeFetch: typeof fetch = async (url, init) => {
      captured = { url: String(url), body: String(init?.body ?? "") };
      return new Response("ok", { status: 200 });
    };
    const result = await dispatchDrillAlert(report, {
      webhookUrl: "https://hook.example/dr",
      fetchImpl: fakeFetch,
    });
    expect(result.delivered).toBe(true);
    expect(captured!.url).toBe("https://hook.example/dr");
    expect(captured!.body).toContain("r-breach");
    expect(buildAlertText(report)).toMatch(/BREACHED/);
  });

  test("webhook 5xx marks not-delivered but does not throw", async () => {
    const outcome = decideOutcome(
      timeline({ secondary_healthy_at_ms: 1_700_000_000_000 + 800_000 }),
      [],
      BUDGETS,
      { primary_region: "eu", secondary_region: "us" },
    );
    const report = buildReport({
      drill_id: "r-5xx",
      scenario: "s",
      operator: "op",
      primary_region: "eu",
      secondary_region: "us",
      outcome,
      probes: [],
    });
    const fakeFetch: typeof fetch = async () => new Response("nope", { status: 502 });
    const result = await dispatchDrillAlert(report, {
      webhookUrl: "https://hook.example/dr",
      fetchImpl: fakeFetch,
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBe("webhook_502");
  });
});
