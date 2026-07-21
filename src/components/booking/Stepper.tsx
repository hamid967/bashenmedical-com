import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Stepper({ steps, current, onJump }: { steps: string[]; current: number; onJump: (i: number) => void }) {
  const { t } = useTranslation("booking");
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-2" aria-label={t("a11y.stepNav", "خطوات الحجز")}>
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        const state = active ? t("a11y.stepCurrent", "الخطوة الحالية")
          : done ? t("a11y.stepDone", "مكتملة")
          : t("a11y.stepUpcoming", "قادمة");
        return (
          <li key={i} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={n >= current}
              aria-current={active ? "step" : undefined}
              aria-label={`${t("a11y.stepN", "الخطوة {{n}}", { n })}: ${label} — ${state}`}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active ? "bg-primary text-primary-foreground shadow"
                : done ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                : "bg-muted text-muted-foreground"
              }`}
            >
              <span aria-hidden="true" className={`h-5 w-5 rounded-full grid place-items-center text-[10px] ${
                active ? "bg-primary-foreground text-primary" : done ? "bg-primary text-primary-foreground" : "bg-background"
              }`}>
                {done ? <Check className="h-3 w-3"/> : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 && <span className="text-muted-foreground/50" aria-hidden="true">·</span>}
          </li>
        );
      })}
    </ol>
  );
}
