import { Building2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepShell } from "./StepShell";

export function StepBranch({ lang, branches, value, onPick }: { lang: "ar" | "en"; branches: any[]; value: string | null; onPick: (v: string) => void }) {
  const { t } = useTranslation("booking");
  return (
    <StepShell lang={lang} title={t("branch.title")}>
      <div className="grid gap-3 sm:grid-cols-2">
        {branches.map((b) => {
          const active = value === b.id;
          return (
            <button
              key={b.id}
              onClick={() => onPick(b.id)}
              className={`text-start rounded-xl border-2 p-4 transition ${
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-lg grid place-items-center ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                  <Building2 className="h-5 w-5"/>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{lang === "ar" ? b.name_ar : b.name_en}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3"/>
                    {lang === "ar" ? b.city_ar : b.city_en}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}
