/**
 * Shared "cost transparency" footer for AI assistant surfaces
 * (public floating assistant + portal assistant).
 *
 * Mirrors the admin AIAssistantPanel CostMeter but themed with neutral
 * Tailwind tokens so it fits both the public site and the patient portal.
 *
 * States:
 *  - idle   : no input, no active/last stream
 *  - pre    : composer has text — show pre-flight estimate
 *  - live   : streaming — show input + running output estimate
 *  - final  : after completion — show real gateway usage when available
 */
import { Coins } from "lucide-react";
import { estimateCredits, estimateTokens, formatCredits, formatTokens } from "@/lib/ai/pricing";

export type CostMeterUsage = { prompt: number; completion: number; total?: number };

export function AssistantCostMeter({
  streaming,
  hasInput,
  model,
  preEstimate,
  usage,
  streamedText,
  sessionCredits,
  lang = "ar",
  className = "",
}: {
  streaming: boolean;
  hasInput: boolean;
  model?: string;
  preEstimate: { inTok: number; outTok: number; credits: number };
  usage: CostMeterUsage | null;
  streamedText: string;
  sessionCredits: number;
  lang?: "ar" | "en";
  className?: string;
}) {
  const isAr = lang === "ar";
  const liveOutTok = streaming ? estimateTokens(streamedText) : 0;
  const liveCredits = streaming ? estimateCredits(preEstimate.inTok, liveOutTok, model) : 0;

  let state: "idle" | "pre" | "live" | "final" = "idle";
  if (usage) state = "final";
  else if (streaming) state = "live";
  else if (hasInput) state = "pre";

  const label = isAr
    ? {
        idle: "شفافية التكلفة",
        pre: "قبل الإرسال · تقدير",
        live: "أثناء التوليد",
        final: "بعد الاكتمال · فعلي",
      }[state]
    : {
        idle: "Cost transparency",
        pre: "Before send · estimate",
        live: "Streaming",
        final: "Final · actual",
      }[state];

  const L = isAr
    ? {
        in: "مدخلات",
        out: "مخرجات",
        outExpected: "مخرجات متوقعة",
        cost: "التكلفة",
        running: "جارٍ",
        total: "الإجمالي",
        credit: "ائتمان",
      }
    : {
        in: "input",
        out: "output",
        outExpected: "expected output",
        cost: "cost",
        running: "running",
        total: "total",
        credit: "cr",
      };

  return (
    <div
      className={
        "px-3 py-2 border-t text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1 " +
        "border-border/60 bg-muted/40 text-muted-foreground " +
        className
      }
      role="status"
      aria-live="polite"
      data-state={state}
    >
      <div
        className={
          "flex items-center gap-1.5 font-semibold " +
          (state === "final"
            ? "text-emerald-600 dark:text-emerald-400"
            : state === "live"
              ? "text-primary"
              : state === "pre"
                ? "text-foreground/80"
                : "text-muted-foreground")
        }
      >
        <Coins className="h-3.5 w-3.5" aria-hidden />
        <span>{label}</span>
      </div>

      {state === "pre" && (
        <>
          <Metric label={L.in} value={`~${formatTokens(preEstimate.inTok)}`} />
          <Metric label={L.outExpected} value={`~${formatTokens(preEstimate.outTok)}`} />
          <Metric
            label={L.cost}
            value={`~${formatCredits(preEstimate.credits)} ${L.credit}`}
            strong
          />
        </>
      )}

      {state === "live" && (
        <>
          <Metric label={L.in} value={`~${formatTokens(preEstimate.inTok)}`} />
          <Metric label={L.out} value={formatTokens(liveOutTok)} />
          <Metric label={L.running} value={`~${formatCredits(liveCredits)} ${L.credit}`} strong />
        </>
      )}

      {state === "final" && usage && (
        <>
          <Metric label={L.in} value={formatTokens(usage.prompt)} />
          <Metric label={L.out} value={formatTokens(usage.completion)} />
          <Metric
            label={L.cost}
            value={`${formatCredits(estimateCredits(usage.prompt, usage.completion, model))} ${L.credit}`}
            strong
          />
        </>
      )}

      {sessionCredits > 0 && (
        <span className={"opacity-80 " + (isAr ? "me-auto" : "ms-auto")}>
          {L.total}: {formatCredits(sessionCredits)} {L.credit}
        </span>
      )}
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="opacity-70">{label}:</span>
      <span className={strong ? "font-semibold text-foreground" : "font-medium"}>{value}</span>
    </span>
  );
}
