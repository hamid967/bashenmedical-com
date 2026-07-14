import { Stethoscope } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepShell } from "./StepShell";

export function StepSpecialty({ lang, specialties, value, onPick }: { lang: "ar" | "en"; specialties: any[]; value: string | null; onPick: (v: string) => void }) {
  const { t } = useTranslation("booking");
  return (
    <StepShell lang={lang} title={t("specialty.title")}>
      <div className="grid gap-3 sm:grid-cols-3">
        {specialties.map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className={`rounded-xl border-2 p-4 text-center transition ${
                active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
              }`}
            >
              <div className={`h-12 w-12 mx-auto rounded-full grid place-items-center mb-2 ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                <Stethoscope className="h-5 w-5"/>
              </div>
              <div className="text-sm font-semibold">{lang === "ar" ? s.name_ar : s.name_en}</div>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}
