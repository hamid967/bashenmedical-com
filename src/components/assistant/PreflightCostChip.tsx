/**
 * PreflightCostChip
 *
 * Prominent, inline chip shown directly next to the composer's send button
 * so the user sees the expected tokens and credit cost of their next
 * message *before* streaming begins.
 *
 * Complements the footer `AssistantCostMeter` (which switches between
 * idle/pre/live/final states). This chip is dedicated to the pre-flight
 * moment: it only renders when there is composer input and no active
 * stream, giving a clear "you are about to spend ~X credits" cue.
 */
import { Coins, Info } from "lucide-react";
import {
  estimateCredits,
  formatCredits,
  formatTokens,
} from "@/lib/ai/pricing";
import { estimateTokensCalibrated } from "@/lib/ai/token-calibration";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function PreflightCostChip({
  input,
  streaming,
  model,
  historyChars = 0,
  lang = "ar",
  className = "",
}: {
  input: string;
  streaming: boolean;
  model?: string;
  historyChars?: number;
  lang?: "ar" | "en";
  className?: string;
}) {
  const isAr = lang === "ar";
  const trimmed = input.trim();
  if (streaming || trimmed.length === 0) return null;

  const draftEst = estimateTokensCalibrated(input, { model, kind: "input" });
  // Approximate history as the same input-side ratio the calibrator learned.
  const historyTok = historyChars > 0 ? Math.ceil(historyChars / draftEst.cpt) : 0;
  const inTok = draftEst.tokens + historyTok;
  const outTok = Math.max(64, Math.min(512, Math.round(inTok * 0.6)));
  const credits = estimateCredits(inTok, outTok, model);
  const calibrated = draftEst.calibrated;

  const L = isAr
    ? {
        badge: "قبل الإرسال",
        in: "مدخلات",
        out: "مخرجات متوقعة",
        credits: "ائتمان",
        tip: calibrated
          ? "تقدير معاير بناءً على قياسات فعلية سابقة لهذا النموذج ولغة النص. قد يختلف الفعلي بنسبة صغيرة."
          : "تقدير تقريبي بناءً على النص الحالي وسجل الرسائل. تتحسّن الدقة تلقائيًا بعد أول ردود من النموذج.",
      }
    : {
        badge: "Before send",
        in: "input",
        out: "expected output",
        credits: "cr",
        tip: calibrated
          ? "Calibrated estimate using recent real usage from this model and script. Actual cost may differ slightly."
          : "Approximate estimate — accuracy improves automatically after the first few real responses from this model.",
      };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={
              "inline-flex items-center gap-1.5 rounded-full border border-primary/30 " +
              "bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary " +
              "shadow-sm select-none " +
              className
            }
            role="status"
            aria-live="polite"
            data-testid="preflight-cost-chip"
          >
            <Coins className="h-3.5 w-3.5" aria-hidden />
            <span className="whitespace-nowrap">{L.badge}</span>
            <span className="opacity-70">·</span>
            <span className="tabular-nums whitespace-nowrap">
              {calibrated ? "" : "~"}{formatTokens(inTok)} {L.in}
            </span>
            <span className="opacity-40">/</span>
            <span className="tabular-nums whitespace-nowrap">
              ~{formatTokens(outTok)} {L.out}
            </span>
            <span className="opacity-40">·</span>
            <span className="tabular-nums whitespace-nowrap font-semibold">
              ~{formatCredits(credits)} {L.credits}
            </span>
            <Info className="h-3 w-3 opacity-60" aria-hidden />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
          {L.tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
