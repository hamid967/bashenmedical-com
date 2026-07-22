import { Check, X } from "lucide-react";
import {
  getProgressSteps,
  getCurrentStepIndex,
  toUnifiedStatus,
  type OrderTableKind,
  type UnifiedStatus,
} from "@/lib/unified-status";

type Props = {
  kind: OrderTableKind;
  status: string | null | undefined | UnifiedStatus;
  raw?: boolean;
  className?: string;
};

/**
 * خط تقدّم أفقي لخطوات الطلب — يُظهر للمريض أين وصل بلاغه/موعده/طلبه.
 * مسار مقطوع (rejected/cancelled) يُظهر تنبيهاً أحمر بدلاً من الخط.
 */
export function OrderProgressSteps({ kind, status, raw = true, className = "" }: Props) {
  const unified: UnifiedStatus = raw
    ? toUnifiedStatus(kind, typeof status === "string" ? status : null)
    : (status as UnifiedStatus);
  const steps = getProgressSteps(kind);
  const currentIdx = getCurrentStepIndex(kind, unified);

  if (currentIdx === -1) {
    const label = unified === "rejected" ? "تم رفض الطلب" : "تم إلغاء الطلب";
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}
      >
        <X className="h-4 w-4" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <ol className={`flex items-center gap-1 w-full ${className}`} aria-label="خطوات تقدّم الطلب">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const dotClass = done
          ? "bg-emerald-500 text-white border-emerald-500"
          : active
            ? "bg-teal-600 text-white border-teal-600 ring-4 ring-teal-100"
            : "bg-white text-slate-400 border-slate-300";
        const lineClass = i < currentIdx ? "bg-emerald-400" : "bg-slate-200";
        return (
          <li key={step.key + i} className="flex-1 flex items-center gap-1 min-w-0">
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div
                className={`h-7 w-7 rounded-full border-2 grid place-items-center text-xs font-bold transition-colors ${dotClass}`}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-[11px] text-center leading-tight truncate max-w-[80px] ${
                  active
                    ? "text-teal-700 font-semibold"
                    : done
                      ? "text-emerald-700"
                      : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mb-5 ${lineClass}`} aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
