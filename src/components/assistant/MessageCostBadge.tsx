/**
 * Per-message cost & latency badge shown under assistant bubbles.
 * Displays elapsed time, model, token counts, and estimated credits.
 * Includes an expandable detailed log distinguishing input vs output usage.
 * All values are display-only estimates when server usage is missing.
 */
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Coins,
  Cpu,
  Info,
  ExternalLink,
} from "lucide-react";
import { estimateCredits, formatCredits, formatTokens, getRate } from "@/lib/ai/pricing";
import { estimateTokensCalibrated, isHighConfidence } from "@/lib/ai/token-calibration";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const dir = lang === "ar" ? "rtl" : "ltr";

  const inEst = estimateTokensCalibrated(meta.promptText ?? "", {
    model: meta.model,
    kind: "input",
  });
  const outEst = estimateTokensCalibrated(meta.outputText ?? "", {
    model: meta.model,
    kind: "output",
  });
  const inTok = meta.usage?.prompt ?? inEst.tokens;
  const outTok = meta.usage?.completion ?? outEst.tokens;
  const totalTok = meta.usage?.total ?? inTok + outTok;
  const rate = getRate(meta.model);
  const inCredits = (inTok * rate.inPer1M) / 1_000_000;
  const outCredits = (outTok * rate.outPer1M) / 1_000_000;
  const credits = estimateCredits(inTok, outTok, meta.model);
  const hasServerUsage = !!meta.usage;
  const calibratedEnough =
    (meta.promptText ? isHighConfidence(inEst) : true) &&
    (meta.outputText ? isHighConfidence(outEst) : true);
  const isEst = !hasServerUsage && !calibratedEnough;
  const sourceLabel = hasServerUsage
    ? t("قياس فعلي", "server usage")
    : calibratedEnough
      ? t("تقدير معاير", "calibrated estimate")
      : t("تقدير محلي", "local estimate");

  const modelShort = (meta.model ?? "").split("/").pop() || (lang === "ar" ? "افتراضي" : "default");

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
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={t("تفاصيل التكلفة", "Cost details")}
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          <Info className="h-3 w-3" aria-hidden />
          <span>{t("تفاصيل", "details")}</span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir={dir}
          className="max-w-md text-[12px]"
          aria-describedby="cost-details-desc"
        >
          <DialogHeader>
            <DialogTitle className="text-base">
              {t("تفاصيل استخدام الرسالة", "Message usage details")}
            </DialogTitle>
            <DialogDescription id="cost-details-desc" className="text-xs">
              {t(
                "تفصيل الرموز (Tokens) والائتمانات (Credits) لهذه الرسالة.",
                "Breakdown of tokens and credits for this message.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
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

          <div className="grid grid-cols-3 gap-2 rounded border border-black/10 dark:border-white/10 bg-muted/40 p-2">
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

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] opacity-70">
            <span>
              {t("النموذج", "Model")}: <span className="font-mono">{modelShort}</span>
            </span>
            <span>
              {t("المصدر", "Source")}: {sourceLabel}
            </span>
            {live ? (
              <span className="text-amber-600">{t("قيد التوليد…", "generating…")}</span>
            ) : null}
          </div>

          <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-[11px] leading-relaxed">
            <div className="font-medium">{t("طريقة الحساب", "How it's calculated")}</div>
            <pre
              className="rounded bg-background/60 p-2 font-mono text-[10.5px] overflow-x-auto text-left"
              dir="ltr"
            >
              {`credits =
  (input_tokens  × ${rate.inPer1M}  / 1,000,000)
+ (output_tokens × ${rate.outPer1M} / 1,000,000)`}
            </pre>
            <p className="opacity-80">
              {t(
                "الرمز (Token) قطعة من النص يفهمها النموذج. لكل نموذج سعر مختلف للمدخلات والمخرجات لكل مليون رمز. أثناء التوليد نعرض تقديرًا محليًا، ثم نستبدله بالقياس الفعلي عند وصوله.",
                "A token is a small piece of text the model reads. Each model has separate input/output prices per 1M tokens. During streaming we show a local estimate, then replace it with the real server usage when it arrives.",
              )}
            </p>
            <a
              href="/docs/ai-cost"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {t("شرح مختصر", "Read the short guide")}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
