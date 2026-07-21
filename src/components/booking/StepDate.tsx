import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Building2, Calendar as CalIcon, ChevronLeft, ChevronRight, Phone, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { StepShell } from "./StepShell";

export function StepDate({
  lang, value, onPick, doctorId, specialtyId, branchId, onChangeDoctor, onChangeBranch,
}: {
  lang: "ar" | "en"; value: string | null; onPick: (v: string) => void;
  doctorId: string | null; specialtyId: string | null; branchId: string | null;
  onChangeDoctor?: () => void;
  onChangeBranch?: () => void;
}) {
  const { t } = useTranslation("booking");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [monthStart, setMonthStart] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const firstWeekday = monthStart.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), d));

  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
  const monthLabel = monthStart.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const fullDate = (d: Date) => d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const weekdayNames = t("date.weekdays", { returnObjects: true }) as string[];

  const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 60);
  const horizonEnd = new Date(); horizonEnd.setDate(horizonEnd.getDate() + 30);
  const horizonEndIso = iso(horizonEnd);
  const todayIso = iso(today);

  const enabled = !!(doctorId || specialtyId);

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth() + 1;
  const { data: monthAvail, isLoading: loadingMonth } = useQuery({
    queryKey: ["month-avail", year, month, doctorId, specialtyId, branchId],
    queryFn: async () => {
      const p = new URLSearchParams({ year: String(year), month: String(month) });
      if (doctorId) p.set("doctor_id", doctorId);
      else if (specialtyId) p.set("specialty_id", specialtyId);
      if (branchId) p.set("branch_id", branchId);
      const res = await fetch(`/api/public/book/month-availability?${p.toString()}`);
      if (!res.ok) return { ok: false, dates: [] as string[] };
      return (await res.json()) as { ok: boolean; dates: string[] };
    },
    enabled,
    staleTime: 60_000,
  });

  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;
  const { data: nextMonthAvail, isLoading: loadingNextMonth } = useQuery({
    queryKey: ["month-avail", nextYear, nextMonth, doctorId, specialtyId, branchId],
    queryFn: async () => {
      const p = new URLSearchParams({ year: String(nextYear), month: String(nextMonth) });
      if (doctorId) p.set("doctor_id", doctorId);
      else if (specialtyId) p.set("specialty_id", specialtyId);
      if (branchId) p.set("branch_id", branchId);
      const res = await fetch(`/api/public/book/month-availability?${p.toString()}`);
      if (!res.ok) return { ok: false, dates: [] as string[] };
      return (await res.json()) as { ok: boolean; dates: string[] };
    },
    enabled,
    staleTime: 60_000,
  });

  const availableDates = useMemo(
    () => new Set(monthAvail?.dates ?? []),
    [monthAvail],
  );
  const hasAvailData = (monthAvail?.dates?.length ?? 0) > 0 || monthAvail?.ok === true;

  const bothLoaded = !loadingMonth && !loadingNextMonth && enabled;
  const datesInHorizon = useMemo(() => {
    const all = [...(monthAvail?.dates ?? []), ...(nextMonthAvail?.dates ?? [])];
    return all.filter((d) => d >= todayIso && d <= horizonEndIso);
  }, [monthAvail, nextMonthAvail, todayIso, horizonEndIso]);
  const noSlotsIn30Days = bothLoaded && datesInHorizon.length === 0
    && monthAvail?.ok !== false && nextMonthAvail?.ok !== false;

  const waHref = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(t("date.waMessage"))}`;
  const telHref = `tel:${SITE.phone}`;

  if (noSlotsIn30Days) {
    return (
      <StepShell lang={lang} title={t("date.title")}>
        <div className="max-w-lg mx-auto text-center">
          <div aria-hidden="true" className="mx-auto mb-4 h-14 w-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <CalIcon className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t("date.noneIn30")}</h3>
          <p className="text-sm text-muted-foreground mb-6">{t("date.fullyBooked")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {onChangeDoctor && (
              <Button variant="outline" onClick={onChangeDoctor} className="justify-start">
                <User className="h-4 w-4 me-2" aria-hidden="true" />
                {t("date.pickOther")}
              </Button>
            )}
            {onChangeBranch && (
              <Button variant="outline" onClick={onChangeBranch} className="justify-start">
                <Building2 className="h-4 w-4 me-2" aria-hidden="true" />
                {t("date.changeBranch")}
              </Button>
            )}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-start rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 transition"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 me-2" fill="currentColor" aria-hidden="true">
                <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.12.55 4.12 1.6 5.92L0 24l6.24-1.63A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.2-3.48-8.52ZM12 22a9.94 9.94 0 0 1-5.06-1.38l-.36-.21-3.7.97.99-3.61-.24-.37A9.94 9.94 0 1 1 22 12c0 5.52-4.48 10-10 10Zm5.47-7.38c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.66.15s-.76.97-.93 1.17c-.17.2-.34.22-.63.07-.3-.15-1.26-.46-2.4-1.47-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.6.13-.13.3-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.52-.07-.15-.66-1.6-.9-2.19-.24-.58-.48-.5-.66-.51h-.56c-.19 0-.5.07-.76.37-.26.3-1 1-1 2.42s1.02 2.81 1.17 3.01c.15.2 2.02 3.08 4.9 4.32.69.3 1.22.48 1.64.61.69.22 1.31.19 1.8.12.55-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.19-.56-.34Z"/>
              </svg>
              {t("date.contactWhatsApp")}
            </a>
            <a
              href={telHref}
              className="inline-flex items-center justify-start rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition"
            >
              <Phone className="h-4 w-4 me-2" aria-hidden="true" />
              {t("date.callUs", { phone: SITE.phoneDisplay })}
            </a>
          </div>
        </div>
      </StepShell>
    );
  }

  const atFirstMonth = monthStart <= new Date(today.getFullYear(), today.getMonth(), 1);

  return (
    <StepShell lang={lang} title={t("date.title")}>
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm"
            onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
            disabled={atFirstMonth}
            aria-label={t("a11y.prevMonth", "الشهر السابق")}
          ><ChevronRight className="h-4 w-4" aria-hidden="true"/></Button>
          <div className="font-semibold" aria-live="polite">{monthLabel}</div>
          <Button variant="outline" size="sm"
            onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
            aria-label={t("a11y.nextMonth", "الشهر التالي")}
          ><ChevronLeft className="h-4 w-4" aria-hidden="true"/></Button>
        </div>
        <div role="grid" aria-label={`${t("date.title")} — ${monthLabel}`}>
          <div role="row" className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
            {weekdayNames.map((w) => <div role="columnheader" key={w}>{w}</div>)}
          </div>
          <div role="row" className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div role="gridcell" key={i} aria-hidden="true"/>;
              const isPast = d < today;
              const isTooFar = d > maxDate;
              const s = iso(d);
              const noAvail = hasAvailData && !availableDates.has(s);
              const disabled = isPast || isTooFar || noAvail;
              const active = value === s;
              const status = disabled
                ? (isPast ? t("a11y.datePast", "تاريخ سابق")
                  : isTooFar ? t("a11y.dateTooFar", "خارج نطاق الحجز")
                  : t("a11y.dateUnavailable", "غير متاح"))
                : t("a11y.dateAvailable", "متاح");
              return (
                <div role="gridcell" key={i} aria-selected={active} className="contents">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(s)}
                    aria-label={`${fullDate(d)} — ${status}`}
                    aria-pressed={active}
                    className={`aspect-square rounded-lg text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      active ? "bg-primary text-primary-foreground shadow"
                      : disabled ? "text-muted-foreground/40 cursor-not-allowed line-through decoration-1"
                      : "bg-muted hover:bg-primary/10 hover:text-primary"
                    }`}
                  >
                    {d.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground" aria-live="polite">
          {loadingMonth
            ? t("date.loading")
            : hasAvailData && availableDates.size === 0
              ? t("date.noneThisMonth")
              : t("date.unavailableAuto")}
        </p>
      </div>
    </StepShell>
  );
}
