import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Award, Calendar, Languages, MapPin, Star, Stethoscope,
} from "lucide-react";
import { LANG_LABELS, type DoctorRow } from "./types";
import { DemoBadge } from "@/components/DemoBadge";

export function DoctorCard({ d, lang, nextSlotIso }: { d: DoctorRow; lang: "ar" | "en"; nextSlotIso?: string }) {
  const name = lang === "ar" ? d.name_ar : d.name_en;
  const title = lang === "ar" ? d.title_ar : d.title_en;
  const specName = lang === "ar" ? d.specialty_name_ar : d.specialty_name_en;
  const branchNames = (d.branch_names_ar ?? []).filter(Boolean);
  const branchLabel = branchNames.length
    ? branchNames.length === 1
      ? branchNames[0]
      : `${branchNames[0]} +${branchNames.length - 1}`
    : null;

  const nextSlotLabel = useMemo(() => {
    if (!nextSlotIso) return null;
    const dt = new Date(nextSlotIso);
    if (isNaN(dt.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isToday = dt >= today && dt < tomorrow;
    const isTomorrow = dt >= tomorrow && dt < new Date(tomorrow.getTime() + 86400000);
    const timeStr = dt.toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-US", {
      hour: "2-digit", minute: "2-digit",
    });
    if (isToday) return lang === "ar" ? `اليوم ${timeStr}` : `Today ${timeStr}`;
    if (isTomorrow) return lang === "ar" ? `غدًا ${timeStr}` : `Tomorrow ${timeStr}`;
    const dateStr = dt.toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US", {
      weekday: "short", day: "numeric", month: "short",
    });
    return `${dateStr} · ${timeStr}`;
  }, [nextSlotIso, lang]);

  return (
    <article className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-xl hover:border-primary/30 transition-all flex flex-col">
      <div className="p-5 flex gap-4">
        <div className="h-24 w-24 shrink-0 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary grid place-items-center text-2xl font-bold overflow-hidden ring-1 ring-primary/10">
          {d.photo_url ? (
            <img
              src={d.photo_url}
              alt={name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span aria-hidden>{name.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-lg leading-tight truncate">
            {d.slug ? (
              <Link
                to="/doctors/$slug"
                params={{ slug: d.slug }}
                className="hover:text-primary transition-colors"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </h3>
          {title && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{title}</div>
          )}
          {specName && (
            <div className="text-sm text-primary mt-1 flex items-center gap-1 truncate">
              <Stethoscope className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{specName}</span>
            </div>
          )}
          {d.ratings_count > 0 && (
            <div className="flex items-center gap-1 mt-2 text-sm">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{Number(d.avg_rating).toFixed(1)}</span>
              <span className="text-muted-foreground text-xs">({d.ratings_count})</span>
            </div>
          )}
        </div>
      </div>

      {nextSlotLabel && d.booking_enabled && (
        <div className="mx-5 mb-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 flex items-center gap-2 text-xs">
          <Calendar className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span className="text-emerald-800 dark:text-emerald-300">
            {lang === "ar" ? "أقرب موعد: " : "Next slot: "}
            <span className="font-semibold">{nextSlotLabel}</span>
          </span>
        </div>
      )}

      <div className="px-5 pb-4 space-y-1.5 text-xs text-muted-foreground">
        {branchLabel && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={branchNames.join(" • ")}>
              {branchLabel}
            </span>
          </div>
        )}
        {d.years_experience != null && (
          <div className="flex items-center gap-2">
            <Award className="h-3.5 w-3.5 shrink-0" />
            {lang === "ar"
              ? `خبرة ${d.years_experience}+ سنة`
              : `${d.years_experience}+ years experience`}
          </div>
        )}
        {d.languages && d.languages.length > 0 && (
          <div className="flex items-center gap-2">
            <Languages className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {d.languages.map((l) => LANG_LABELS[l]?.[lang] ?? l).join(" · ")}
            </span>
          </div>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2 p-4 pt-3 border-t border-border">
        {d.slug ? (
          <Link
            to="/doctors/$slug"
            params={{ slug: d.slug }}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-center hover:bg-muted transition-colors"
          >
            {lang === "ar" ? "الملف الشخصي" : "View profile"}
          </Link>
        ) : (
          <div />
        )}
        {d.booking_enabled ? (
          d.slug ? (
            <Link
              to="/doctors/$slug"
              params={{ slug: d.slug }}
              hash="book"
              className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold text-center hover:bg-primary/90 flex items-center justify-center gap-1 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" />
              {lang === "ar" ? "احجز موعد" : "Book"}
            </Link>
          ) : (
            <Link
              to="/book"
              search={{
                doctor: d.id,
                ...(d.specialty_id ? { specialty: d.specialty_id } : {}),
                ...(d.branch_ids && d.branch_ids.length === 1 ? { branch: d.branch_ids[0] } : {}),
              }}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold text-center hover:bg-primary/90 flex items-center justify-center gap-1 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" />
              {lang === "ar" ? "احجز موعد" : "Book"}
            </Link>
          )
        ) : (
          <span className="rounded-lg bg-muted text-muted-foreground px-3 py-2 text-xs text-center">
            {lang === "ar" ? "الحجز غير متاح" : "Booking closed"}
          </span>
        )}
      </div>
    </article>
  );
}
