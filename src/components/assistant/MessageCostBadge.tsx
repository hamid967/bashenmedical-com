/**
 * Per-message cost & latency badge shown under assistant bubbles.
 * Displays elapsed time, model, token counts, and estimated credits.
 * All values are display-only estimates when server usage is missing.
 */
import { Clock, Coins, Cpu } from "lucide-react";
import {
  estimateCredits,
  estimateTokens,
  formatCredits,
  formatTokens,
} from "@/lib/ai/pricing";

export type MessageCostMeta = {
  /** performance.now() at request start */
  startedAt: number;
  /** performance.now() at finalize; undefined while streaming */
  endedAt?: number;
  /** Model id from X-Model header (falls back to default). */
  model?: string;
  /** Server-reported usage (preferred over estimation). */
  usage?: { prompt: number; completion: number; total: number };
  /** Prompt text sent (used to estimate input tokens if usage missing). */
  promptText?: string;
  /** Current streamed output text (used to estimate output tokens). */
  outputText?: string;
};

export type FinalizedCostMeta = Omit<MessageCostMeta, "startedAt" | "endedAt"> & {
  elapsedMs: number;
};

export function finalizeCostMeta(meta: MessageCostMeta): FinalizedCostMeta {
  const end = meta.endedAt ?? performance.now();
  return {
    elapsedMs: Math.max(0, end - meta.startedAt),
    model: meta.model,
    usage: meta.usage,
    promptText: meta.promptText,
    outputText: meta.outputText,
  };
}

function fmtElapsed(ms: number, lang: "ar" | "en"): string {
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}${lang === "ar" ? "ث" : "s"}`;
  if (s < 60) return `${Math.round(s)}${lang === "ar" ? "ث" : "s"}`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return lang === "ar" ? `${m}د ${r}ث` : `${m}m ${r}s`;
}

export function MessageCostBadge({
  meta,
  live,
  now,
  lang = "ar",
}: {
  meta: MessageCostMeta | FinalizedCostMeta;
  /** true = streaming (use `now` for elapsed); false = finalized. */
  live?: boolean;
  /** current performance.now() while live — parent ticks for smooth updates. */
  now?: number;
  lang?: "ar" | "en";
}) {
  const isFinal = "elapsedMs" in meta;
  const elapsedMs = isFinal
    ? meta.elapsedMs
    : Math.max(0, (now ?? performance.now()) - meta.startedAt);

  const inTok = meta.usage?.prompt ?? estimateTokens(meta.promptText ?? "");
  const outTok = meta.usage?.completion ?? estimateTokens(meta.outputText ?? "");
  const credits = estimateCredits(inTok, outTok, meta.model);

  const modelShort = (meta.model ?? "").split("/").pop() || (lang === "ar" ? "افتراضي" : "default");

  return (
    <div
      className="mt-1.5 inline-flex flex-wrap items-center gap-2 text-[10.5px] leading-none opacity-70"
      dir={lang === "ar" ? "rtl" : "ltr"}
      aria-live={live ? "polite" : undefined}
      title={
        lang === "ar"
          ? `${live ? "قيد التوليد" : "اكتمل"} • ${modelShort} • دخل ${inTok} خرج ${outTok}`
          : `${live ? "generating" : "complete"} • ${modelShort} • in ${inTok} out ${outTok}`
      }
    >
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3 w-3" aria-hidden />
        {fmtElapsed(elapsedMs, lang)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Cpu className="h-3 w-3" aria-hidden />
        {formatTokens(inTok)}
        <span aria-hidden>→</span>
        {formatTokens(outTok)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Coins className="h-3 w-3" aria-hidden />
        {formatCredits(credits)}
        <span className="opacity-70">{lang === "ar" ? "رصيد" : "cr"}</span>
      </span>
      {meta.usage ? null : (
        <span className="opacity-60">{lang === "ar" ? "(تقدير)" : "(est.)"}</span>
      )}
    </div>
  );
}
