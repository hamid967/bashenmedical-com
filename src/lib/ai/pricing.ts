/**
 * AI cost transparency helpers.
 * Prices are approximate per 1M tokens in Lovable credits — display only.
 * Update as gateway pricing changes.
 */

export type ModelRate = {
  /** credits per 1M input tokens */
  inPer1M: number;
  /** credits per 1M output tokens */
  outPer1M: number;
};

const RATES: Record<string, ModelRate> = {
  "google/gemini-2.5-flash": { inPer1M: 15, outPer1M: 60 },
  "google/gemini-2.5-flash-lite": { inPer1M: 7, outPer1M: 30 },
  "google/gemini-3.5-flash": { inPer1M: 20, outPer1M: 80 },
  "google/gemini-3.6-flash": { inPer1M: 25, outPer1M: 100 },
  "google/gemini-2.5-pro": { inPer1M: 125, outPer1M: 500 },
  "openai/gpt-5.4": { inPer1M: 250, outPer1M: 1000 },
  "openai/gpt-5.4-mini": { inPer1M: 60, outPer1M: 240 },
  "openai/gpt-5.4-nano": { inPer1M: 12, outPer1M: 48 },
};

const DEFAULT_RATE: ModelRate = { inPer1M: 25, outPer1M: 100 };

export function getRate(model?: string): ModelRate {
  if (!model) return DEFAULT_RATE;
  return RATES[model] ?? DEFAULT_RATE;
}

/** Very rough token estimate: ~4 chars/token (Latin) or ~2 chars/token (Arabic). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const isArabic = /[\u0600-\u06FF]/.test(text);
  const divisor = isArabic ? 2.2 : 4;
  return Math.max(1, Math.ceil(text.length / divisor));
}

export function estimateCredits(inputTokens: number, outputTokens: number, model?: string): number {
  const r = getRate(model);
  return (inputTokens * r.inPer1M + outputTokens * r.outPer1M) / 1_000_000;
}

export function formatCredits(credits: number): string {
  if (!isFinite(credits) || credits <= 0) return "0";
  if (credits < 0.001) return "<0.001";
  if (credits < 1) return credits.toFixed(3);
  return credits.toFixed(2);
}

export function formatTokens(n: number): string {
  if (!isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
