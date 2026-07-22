import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepShell } from "./StepShell";

export function StepDoctor({
  lang,
  doctors,
  value,
  onPick,
}: {
  lang: "ar" | "en";
  doctors: any[];
  value: string | null;
  onPick: (v: string) => void;
}) {
  const { t } = useTranslation("booking");
  return (
    <StepShell lang={lang} title={t("doctor.title")}>
      {doctors.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("doctor.empty")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("doctor.title")}>
          {doctors.map((d) => {
            const active = value === d.id;
            const name = lang === "ar" ? d.name_ar : d.name_en;
            const specialty = lang === "ar" ? d.specialty_name_ar : d.specialty_name_en;
            const ratingLabel =
              d.ratings_count > 0
                ? t("a11y.ratingLabel", "التقييم {{rating}} من 5 من {{count}} مراجعة", {
                    rating: Number(d.avg_rating).toFixed(1),
                    count: d.ratings_count,
                  })
                : "";
            const disabledLabel = !d.booking_enabled
              ? ` — ${t("a11y.bookingDisabled", "الحجز غير متاح")}`
              : "";
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={!d.booking_enabled || undefined}
                aria-label={`${name}, ${specialty}${ratingLabel ? `, ${ratingLabel}` : ""}${disabledLabel}`}
                onClick={() => onPick(d.id)}
                disabled={!d.booking_enabled}
                className={`text-start rounded-xl border-2 p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active
                    ? "border-primary bg-primary/5"
                    : !d.booking_enabled
                      ? "border-border bg-muted/50 opacity-60 cursor-not-allowed"
                      : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="h-14 w-14 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center font-bold overflow-hidden"
                  >
                    {d.photo_url ? (
                      <img src={d.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      name.charAt(0)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">{specialty}</div>
                    {d.ratings_count > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs" aria-hidden="true">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <span>{Number(d.avg_rating).toFixed(1)}</span>
                        <span className="text-muted-foreground">({d.ratings_count})</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </StepShell>
  );
}
