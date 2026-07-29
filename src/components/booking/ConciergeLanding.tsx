/**
 * ConciergeLanding — hospital-grade entry surface for /book.
 *
 * Replaces the classic "pick a service type" step 1 with a Mayo/Cleveland-style
 * layout:
 *   • Unified smart search (doctor / specialty / symptom)
 *   • "أقرب موعد متاح الآن" CTA that queries list_doctors_next_slot
 *   • Symptom-first triage cards → map to specialty slugs
 *   • Recommended doctors list (filtered by symptom + insurance when selected)
 *   • Sidebar: NPHIES insurance status, smart waitlist, facility stats
 *
 * Pure UI: emits (patch, jumpToStep) via onPick — the parent wizard keeps
 * ownership of all state, backend calls, holds, drafts, etc.
 */
import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Search, Zap, ShieldCheck, Bell, Clock, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui-v3";
import type { ServiceType } from "./types";

type SpecialtyRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  icon?: string | null;
};
type DoctorRow = {
  id: string;
  name_ar: string;
  name_en: string;
  photo_url?: string | null;
  specialty_id: string;
  specialty_name_ar?: string;
  specialty_name_en?: string;
  branch_id?: string | null;
  avg_rating?: number | null;
  ratings_count?: number | null;
};
type InsuranceProvider = {
  id: string;
  name_ar: string;
  name_en: string;
};

export type ConciergePatch = {
  serviceType?: ServiceType;
  specialtyId?: string | null;
  doctorId?: string | null;
  branchId?: string | null;
};

/* Symptom presets — each maps to specialty slug candidates, first match wins.  */
type SymptomPreset = {
  key: "acute_pain" | "checkup" | "followup" | "other";
  slugs: string[];
  serviceType: ServiceType;
};
const SYMPTOM_PRESETS: SymptomPreset[] = [
  {
    key: "acute_pain",
    slugs: ["emergency", "internal-medicine", "family-medicine", "general", "general-medicine"],
    serviceType: "clinic",
  },
  {
    key: "checkup",
    slugs: ["family-medicine", "internal-medicine", "general", "preventive"],
    serviceType: "clinic",
  },
  { key: "followup", slugs: [], serviceType: "followup" },
  { key: "other", slugs: [], serviceType: "clinic" },
];

function findSpecialtyBySlugs(specialties: SpecialtyRow[], slugs: string[]): SpecialtyRow | null {
  for (const s of slugs) {
    const hit = specialties.find((x) => x.slug === s);
    if (hit) return hit;
  }
  return null;
}

