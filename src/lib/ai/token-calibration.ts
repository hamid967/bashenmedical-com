/**
 * Token estimator calibration.
 *
 * We can't run a real tokenizer client-side without shipping a large
 * vocabulary, so pricing.ts uses a coarse chars/token heuristic. Whenever
 * the server returns real `usage` numbers we treat them as ground truth and
 * refine a per-(model, kind, script) chars-per-token ratio via EMA. Later
 * estimates read that calibrated ratio and reach real-usage accuracy after
 * a handful of samples, which lets the UI drop the "(est.)" tag.
 *
 * Persisted in localStorage so calibration survives reloads and improves
 * across sessions on the same device.
 */

export type TokenKind = "input" | "output";
export type Script = "ar" | "latin" | "mixed";

type Bucket = {
  /** exponential moving average of chars/token */
  cpt: number;
  /** how many samples fed the EMA */
  n: number;
  /** last update timestamp */
  ts: number;
};

type Store = Record<string, Bucket>;

const LS_KEY = "baeshen.ai.tok_calibration.v1";
const EMA_ALPHA = 0.25; // weight of a new sample
// Prior chars/token — mirrors pricing.ts defaults so pre-calibration behavior is unchanged.
const PRIOR: Record<Script, number> = { ar: 2.2, latin: 4, mixed: 3.2 };
// Confidence saturates around this many samples.
const CONFIDENCE_SATURATION = 8;

function detectScript(text: string): Script {
  if (!text) return "latin";
  const ar = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (ar && latin) {
    const ratio = ar / (ar + latin);
    if (ratio > 0.7) return "ar";
    if (ratio < 0.15) return "latin";
    return "mixed";
  }
  if (ar) return "ar";
  return "latin";
}

function normalizeModel(model?: string): string {
  return (model ?? "default").trim() || "default";
}

function bucketKey(model: string, kind: TokenKind, script: Script): string {
  return `${model}::${kind}::${script}`;
}

function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function saveStore(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota — ignore */
  }
}

/** In-memory cache to avoid parsing JSON on every estimate call. */
let cache: Store | null = null;
function getStore(): Store {
  if (cache) return cache;
  cache = loadStore();
  return cache;
}

/**
 * Feed a real server-reported (text, tokens) pair back into the model.
 * `text` is the exact string the server counted; when tokens is <= 0 or
 * the text is too short to be meaningful, the sample is ignored.
 */
export function recordUsageSample(input: {
  model?: string;
  text: string;
  kind: TokenKind;
  tokens: number;
}): void {
  const { text, tokens, kind } = input;
  if (!text || tokens <= 0 || text.length < 8) return;
  const cpt = text.length / tokens;
  // Guard against absurd ratios (e.g. empty prompt padded with system tokens).
  if (!isFinite(cpt) || cpt < 0.5 || cpt > 12) return;

  const script = detectScript(text);
  const model = normalizeModel(input.model);
  const key = bucketKey(model, kind, script);
  const store = getStore();
  const prev = store[key];
  const next: Bucket = prev
    ? { cpt: prev.cpt + (cpt - prev.cpt) * EMA_ALPHA, n: prev.n + 1, ts: Date.now() }
    : { cpt: PRIOR[script] + (cpt - PRIOR[script]) * EMA_ALPHA, n: 1, ts: Date.now() };
  store[key] = next;
  cache = store;
  saveStore(store);
}

export type CalibratedEstimate = {
  tokens: number;
  /** chars/token divisor actually used */
  cpt: number;
  /** true when a learned ratio was applied instead of the raw prior */
  calibrated: boolean;
  /** 0..1 — grows with sample count, saturates at CONFIDENCE_SATURATION */
  confidence: number;
  samples: number;
  script: Script;
};

export function estimateTokensCalibrated(
  text: string,
  opts: { model?: string; kind: TokenKind },
): CalibratedEstimate {
  const script = detectScript(text);
  const model = normalizeModel(opts.model);
  const store = getStore();
  const bucket = store[bucketKey(model, opts.kind, script)];
  const cpt = bucket?.cpt ?? PRIOR[script];
  const tokens = text ? Math.max(1, Math.ceil(text.length / cpt)) : 0;
  const samples = bucket?.n ?? 0;
  return {
    tokens,
    cpt,
    calibrated: !!bucket && bucket.n >= 2,
    confidence: Math.min(1, samples / CONFIDENCE_SATURATION),
    samples,
    script,
  };
}

/** Convenience: numeric estimate only (drop-in for estimateTokens). */
export function estimateTokensSmart(text: string, opts: { model?: string; kind: TokenKind }): number {
  return estimateTokensCalibrated(text, opts).tokens;
}

/** True when we have enough calibration to hide the "(est.)" hedge. */
export function isHighConfidence(estimate: CalibratedEstimate, minSamples = 4): boolean {
  return estimate.calibrated && estimate.samples >= minSamples;
}

/** For diagnostics / admin views. */
export function dumpCalibration(): Store {
  return { ...getStore() };
}

/** Testing / manual reset. */
export function resetCalibration(): void {
  cache = {};
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }
}
