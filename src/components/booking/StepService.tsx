import { Stethoscope, Activity, Scan, TestTube } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepShell } from "./StepShell";
import type { ServiceType } from "./types";

export function StepService({ lang, value, onPick }: { lang: "ar" | "en"; value: ServiceType | null; onPick: (v: ServiceType) => void }) {
  const { t } = useTranslation("booking");
  const items: { id: ServiceType; icon: any; disabled?: boolean }[] = [
    { id: "clinic",    icon: Stethoscope },
    { id: "followup",  icon: Activity },
    { id: "radiology", icon: Scan,     disabled: true },
    { id: "lab",       icon: TestTube, disabled: true },
  ];
  return (
    <StepShell lang={lang} title={t("service.title")}>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((it) => {
          const active = value === it.id;
          const label = t(`service.${it.id}`);
          const desc = it.disabled ? t("service.comingSoon") : t(`service.${it.id}_desc`);
          return (
            <button
              key={it.id}
              onClick={() => !it.disabled && onPick(it.id)}
              disabled={it.disabled}
              className={`text-start rounded-xl border-2 p-4 transition ${
                active ? "border-primary bg-primary/5"
                : it.disabled ? "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-lg grid place-items-center ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                  <it.icon className="h-5 w-5"/>
                </div>
                <div>
                  <div className="font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}