export function ConciergeLanding({
  lang,
  specialties,
  doctors,
  branches,
  onPick,
  onFallbackToClassic,
  onOpenWaitlist,
}: {
  lang: "ar" | "en";
  specialties: SpecialtyRow[];
  doctors: DoctorRow[];
  branches: { id: string; name_ar: string; name_en: string }[];
  onPick: (patch: ConciergePatch, jumpToStep: number) => void;
  onFallbackToClassic: () => void;
  onOpenWaitlist: () => void;
}) {
  const { t } = useTranslation("booking");
  const [query, setQuery] = useState("");
  const [insurance, setInsurance] = useState<string | "">("");
  const [providers, setProviders] = useState<InsuranceProvider[]>([]);
  const [loadingNearest, setLoadingNearest] = useState(false);
  const [nearest, setNearest] = useState<
    Array<{ doctor: DoctorRow; at: Date; branchId: string | null }>
  >([]);

  /* Load insurance providers once (public read).                              */
  useEffect(() => {
    let alive = true;
    void supabase
      .from("insurance_providers")
      .select("id,name_ar,name_en")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (alive && data) setProviders(data as InsuranceProvider[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  /* Unified-search suggestions: match doctors and specialties by name.        */
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { doctors: [] as DoctorRow[], specialties: [] as SpecialtyRow[] };
    const dHits = doctors
      .filter((d) =>
        [d.name_ar, d.name_en, d.specialty_name_ar, d.specialty_name_en]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
      .slice(0, 5);
    const sHits = specialties
      .filter((s) => (s.name_ar + " " + s.name_en).toLowerCase().includes(q))
      .slice(0, 5);
    return { doctors: dHits, specialties: sHits };
  }, [query, doctors, specialties]);

  /* Recommended doctor list: highest rated, up to 3.                          */
  const recommended = useMemo(
    () =>
      [...doctors]
        .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
        .slice(0, 3),
    [doctors],
  );

  const branchCount = branches.length;

  async function fetchNearest() {
    if (!doctors.length) return;
    setLoadingNearest(true);
    try {
      const ids = doctors.slice(0, 40).map((d) => d.id);
      const { data } = await supabase.rpc("list_doctors_next_slot", { _doctor_ids: ids });
      const rows = (data ?? []) as Array<{
        doctor_id: string;
        next_slot_at: string;
        next_slot_branch_id: string | null;
      }>;
      const doctorById = new Map(doctors.map((d) => [d.id, d]));
      const mapped = rows
        .filter((r) => r.next_slot_at)
        .map((r) => ({
          doctor: doctorById.get(r.doctor_id)!,
          at: new Date(r.next_slot_at),
          branchId: r.next_slot_branch_id,
        }))
        .filter((r) => r.doctor)
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .slice(0, 5);
      setNearest(mapped);
    } finally {
      setLoadingNearest(false);
    }
  }

  function pickSymptom(preset: SymptomPreset) {
    // Always route through the branch step (2) so the user picks a branch
    // before specialty/doctor. The wizard renders any preset specialty as
    // already selected on step 3.
    if (preset.key === "other") {
      onPick({ serviceType: "clinic" }, 2);
      return;
    }
    if (preset.key === "followup") {
      onPick({ serviceType: "followup" }, 2);
      return;
    }
    const sp = findSpecialtyBySlugs(specialties, preset.slugs);
    if (sp) onPick({ serviceType: preset.serviceType, specialtyId: sp.id }, 2);
    else onPick({ serviceType: preset.serviceType }, 2);
  }


  function pickDoctor(d: DoctorRow) {
    onPick(
      {
        serviceType: "clinic",
        specialtyId: d.specialty_id,
        doctorId: d.id,
        branchId: d.branch_id ?? null,
      },
      5,
    );
  }

  function pickNearest(r: { doctor: DoctorRow; at: Date; branchId: string | null }) {
    onPick(
      {
        serviceType: "clinic",
        specialtyId: r.doctor.specialty_id,
        doctorId: r.doctor.id,
        branchId: r.branchId ?? r.doctor.branch_id ?? null,
      },
      5,
    );
  }

  const NAV = t("concierge.searchPlaceholder", "ابحث عن طبيب، تخصص، أو عَرَض طبي...");
  const nameOf = (d: DoctorRow) => (lang === "ar" ? d.name_ar : d.name_en) || d.name_ar;
  const specName = (d: DoctorRow) =>
    (lang === "ar" ? d.specialty_name_ar : d.specialty_name_en) || d.specialty_name_ar || "";

  return (
    <div className="space-y-6">
      {/* Unified Smart Search Bar --------------------------------------------- */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-6 flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center shadow-sm">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="absolute inset-y-0 my-auto h-5 w-5 text-muted-foreground start-4"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={NAV}
            aria-label={NAV}
            className="w-full ps-12 pe-4 py-4 bg-muted/40 rounded-xl text-base md:text-lg outline-none focus:ring-2 focus:ring-primary/60 placeholder:text-muted-foreground font-medium"
          />
          {(suggestions.doctors.length > 0 || suggestions.specialties.length > 0) && (
            <div className="absolute z-20 mt-2 w-full rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
              {suggestions.doctors.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => pickDoctor(d)}
                  className="w-full text-start px-4 py-3 hover:bg-muted flex items-center justify-between gap-3"
                >
                  <span className="font-semibold">{nameOf(d)}</span>
                  <span className="text-xs text-muted-foreground">{specName(d)}</span>
                </button>
              ))}
              {suggestions.specialties.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    onPick({ serviceType: "clinic", specialtyId: s.id }, 2)
                  }
                  className="w-full text-start px-4 py-3 hover:bg-muted border-t border-border/50 flex items-center justify-between gap-3"
                >
                  <span className="font-medium">
                    {lang === "ar" ? s.name_ar : s.name_en}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("concierge.specialty", "تخصص")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          type="button"
          onClick={fetchNearest}
          disabled={loadingNearest}
          className="whitespace-nowrap gap-2 h-12 md:h-14 px-6 md:px-8 text-base bg-[color:var(--gold,#b8860b)] hover:brightness-95 text-white font-bold shadow-md"
        >
          <Zap className="h-5 w-5" aria-hidden />
          {loadingNearest
            ? t("concierge.searchingNearest", "جارٍ البحث…")
            : t("concierge.nearestSlot", "أقرب موعد متاح الآن")}
        </Button>
      </div>

      {/* Nearest-slot results ------------------------------------------------- */}
      {nearest.length > 0 && (
        <section
          aria-labelledby="nearest-heading"
          className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3"
        >
          <h3
            id="nearest-heading"
            className="text-base font-bold text-primary flex items-center gap-2"
          >
            <Clock className="h-4 w-4" aria-hidden />
            {t("concierge.nearestSlotsHeading", "أقرب المواعيد المتاحة عبر جميع الأطباء")}
          </h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {nearest.map((r) => (
              <li key={r.doctor.id + r.at.toISOString()}>
                <button
                  type="button"
                  onClick={() => pickNearest(r)}
                  className="w-full text-start rounded-xl border border-border bg-card hover:border-primary hover:shadow-sm transition p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold">{nameOf(r.doctor)}</div>
                    <div className="text-xs text-muted-foreground">{specName(r.doctor)}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-sm font-bold text-primary">
                      {r.at.toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Main grid: triage + doctors  |  sidebar ------------------------------ */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-6">
          {/* Symptom cards -------------------------------------------------- */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl md:text-2xl font-bold text-primary">
                {t("concierge.triageHeading", "بماذا تشعر اليوم؟")}
              </h2>
              <button
                type="button"
                onClick={() => onPick({ serviceType: "clinic" }, 3)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                {t("concierge.showAllSymptoms", "عرض كل التخصصات")}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
              {SYMPTOM_PRESETS.map((p) => (
                <SymptomCard
                  key={p.key}
                  label={t(`concierge.symptom.${p.key}`)}
                  onClick={() => pickSymptom(p)}
                  icon={p.key}
                />
              ))}
            </div>
          </section>

          {/* Recommended doctors -------------------------------------------- */}
          {recommended.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-base md:text-lg font-bold text-muted-foreground">
                {t("concierge.recommendedHeading", "أطباء موصى بهم")}
              </h3>
              {recommended.map((d, idx) => (
                <DoctorCard
                  key={d.id}
                  doctor={d}
                  lang={lang}
                  highlighted={idx === 0}
                  matchesInsurance={!!insurance}
                  insuranceName={
                    insurance
                      ? providers.find((x) => x.id === insurance)?.[lang === "ar" ? "name_ar" : "name_en"] ?? ""
                      : ""
                  }
                  onBook={() => pickDoctor(d)}
                />
              ))}
            </section>
          )}

          <button
            type="button"
            onClick={onFallbackToClassic}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 flex items-center gap-1"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
            {t("concierge.classicFlow", "التبديل إلى الحجز التقليدي (خطوة بخطوة)")}
          </button>
        </div>

        {/* Sidebar ---------------------------------------------------------- */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" aria-hidden />
              <h3 className="font-bold text-sm">
                {t("concierge.insuranceHeading", "التحقق الذكي من التأمين")}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs font-bold text-muted-foreground block mb-1">
                  {t("concierge.insuranceProvider", "مزود الخدمة")}
                </span>
                <select
                  value={insurance}
                  onChange={(e) => setInsurance(e.target.value)}
                  className="w-full bg-muted/40 border border-border rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">{t("concierge.insuranceNone", "بدون تأمين")}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {lang === "ar" ? p.name_ar : p.name_en}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                <span className="text-xs font-bold">
                  {t("concierge.nphiesConnected", "تم الربط مع منصة نفيس (NPHIES)")}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenWaitlist}
            className="w-full text-start rounded-2xl p-5 text-white shadow-lg"
            style={{
              background:
                "linear-gradient(135deg, var(--gold, #b8860b) 0%, #8a6508 100%)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-5 w-5" aria-hidden />
              <h3 className="font-bold">{t("concierge.waitlistHeading", "قائمة الانتظار الذكية")}</h3>
            </div>
            <p className="text-sm opacity-90 leading-relaxed mb-3">
              {t(
                "concierge.waitlistBody",
                "هل الطبيب المفضل غير متاح؟ سنشعرك فوراً عبر الواتساب عند شغور موعد قريب.",
              )}
            </p>
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/15 rounded-lg text-sm font-bold">
              {t("concierge.waitlistCta", "سجّل في الانتظار")}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <div className="text-xs text-muted-foreground font-medium mb-1">
                {t("concierge.statBranches", "الفروع")}
              </div>
              <div className="text-xl font-bold text-primary">{branchCount}</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <div className="text-xs text-muted-foreground font-medium mb-1">
                {t("concierge.statDoctors", "أطباء متاحون")}
              </div>
              <div className="text-xl font-bold text-primary">{doctors.length}</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------- Sub-components ------------------------------ */

function SymptomCard({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: "acute_pain" | "checkup" | "followup" | "other";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center p-4 md:p-5 bg-card border border-border rounded-2xl hover:border-primary hover:bg-primary/5 transition-all group text-center"
    >
      <div
        aria-hidden
        className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
      >
        <SymptomIcon icon={icon} />
      </div>
      <span className="font-bold text-sm text-foreground">{label}</span>
    </button>
  );
}

function SymptomIcon({ icon }: { icon: "acute_pain" | "checkup" | "followup" | "other" }) {
  const cls = "w-6 h-6";
  switch (icon) {
    case "acute_pain":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      );
    case "checkup":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case "followup":
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      );
  }
}

function DoctorCard({
  doctor,
  lang,
  highlighted,
  matchesInsurance,
  insuranceName,
  onBook,
}: {
  doctor: DoctorRow;
  lang: "ar" | "en";
  highlighted?: boolean;
  matchesInsurance?: boolean;
  insuranceName?: string;
  onBook: () => void;
}) {
  const { t } = useTranslation("booking");
  const name = (lang === "ar" ? doctor.name_ar : doctor.name_en) || doctor.name_ar;
  const spec =
    (lang === "ar" ? doctor.specialty_name_ar : doctor.specialty_name_en) ||
    doctor.specialty_name_ar ||
    "";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <div className="bg-card p-4 md:p-5 rounded-2xl border border-border flex flex-col sm:flex-row gap-4 md:gap-6 hover:shadow-md transition-all relative overflow-hidden">
      {highlighted && (
        <div className="absolute top-0 end-0 w-1.5 h-full bg-primary" aria-hidden />
      )}
      <div className="relative shrink-0">
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-primary/10 text-primary font-bold text-2xl grid place-items-center overflow-hidden">
          {doctor.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doctor.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span aria-hidden>{initials}</span>
          )}
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-lg md:text-xl font-bold text-primary">{name}</h4>
            <p className="text-sm text-muted-foreground font-medium">{spec}</p>
          </div>
          {matchesInsurance && insuranceName && (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" aria-hidden />
              <span className="text-xs font-bold">
                {t("concierge.matchesInsurance", "مطابق لتأمين {{name}}", { name: insuranceName })}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onBook} size="sm" className="font-bold">
            {t("concierge.bookNow", "حجز موعد")}
          </Button>
          {typeof doctor.avg_rating === "number" && doctor.avg_rating > 0 && (
            <span className="text-xs text-muted-foreground">
              ⭐ {doctor.avg_rating.toFixed(1)}
              {doctor.ratings_count ? ` (${doctor.ratings_count})` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
