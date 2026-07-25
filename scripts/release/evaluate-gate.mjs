#!/usr/bin/env node
/**
 * scripts/release/evaluate-gate.mjs
 *
 * CI entrypoint for the Production release gate. Reads the current status of
 * every NO-GO condition from environment variables (populated by upstream
 * jobs or manually via workflow_dispatch), evaluates the gate, writes a
 * machine-readable status file, and exits non-zero when the verdict is
 * NO_GO so downstream deploy jobs are automatically skipped.
 *
 * Env vars consumed (all optional; missing ⇒ "unknown" ⇒ NO_GO for blocking):
 *   PENTEST_STATUS, PENTEST_MEASURED_AT, PENTEST_URL
 *   DR_STATUS,       DR_MEASURED_AT,      DR_URL
 *   CAPTCHA_STATUS,  CAPTCHA_MEASURED_AT, CAPTCHA_URL
 *   UNIT_STATUS,     UNIT_MEASURED_AT,    UNIT_URL
 *   ESLINT_STATUS,   ESLINT_MEASURED_AT,  ESLINT_URL
 *   STAGING_STATUS,  STAGING_MEASURED_AT, STAGING_URL
 *
 * Any status value falsy → "unknown". Accepts: pass | fail | warn | unknown.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { evaluateGate, formatGateSummary, RELEASE_CHECKS } from "../../src/lib/release/gate.ts";

const nowIso = new Date().toISOString();

function normStatus(v) {
  const s = (v ?? "").toString().trim().toLowerCase();
  return ["pass", "fail", "warn", "unknown"].includes(s) ? s : "unknown";
}

const inputs = [
  {
    id: RELEASE_CHECKS.pentest,
    status: normStatus(process.env.PENTEST_STATUS),
    measuredAt: process.env.PENTEST_MEASURED_AT || undefined,
    evidenceUrl: process.env.PENTEST_URL || undefined,
    detail: process.env.PENTEST_DETAIL || undefined,
  },
  {
    id: RELEASE_CHECKS.drDrill,
    status: normStatus(process.env.DR_STATUS),
    measuredAt: process.env.DR_MEASURED_AT || undefined,
    evidenceUrl: process.env.DR_URL || undefined,
    detail: process.env.DR_DETAIL || undefined,
  },
  {
    id: RELEASE_CHECKS.captcha,
    status: normStatus(process.env.CAPTCHA_STATUS),
    measuredAt: process.env.CAPTCHA_MEASURED_AT || undefined,
    evidenceUrl: process.env.CAPTCHA_URL || undefined,
    detail: process.env.CAPTCHA_DETAIL || undefined,
  },
  {
    id: RELEASE_CHECKS.unitTests,
    status: normStatus(process.env.UNIT_STATUS),
    measuredAt: process.env.UNIT_MEASURED_AT || nowIso,
    evidenceUrl: process.env.UNIT_URL || undefined,
    detail: process.env.UNIT_DETAIL || undefined,
  },
  {
    id: RELEASE_CHECKS.eslint,
    status: normStatus(process.env.ESLINT_STATUS),
    measuredAt: process.env.ESLINT_MEASURED_AT || nowIso,
    evidenceUrl: process.env.ESLINT_URL || undefined,
    detail: process.env.ESLINT_DETAIL || undefined,
  },
  {
    id: RELEASE_CHECKS.stagingApproval,
    status: normStatus(process.env.STAGING_STATUS),
    measuredAt: process.env.STAGING_MEASURED_AT || undefined,
    evidenceUrl: process.env.STAGING_URL || undefined,
    detail: process.env.STAGING_DETAIL || undefined,
  },
];

const evaluation = evaluateGate(inputs);

const outPath = resolve(
  process.cwd(),
  process.env.RELEASE_STATUS_PATH || "public/release-status.json",
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: nowIso,
      commitSha: process.env.GITHUB_SHA || null,
      runId: process.env.GITHUB_RUN_ID || null,
      runUrl:
        process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
          ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : null,
      evaluation,
    },
    null,
    2,
  ),
);

console.log(formatGateSummary(evaluation));
console.log(`release-gate: wrote ${outPath}`);

// Emit GitHub Actions outputs when available
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `verdict=${evaluation.verdict}\nblocking=${evaluation.blockingFailures.join(",")}\n`,
  );
}

if (evaluation.verdict === "NO_GO") {
  console.error(
    `::error::Release gate NO_GO — blocking: ${evaluation.blockingFailures.join(", ") || "(stale)"}`,
  );
  process.exit(2);
}
