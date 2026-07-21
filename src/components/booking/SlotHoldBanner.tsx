import { Clock, AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  secondsLeft: number;
  /** Total window (seconds) of the current hold, used as the ring denominator. */
  totalSeconds?: number;
  expired: boolean;
  conflict: boolean;
  onRefresh?: () => void;
  onChangeTime?: () => void;
};

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Small SVG progress ring that visualises the remaining slot-hold time.
 * `progress` is 0..1 (1 = full hold, 0 = expired).
 */
function HoldRing({ progress, label, tone }: { progress: number; label: string; tone: "primary" | "warn" }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const size = 40;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  const strokeColor = tone === "warn" ? "rgb(217 119 6)" : "hsl(var(--primary))";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 1s linear" }}
      />
    </svg>
  );
}

export function SlotHoldBanner({ secondsLeft, totalSeconds, expired, conflict, onRefresh, onChangeTime }: Props) {
  const { t } = useTranslation("booking");

  if (conflict) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        <span className="inline-flex items-center gap-2">
          <AlertCircle className="h-4 w-4" aria-hidden />
          {t("hold.conflict", "هذا الموعد لم يعد متاحًا. يرجى اختيار وقت آخر.")}
        </span>
        {onChangeTime && (
          <button
            type="button"
            onClick={onChangeTime}
            className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
          >
            {t("hold.changeTime", "اختر وقتًا")}
          </button>
        )}
      </div>
    );
  }

  if (expired) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
      >
        <span className="inline-flex items-center gap-2">
          <Clock className="h-4 w-4" aria-hidden />
          {t("hold.expired", "انتهى وقت الحجز المؤقت. اضغط للتجديد أو اختر وقتًا آخر.")}
        </span>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground min-h-11 min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            {t("hold.refresh", "تجديد")}
          </button>
        )}
      </div>
    );
  }

  if (secondsLeft <= 0) return null;

  const low = secondsLeft <= 60;
  const denom = totalSeconds && totalSeconds > 0 ? totalSeconds : Math.max(secondsLeft, 300);
  const progress = Math.max(0, Math.min(1, secondsLeft / denom));
  const timeLabel = t("hold.timeLeft", "الوقت المتبقي: {{time}}", { time: fmt(secondsLeft) });
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
        low
          ? "border-amber-400/50 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
          : "border-primary/30 bg-primary/5 text-primary"
      }`}
    >
      <span className="inline-flex items-center gap-2">
        <HoldRing progress={progress} label={timeLabel} tone={low ? "warn" : "primary"} />
        <span className="inline-flex flex-col leading-tight">
          <span>
            {low
              ? t("hold.endingSoon", "ينتهي حجزك المؤقت قريبًا")
              : t("hold.holding", "هذا الموعد محجوز لك مؤقتًا")}
          </span>
          <span
            className="font-mono font-bold tabular-nums text-base"
            dir="ltr"
            aria-label={timeLabel}
          >
            {fmt(secondsLeft)}
          </span>
        </span>
      </span>
      <div
        className="hidden sm:block h-2 flex-1 max-w-[220px] overflow-hidden rounded-full bg-current/10"
        aria-hidden
      >
        <div
          className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${Math.round(progress * 100)}%`, transition: "width 1s linear" }}
        />
      </div>
    </div>
  );
}
