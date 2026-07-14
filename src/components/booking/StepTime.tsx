import { useMemo } from "react";
import { Loader2, Sun, CloudSun, Moon, Zap, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepShell } from "./StepShell";
import type { AvailResp } from "./types";

export function StepTime({ lang, value, avail, onPick }: { lang: "ar" | "en"; value: string | null; avail: AvailResp | undefined; onPick: (v: string) => void }) {
  const { t } = useTranslation("booking");
  const times = avail?.times ?? [];
  const booked = new Set(avail?.booked ?? []);
  const groups = useMemo(() => {
    const morning: string[] = [], afternoon: string[] = [], evening: string[] = [];
    for (const time of times) {
      const h = parseInt(time.slice(0, 2), 10);
      if (h < 12) morning.push(time);
      else if (h < 17) afternoon.push(time);
      else evening.push(time);
    }
    return { morning, afternoon, evening };
  }, [times]);

  const earliest = useMemo(() => times.find((tm) => !booked.has(tm)) ?? null, [times, booked]);

  if (!avail) return (
    <StepShell lang={lang} title={t("time.title")}>
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2"/>
        {t("time.loading")}
      </div>
    </StepShell>
  );

  if (times.length === 0 && booked.size === 0) return (
    <StepShell lang={lang} title={t("time.title")}>
      <p className="text-center text-muted-foreground py-10">{t("time.noneDay")}</p>
    </StepShell>
  );

  const renderGroup = (label: string, items: string[], Icon: typeof Sun) => items.length > 0 && (
    <div>
      <h4 className="font-semibold text-sm mb-2 text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-4 w-4"/>
        {label}
      </h4>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {items.map((tm) => {
          const active = value === tm;
          const isBooked = booked.has(tm);
          return (
            <button
              key={tm}
              disabled={isBooked}
              onClick={() => onPick(tm)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? "bg-primary text-primary-foreground shadow"
                : isBooked ? "bg-muted text-muted-foreground line-through cursor-not-allowed"
                : "bg-muted hover:bg-primary/10 hover:text-primary"
              }`}
            >
              {tm}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <StepShell lang={lang} title={t("time.title")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5"/>
          {t("time.riyadhTime")}
        </span>
        {earliest && earliest !== value && (
          <button
            type="button"
            onClick={() => onPick(earliest)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1 font-semibold transition"
          >
            <Zap className="h-3.5 w-3.5"/>
            {t("time.earliestLabel", { time: earliest })}
          </button>
        )}
      </div>
      <div className="space-y-5">
        {renderGroup(t("time.morning"), groups.morning, Sun)}
        {renderGroup(t("time.afternoon"), groups.afternoon, CloudSun)}
        {renderGroup(t("time.evening"), groups.evening, Moon)}
      </div>
    </StepShell>
  );
}
