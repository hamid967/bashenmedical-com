/**
 * Release Gate — pure evaluation logic for Production deploy readiness.
 *
 * The gate encodes the NO-GO conditions defined by the release captain:
 * pentest sign-off, DR drill freshness, CAPTCHA enforcement, green unit
 * suite, clean ESLint state, and staging approvals. Every condition has a
 * severity ("blocking" vs "advisory"); any blocking condition that is not
 * "pass" flips the overall verdict to NO-GO and Production deploys must
 * abort. The module is intentionally dependency-free so the same evaluator
 * can run in Node (CI script), the browser (dashboard), and unit tests.
 */

export type CheckStatus = "pass" | "fail" | "warn" | "unknown";
export type Severity = "blocking" | "advisory";

export interface CheckInput {
  id: string;
  label: string;
  severity: Severity;
  status: CheckStatus;
  detail?: string;
  /** ISO timestamp of the underlying measurement. */
  measuredAt?: string;
  /** Maximum age (seconds) before a "pass" degrades to "warn". */
  maxAgeSeconds?: number;
  /** Freeform evidence link (report URL, commit sha, run id). */
  evidenceUrl?: string;
}

export interface CheckResult extends CheckInput {
  ageSeconds: number | null;
  stale: boolean;
  effectiveStatus: CheckStatus;
}

export type Verdict = "GO" | "NO_GO";

export interface GateEvaluation {
  verdict: Verdict;
  evaluatedAt: string;
  blockingFailures: string[];
  advisoryWarnings: string[];
  checks: CheckResult[];
}

/** Canonical set of release-gate check IDs. */
export const RELEASE_CHECKS = {
  pentest: "pentest",
  drDrill: "dr_drill",
  captcha: "captcha",
  unitTests: "unit_tests",
  eslint: "eslint",
  stagingApproval: "staging_approval",
} as const;

export type ReleaseCheckId = (typeof RELEASE_CHECKS)[keyof typeof RELEASE_CHECKS];

const DEFAULT_MAX_AGE: Record<ReleaseCheckId, number> = {
  pentest: 60 * 60 * 24 * 90, // 90 days
  dr_drill: 60 * 60 * 24 * 14, // 14 days
  captcha: 60 * 60 * 24 * 7, // 7 days
  unit_tests: 60 * 60 * 24, // 1 day
  eslint: 60 * 60 * 24, // 1 day
  staging_approval: 60 * 60 * 24 * 3, // 3 days
};

const DEFAULT_SEVERITY: Record<ReleaseCheckId, Severity> = {
  pentest: "blocking",
  dr_drill: "blocking",
  captcha: "blocking",
  unit_tests: "blocking",
  eslint: "blocking",
  staging_approval: "blocking",
};

const DEFAULT_LABELS: Record<ReleaseCheckId, string> = {
  pentest: "Pentest sign-off",
  dr_drill: "DR drill (RPO/RTO within budget)",
  captcha: "CAPTCHA fail-closed on OTP/inquiries",
  unit_tests: "Unit test suite green",
  eslint: "ESLint clean (no errors)",
  staging_approval: "Staging approval recorded",
};

function ageSecondsFrom(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 1000));
}

/**
 * Normalize a partial input into a full CheckResult. Applies defaults for
 * canonical check ids and computes staleness against maxAgeSeconds.
 */
export function normalizeCheck(
  input: Partial<CheckInput> & { id: string },
  now = Date.now(),
): CheckResult {
  const id = input.id;
  const canonical = (Object.values(RELEASE_CHECKS) as string[]).includes(id)
    ? (id as ReleaseCheckId)
    : null;
  const label = input.label ?? (canonical ? DEFAULT_LABELS[canonical] : id);
  const severity: Severity =
    input.severity ?? (canonical ? DEFAULT_SEVERITY[canonical] : "advisory");
  const maxAgeSeconds = input.maxAgeSeconds ?? (canonical ? DEFAULT_MAX_AGE[canonical] : undefined);
  const status: CheckStatus = input.status ?? "unknown";
  const ageSeconds = ageSecondsFrom(input.measuredAt, now);
  const stale = ageSeconds != null && maxAgeSeconds != null && ageSeconds > maxAgeSeconds;
  // A "pass" that is stale degrades to "warn"; everything else keeps its status.
  const effectiveStatus: CheckStatus = stale && status === "pass" ? "warn" : status;
  return {
    id,
    label,
    severity,
    status,
    detail: input.detail,
    measuredAt: input.measuredAt,
    maxAgeSeconds,
    evidenceUrl: input.evidenceUrl,
    ageSeconds,
    stale,
    effectiveStatus,
  };
}

/**
 * Evaluate the gate. A single blocking non-pass produces NO_GO. Stale
 * blocking passes also produce NO_GO because we treat them as "unknown".
 */
export function evaluateGate(
  inputs: Array<Partial<CheckInput> & { id: string }>,
  now: number = Date.now(),
): GateEvaluation {
  const checks = inputs.map((c) => normalizeCheck(c, now));
  const blockingFailures: string[] = [];
  const advisoryWarnings: string[] = [];
  for (const c of checks) {
    const isPass = c.effectiveStatus === "pass";
    if (c.severity === "blocking" && !isPass) blockingFailures.push(c.id);
    else if (c.severity === "advisory" && !isPass) advisoryWarnings.push(c.id);
  }
  return {
    verdict: blockingFailures.length === 0 ? "GO" : "NO_GO",
    evaluatedAt: new Date(now).toISOString(),
    blockingFailures,
    advisoryWarnings,
    checks,
  };
}

/** Human-readable single-line summary suitable for CI logs. */
export function formatGateSummary(evaluation: GateEvaluation): string {
  const parts = evaluation.checks.map(
    (c) => `${c.id}=${c.effectiveStatus}${c.stale ? "(stale)" : ""}`,
  );
  return `${evaluation.verdict} :: ${parts.join(" ")}`;
}
