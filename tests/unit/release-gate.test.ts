/**
 * Unit tests for the Release Gate evaluator.
 * Run: bun tests/unit/release-gate.test.ts
 */
import { evaluateGate, normalizeCheck, RELEASE_CHECKS } from "../../src/lib/release/gate";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("✗", msg);
    process.exitCode = 1;
  } else {
    console.log("✓", msg);
  }
}

const now = Date.parse("2026-07-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now - d * 86400_000).toISOString();

// All-pass scenario → GO
{
  const e = evaluateGate(
    [
      { id: RELEASE_CHECKS.pentest, status: "pass", measuredAt: daysAgo(10) },
      { id: RELEASE_CHECKS.drDrill, status: "pass", measuredAt: daysAgo(2) },
      { id: RELEASE_CHECKS.captcha, status: "pass", measuredAt: daysAgo(1) },
      { id: RELEASE_CHECKS.unitTests, status: "pass", measuredAt: daysAgo(0) },
      { id: RELEASE_CHECKS.eslint, status: "pass", measuredAt: daysAgo(0) },
      { id: RELEASE_CHECKS.stagingApproval, status: "pass", measuredAt: daysAgo(1) },
    ],
    now,
  );
  assert(e.verdict === "GO", "all-pass ⇒ GO");
  assert(e.blockingFailures.length === 0, "all-pass ⇒ no blocking failures");
}

// Single blocking fail ⇒ NO_GO
{
  const e = evaluateGate(
    [
      { id: RELEASE_CHECKS.pentest, status: "pass", measuredAt: daysAgo(1) },
      { id: RELEASE_CHECKS.unitTests, status: "fail", measuredAt: daysAgo(0) },
    ],
    now,
  );
  assert(e.verdict === "NO_GO", "unit fail ⇒ NO_GO");
  assert(e.blockingFailures.includes("unit_tests"), "unit_tests recorded as blocking failure");
}

// Stale pentest ⇒ effectiveStatus warn ⇒ NO_GO
{
  const e = evaluateGate(
    [{ id: RELEASE_CHECKS.pentest, status: "pass", measuredAt: daysAgo(200) }],
    now,
  );
  const pentest = e.checks.find((c) => c.id === "pentest")!;
  assert(pentest.stale === true, "200-day-old pentest is stale");
  assert(pentest.effectiveStatus === "warn", "stale pass degrades to warn");
  assert(e.verdict === "NO_GO", "stale blocking pass ⇒ NO_GO");
}

// Unknown status ⇒ NO_GO for blocking
{
  const e = evaluateGate([{ id: RELEASE_CHECKS.captcha, status: "unknown" }], now);
  assert(e.verdict === "NO_GO", "unknown blocking ⇒ NO_GO");
}

// Advisory fail does not block
{
  const e = evaluateGate(
    [
      { id: RELEASE_CHECKS.unitTests, status: "pass", measuredAt: daysAgo(0) },
      { id: RELEASE_CHECKS.eslint, status: "pass", measuredAt: daysAgo(0) },
      { id: RELEASE_CHECKS.pentest, status: "pass", measuredAt: daysAgo(1) },
      { id: RELEASE_CHECKS.drDrill, status: "pass", measuredAt: daysAgo(1) },
      { id: RELEASE_CHECKS.captcha, status: "pass", measuredAt: daysAgo(1) },
      { id: RELEASE_CHECKS.stagingApproval, status: "pass", measuredAt: daysAgo(0) },
      { id: "lighthouse", status: "fail", severity: "advisory" },
    ],
    now,
  );
  assert(e.verdict === "GO", "advisory failure does not block GO");
  assert(e.advisoryWarnings.includes("lighthouse"), "advisory recorded as warning");
}

// normalizeCheck defaults
{
  const c = normalizeCheck({ id: RELEASE_CHECKS.eslint }, now);
  assert(c.label === "ESLint clean (no errors)", "canonical label applied");
  assert(c.severity === "blocking", "canonical severity applied");
}

console.log("release-gate tests done");
