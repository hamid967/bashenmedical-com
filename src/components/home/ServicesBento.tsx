import { Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  Search,
  FlaskConical,
  Scan,
  Pill,
  Truck,
  Stethoscope,
  Home,
  MessageSquareWarning,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Service = {
  key: string;
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  size: "lg" | "md" | "sm";
  tone: "primary" | "accent" | "surface";
  requiresAuth?: boolean;
};

const SERVICES: Service[] = [
  {
    key: "book",
    ar: "احجز موعدك",
    en: "Book Appointment",
    descAr: "استشاريون في 12 تخصصًا، مواعيد فورية.",
    descEn: "12 specialties, instant slots.",
    to: "/book",
    icon: CalendarCheck,
    size: "lg",
    tone: "primary",
  },
  {
    key: "lookup",
    ar: "تعديل / إلغاء موعد",
    en: "Manage Appointment",
    descAr: "ابحث عن حجزك برقم الجوال.",
    descEn: "Find booking by phone.",
    to: "/lookup",
    icon: Search,
    size: "sm",
    tone: "surface",
  },
  {
    key: "lab",
    ar: "التقارير المخبرية",
    en: "Lab Reports",
    descAr: "تحميل نتائج التحاليل.",
    descEn: "Download lab results.",
    to: "/my",
    icon: FlaskConical,
    size: "sm",
    tone: "surface",
    requiresAuth: true,
  },
  {
    key: "radiology",
    ar: "تقارير الأشعة",
    en: "Radiology",
    descAr: "صور وتقارير الأشعة.",
    descEn: "Images and reports.",
    to: "/my",
    icon: Scan,
    size: "sm",
    tone: "surface",
    requiresAuth: true,
  },
  {
    key: "pharmacy",
    ar: "الصيدلية",
    en: "Pharmacy",
    descAr: "اطلب دواءك مع توصيل.",
    descEn: "Order with delivery.",
    to: "/pharmacy",
    icon: Pill,
    size: "md",
    tone: "accent",
  },
  {
    key: "home-care",
    ar: "الرعاية المنزلية",
    en: "Home Care",
    descAr: "زيارات طبية للمنزل.",
    descEn: "In-home visits.",
    to: "/home-care",
    icon: Home,
    size: "md",
    tone: "surface",
  },
  {
    key: "second-opinion",
    ar: "رأي طبي ثانٍ",
    en: "Second Opinion",
    descAr: "مراجعة استشاري مختص.",
    descEn: "Specialist review.",
    to: "/second-opinion",
    icon: Stethoscope,
    size: "sm",
    tone: "surface",
  },
  {
    key: "delivery",
    ar: "توصيل الأدوية",
    en: "Medicine Delivery",
    descAr: "توصيل داخل جازان.",
    descEn: "Delivery in Jazan.",
    to: "/pharmacy",
    icon: Truck,
    size: "sm",
    tone: "surface",
  },
  {
    key: "complaints",
    ar: "الشكاوى والاقتراحات",
    en: "Feedback",
    descAr: "صوتك يهمّنا.",
    descEn: "Your voice matters.",
    to: "/complaints",
    icon: MessageSquareWarning,
    size: "sm",
    tone: "surface",
  },
];

const TONE: Record<Service["tone"], string> = {
  primary: "bg-primary text-primary-foreground",
  accent: "bg-accent text-accent-foreground",
  surface: "bg-card text-foreground",
};

const SIZE: Record<Service["size"], string> = {
  lg: "md:col-span-2 md:row-span-2 min-h-[220px]",
  md: "md:col-span-2 min-h-[160px]",
  sm: "md:col-span-1 min-h-[160px]",
};

export function ServicesBento() {
  const { lang } = useI18n();
  return (
    <section className="py-16 md:py-24 bg-gradient-to-b from-background to-secondary/40">
      <div className="container-app">
        <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
              {lang === "ar" ? "الخدمات الإلكترونية" : "E-Services"}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">
              {lang === "ar" ? "كل ما تحتاجه، بنقرة واحدة" : "Everything you need, one click away"}
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              {lang === "ar"
                ? "منصة متكاملة لحجز المواعيد، تقاريرك الطبية، أدويتك وخدمات الرعاية المنزلية."
                : "An integrated portal for appointments, medical reports, pharmacy and home-care."}
            </p>
          </div>
          <Link
            to="/services"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shrink-0"
          >
            {lang === "ar" ? "عرض كل الخدمات ←" : "View all services →"}
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 auto-rows-[minmax(140px,auto)]">
          {SERVICES.map((s) => {
            const Icon = s.icon;
            const label = lang === "ar" ? s.ar : s.en;
            const desc = lang === "ar" ? s.descAr : s.descEn;
            const isDark = s.tone !== "surface";
            return (
              <Link
                key={s.key}
                to={s.to}
                className={`bento-card group relative overflow-hidden p-5 md:p-6 flex flex-col justify-between ${SIZE[s.size]} ${TONE[s.tone]}`}
              >
                <div
                  className={`h-11 w-11 rounded-xl grid place-items-center ${
                    isDark ? "bg-white/15" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-lg md:text-xl font-bold ${isDark ? "text-inherit" : ""}`}>
                      {label}
                    </h3>
                    {s.requiresAuth && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          isDark ? "bg-white/20" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {lang === "ar" ? "دخول" : "Sign-in"}
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-1 text-sm leading-6 ${
                      isDark ? "text-white/80" : "text-muted-foreground"
                    }`}
                  >
                    {desc}
                  </p>
                  <span
                    className={`mt-3 inline-flex items-center text-xs font-semibold ${
                      isDark ? "text-white" : "text-primary"
                    } opacity-80 group-hover:opacity-100`}
                  >
                    {lang === "ar" ? "ابدأ ←" : "Open →"}
                  </span>
                </div>
                {s.size === "lg" && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-16 -end-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
