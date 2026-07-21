/**
 * Per-message cost & latency badge shown under assistant bubbles.
 * Displays elapsed time, model, token counts, and estimated credits.
 * Includes an expandable detailed log distinguishing input vs output usage.
 * All values are display-only estimates when server usage is missing.
 */
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, Clock, Coins, Cpu } from "lucide-react";
import {
  estimateCredits,
  estimateTokens,
  formatCredits,
  formatTokens,
  getRate,
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
  const [open, setOpen] = useState(false);
  const isFinal = "elapsedMs" in meta;
  const elapsedMs = isFinal
    ? meta.elapsedMs
    : Math.max(0, (now ?? performance.now()) - meta.startedAt);

  const inTok = meta.usage?.prompt ?? estimateTokens(meta.promptText ?? "");
  const outTok = meta.usage?.completion ?? estimateTokens(meta.outputText ?? "");
  const totalTok = meta.usage?.total ?? inTok + outTok;
  const rate = getRate(meta.model);
  const inCredits = (inTok * rate.inPer1M) / 1_000_000;
  const outCredits = (outTok * rate.outPer1M) / 1_000_000;
  const credits = estimateCredits(inTok, outTok, meta.model);
  const isEst = !meta.usage;

  const modelShort =
    (meta.model ?? "").split("/").pop() || (lang === "ar" ? "افتراضي" : "default");

  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div className="mt-1.5" dir={dir}>
      <div
        className="inline-flex flex-wrap items-center gap-2 text-[10.5px] leading-none opacity-70"
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
          <span className="opacity-70">{t("رصيد", "cr")}</span>
        </span>
        {isEst ? <span className="opacity-60">{t("(تقدير)", "(est.)")}</span> : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t("تفاصيل التكلفة", "Cost details")}
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
          <span>{open ? t("إخفاء", "hide") : t("تفاصيل", "details")}</span>
        </button>
      </div>

      {open ? (
        <div
          className="mt-2 max-w-md rounded-md border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-2.5 text-[11px] leading-tight"
          role="region"
          aria-label={t("سجل استخدام الرسالة", "Message usage log")}
        >
          <div className="grid grid-cols-2 gap-2">
            {/* Input column */}
            <div className="rounded border border-sky-500/20 bg-sky-500/[0.06] p-2">
              <div className="mb-1 flex items-center gap-1 font-medium text-sky-700 dark:text-sky-300">
                <ArrowUpFromLine className="h-3 w-3" aria-hidden />
                {t("المدخلات", "Input")}
              </div>
              <dl className="space-y-0.5 opacity-90">
                <div className="flex justify-between gap-2">
                  <dt className="opacity-70">{t("الرموز", "Tokens")}</dt>
                  <dd className="font-mono">{inTok.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="opacity-70">{t("السعر/م", "Per 1M")}</dt>
                  <dd className="font-mono">{rate.inPer1M}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="opacity-70">{t("التكلفة", "Cost")}</dt>
                  <dd className="font-mono">{formatCredits(inCredits)}</dd>
                </div>
              </dl>
            </div>

            {/* Output column */}
            <div className="rounded border border-emerald-500/20 bg-emerald-500/[0.06] p-2">
              <div className="mb-1 flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
                <ArrowDownToLine className="h-3 w-3" aria-hidden />
                {t("المخرجات", "Output")}
              </div>
              <dl className="space-y-0.5 opacity-90">
                <div className="flex justify-between gap-2">
                  <dt className="opacity-70">{t("الرموز", "Tokens")}</dt>
                  <dd className="font-mono">{outTok.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="opacity-70">{t("السعر/م", "Per 1M")}</dt>
                  <dd className="font-mono">{rate.outPer1M}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="opacity-70">{t("التكلفة", "Cost")}</dt>
                  <dd className="font-mono">{formatCredits(outCredits)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Totals row */}
          <div className="mt-2 grid grid-cols-3 gap-2 rounded border border-black/10 dark:border-white/10 bg-white/60 dark:bg-black/20 p-2">
            <div>
              <div className="opacity-60">{t("الإجمالي", "Total tokens")}</div>
              <div className="font-mono">{totalTok.toLocaleString()}</div>
            </div>
            <div>
              <div className="opacity-60">{t("الرصيد", "Credits")}</div>
              <div className="font-mono">{formatCredits(credits)}</div>
            </div>
            <div>
              <div className="opacity-60">{t("الزمن", "Latency")}</div>
              <div className="font-mono">{fmtElapsed(elapsedMs, lang)}</div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 opacity-70">
            <span>
              {t("النموذج", "Model")}: <span className="font-mono">{modelShort}</span>
            </span>
            <span>
              {t("المصدر", "Source")}:{" "}
              {isEst ? t("تقدير محلي", "local estimate") : t("قياس فعلي", "server usage")}
            </span>
            {live ? <span className="text-amber-600">{t("قيد التوليد…", "generating…")}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
