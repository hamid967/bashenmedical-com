import { Link } from "@tanstack/react-router";
import { CalendarCheck, Search, FlaskConical, Scan, Video } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * UDH-style headline e-services rendered as a prominent quick-access tile row.
 * Single source of truth reused by the /services hub (and available for other
 * public pages). Each tile links to an existing patient flow.
 */
export type EService = {
  key: string;
  ar: string;
  en: string;
  subAr: string;
  subEn: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const FEATURED_ESERVICES: EService[] = [
  {
    key: "book",
    ar: "احجز موعد",
    en: "Book Appointment",
    subAr: "عيادات خارجية فورية",
    subEn: "Instant outpatient booking",
    to: "/book",
    icon: CalendarCheck,
  },
  {
    key: "manage",
    ar: "إدارة / إلغاء موعد",
    en: "Manage / Cancel",
    subAr: "تعديل أو إلغاء حجزك",
    subEn: "Edit or cancel a booking",
    to: "/lookup",
    icon: Search,
  },
  {
    key: "lab",
    ar: "تقارير المختبر",
    en: "Lab Reports",
    subAr: "نتائج التحاليل",
    subEn: "View lab results",
    to: "/my",
    icon: FlaskConical,
  },
  {
    key: "radiology",
    ar: "تقارير الأشعة",
    en: "Radiology Reports",
    subAr: "صور وتقارير الأشعة",
    subEn: "Imaging & reports",
    to: "/my",
    icon: Scan,
  },
  {
    key: "telemed",
    ar: "استشارة عن بُعد",
    en: "Online Consultation",
    subAr: "مكالمة فيديو مع طبيبك",
    subEn: "Video visit with a doctor",
    to: "/telemedicine",
    icon: Video,
  },
];

export function EServicesQuickAccess({ className }: { className?: string }) {
  const { lang } = useI18n();
  return (
    <section className={className ?? "container-app relative z-10 -mt-8 md:-mt-10"}>
      <h2 className="sr-only">{lang === "ar" ? "أبرز الخدمات" : "Top services"}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {FEATURED_ESERVICES.map((f) => {
          const Icon = f.icon;
          return (
            <Link
              key={f.key}
              to={f.to}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-6 w-6" />
              </span>
              <span className="text-sm font-bold leading-5 text-foreground">
                {lang === "ar" ? f.ar : f.en}
              </span>
              <span className="text-[11px] leading-4 text-muted-foreground">
                {lang === "ar" ? f.subAr : f.subEn}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
