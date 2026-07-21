/**
 * Per-session and per-request budget caps for AI streaming.
 *
 * The cap is enforced client-side by:
 *  1. A pre-flight check using estimated input tokens + a projected output.
 *  2. A live check during streaming (via `checkRunning`) that aborts the
 *     controller once the running estimated cost of the current request
 *     exceeds the per-request cap or would push session usage over the
 *     session cap / available credits.
 *
 * Costs are estimates only (see pricing.ts). Server-side final usage may
 * differ; we reconcile session totals with `commit()` when usage arrives.
 */

import { estimateCredits, estimateTokens, getRate } from "./pricing";

export type BudgetSurface = "public" | "portal" | "admin";

export type BudgetLimits = {
  /** Hard cap on estimated credits for a single request. */
  maxCreditsPerRequest: number;
  /** Hard cap on estimated credits accumulated across a session. */
  maxCreditsPerSession: number;
  /** Optional external available-credits ceiling (e.g. workspace balance). */
  availableCredits?: number | null;
};

const DEFAULT_LIMITS: Record<BudgetSurface, BudgetLimits> = {
  public: { maxCreditsPerRequest: 2, maxCreditsPerSession: 15 },
  portal: { maxCreditsPerRequest: 3, maxCreditsPerSession: 40 },
  admin: { maxCreditsPerRequest: 8, maxCreditsPerSession: 200 },
};

const STORAGE_PREFIX = "baeshen.ai.budget.session.";

export function getDefaultLimits(surface: BudgetSurface): BudgetLimits {
  return { ...DEFAULT_LIMITS[surface] };
}

function storageKey(surface: BudgetSurface) {
  return `${STORAGE_PREFIX}${surface}`;
}

/** Read the running session total of estimated credits for this surface. */
export function readSessionSpent(surface: BudgetSurface): number {
  if (typeof window === "undefined") return 0;
  const raw = window.sessionStorage.getItem(storageKey(surface));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Add committed credits to the session running total. */
export function commitSessionCredits(surface: BudgetSurface, credits: number) {
  if (typeof window === "undefined" || !Number.isFinite(credits) || credits <= 0) return;
  const next = readSessionSpent(surface) + credits;
  window.sessionStorage.setItem(storageKey(surface), String(next));
}

export function resetSessionCredits(surface: BudgetSurface) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKey(surface));
}

export type BudgetBlockReason =
  | "per_request"
  | "per_session"
  | "available_credits";

export type BudgetCheckResult =
  | { ok: true }
  | { ok: false; reason: BudgetBlockReason; cap: number; wouldSpend: number };

/**
 * Pre-flight check before starting a request. Uses an estimate of the
 * output size (defaults to ~512 tokens) since we don't know the true
 * completion length yet.
 */
export function preflightBudget(input: {
  surface: BudgetSurface;
  limits: BudgetLimits;
  model?: string;
  promptText: string;
  projectedOutputTokens?: number;
}): BudgetCheckResult {
  const projectedOut = input.projectedOutputTokens ?? 512;
  const promptTokens = estimateTokens(input.promptText);
  const estimated = estimateCredits(promptTokens, projectedOut, input.model);
  return evaluate(input.surface, input.limits, estimated);
}

/**
 * Live check callable during streaming with the accumulated output text.
 * Returns `ok:false` once the running estimate crosses any cap so the
 * caller can abort the request.
 */
export function checkRunningBudget(input: {
  surface: BudgetSurface;
  limits: BudgetLimits;
  model?: string;
  promptText: string;
  outputSoFar: string;
}): BudgetCheckResult {
  const promptTokens = estimateTokens(input.promptText);
  const outTokens = estimateTokens(input.outputSoFar);
  const estimated = estimateCredits(promptTokens, outTokens, input.model);
  return evaluate(input.surface, input.limits, estimated);
}

function evaluate(
  surface: BudgetSurface,
  limits: BudgetLimits,
  estimatedForRequest: number,
): BudgetCheckResult {
  if (estimatedForRequest > limits.maxCreditsPerRequest) {
    return {
      ok: false,
      reason: "per_request",
      cap: limits.maxCreditsPerRequest,
      wouldSpend: estimatedForRequest,
    };
  }
  const sessionSpent = readSessionSpent(surface);
  const projectedSession = sessionSpent + estimatedForRequest;
  if (projectedSession > limits.maxCreditsPerSession) {
    return {
      ok: false,
      reason: "per_session",
      cap: limits.maxCreditsPerSession,
      wouldSpend: projectedSession,
    };
  }
  if (
    typeof limits.availableCredits === "number" &&
    limits.availableCredits >= 0 &&
    projectedSession > limits.availableCredits
  ) {
    return {
      ok: false,
      reason: "available_credits",
      cap: limits.availableCredits,
      wouldSpend: projectedSession,
    };
  }
  return { ok: true };
}

export function budgetBlockMessage(
  result: Extract<BudgetCheckResult, { ok: false }>,
  lang: "ar" | "en",
): string {
  const ar = lang === "ar";
  const cap = result.cap.toFixed(2);
  const spent = result.wouldSpend.toFixed(2);
  switch (result.reason) {
    case "per_request":
      return ar
        ? `تم إيقاف الطلب: التكلفة المتوقعة (${spent} رصيد) تتجاوز الحد الأقصى للطلب الواحد (${cap}).`
        : `Request stopped: estimated cost ${spent} credits exceeds the per-request cap of ${cap}.`;
    case "per_session":
      return ar
        ? `تم إيقاف الطلب: تم تجاوز حد الجلسة (${cap} رصيد). أعد الجلسة أو ارفع الحد.`
        : `Request stopped: session budget of ${cap} credits reached. Reset the session or raise the limit.`;
    case "available_credits":
      return ar
        ? `تم إيقاف الطلب: الائتمانات المتاحة غير كافية (المتاح ${cap} رصيد).`
        : `Request stopped: not enough available credits (${cap} remaining).`;
  }
}

/** Convenience: cheapest reasonable estimate for a single message. */
export function quickEstimateCredits(promptText: string, model?: string) {
  const r = getRate(model);
  return { rate: r, tokens: estimateTokens(promptText) };
}
