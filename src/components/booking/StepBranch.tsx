import { Building2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepShell } from "./StepShell";

export function StepBranch({
  lang,
  branches,
  value,
  onPick,
}: {
  lang: "ar" | "en";
  branches: any[];
  value: string | null;
  onPick: (v: string) => void;
}) {
  const { t } = useTranslation("booking");
  return (
    <StepShell lang={lang} title={t("branch.title")}>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("branch.title")}>
        {branches.map((b) => {
          const active = value === b.id;
          const name = lang === "ar" ? b.name_ar : b.name_en;
          const city = lang === "ar" ? b.city_ar : b.city_en;
          return (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${name} — ${city}`}
              onClick={() => onPick(b.id)}
              className={`text-start rounded-xl border-2 p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className={`h-11 w-11 rounded-lg grid place-items-center ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
                >
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {city}
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
