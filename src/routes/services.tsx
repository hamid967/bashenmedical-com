import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  Search,
  FlaskConical,
  Scan,
  Pill,
  Truck,
  Stethoscope,
  Home as HomeIcon,
  MessageSquareWarning,
  FileText,
  CreditCard,
  HeartPulse,
  Building2,
  Plane,
  ShieldCheck,
  Phone,
  Video,
  Star,
  Users,
  MapPin,
  ClipboardList,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "الخدمات الإلكترونية | باعشن الطبي" },
      {
        name: "description",
        content:
          "بوابة الخدمات الإلكترونية لمستشفى باعشن الطبي: احجز موعدك، تقاريرك، الصيدلية، الرعاية المنزلية والمزيد.",
      },
      { property: "og:title", content: "الخدمات الإلكترونية | باعشن الطبي" },
      {
        property: "og:description",
        content: "منصة موحدة لجميع خدمات المرضى الإلكترونية.",
      },
    ],
  }),
  component: ServicesPortal,
});

type Category =
  | "appointments"
  | "records"
  | "pharmacy"
  | "care"
  | "billing"
  | "support";

type Svc = {
  key: string;
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  cat: Category;
  auth?: boolean;
  keywords?: string;
};

const SERVICES: Svc[] = [
  { key: "book", ar: "احجز موعدك", en: "Book Appointment", descAr: "احجز مع استشاري في 12 تخصصًا.", descEn: "Book with a consultant in 12 specialties.", to: "/book", icon: CalendarCheck, cat: "appointments", keywords: "موعد حجز appointment" },
  { key: "lookup", ar: "تعديل / إلغاء موعد", en: "Manage Appointment", descAr: "ابحث عن حجزك برقم الجوال.", descEn: "Look up your booking by phone.", to: "/lookup", icon: Search, cat: "appointments" },
  { key: "telemed", ar: "الاستشارة عن بُعد", en: "Telemedicine", descAr: "استشارة فيديو مع الطبيب.", descEn: "Video consultation with doctor.", to: "/telemedicine", icon: Video, cat: "appointments" },
  { key: "second", ar: "رأي طبي ثانٍ", en: "Second Opinion", descAr: "مراجعة استشاري مختص لحالتك.", descEn: "Specialist review of your case.", to: "/second-opinion", icon: Stethoscope, cat: "appointments" },

  { key: "lab", ar: "التقارير المخبرية", en: "Lab Reports", descAr: "تحميل نتائج التحاليل.", descEn: "Download lab results.", to: "/my", icon: FlaskConical, cat: "records", auth: true },
  { key: "rad", ar: "تقارير الأشعة", en: "Radiology Reports", descAr: "صور وتقارير الأشعة.", descEn: "Images and reports.", to: "/my", icon: Scan, cat: "records", auth: true },
  { key: "prescriptions", ar: "الوصفات الطبية", en: "Prescriptions", descAr: "استعراض وصفاتك السابقة.", descEn: "View your prescriptions.", to: "/my", icon: ClipboardList, cat: "records", auth: true },
  { key: "records", ar: "الملف الطبي", en: "Medical Record", descAr: "زياراتك وتشخيصاتك.", descEn: "Visits and diagnoses.", to: "/my", icon: FileText, cat: "records", auth: true },

  { key: "pharmacy", ar: "الصيدلية", en: "Pharmacy", descAr: "اطلب دواءك مع توصيل.", descEn: "Order medicines with delivery.", to: "/pharmacy", icon: Pill, cat: "pharmacy" },
  { key: "delivery", ar: "توصيل الأدوية", en: "Medicine Delivery", descAr: "توصيل داخل جازان.", descEn: "Delivery within Jazan.", to: "/pharmacy", icon: Truck, cat: "pharmacy" },
  { key: "track", ar: "تتبع الطلب", en: "Track Order", descAr: "حالة طلب الصيدلية.", descEn: "Pharmacy order status.", to: "/track", icon: MapPin, cat: "pharmacy" },

  { key: "home-care", ar: "الرعاية المنزلية", en: "Home Care", descAr: "زيارات طبية للمنزل.", descEn: "In-home medical visits.", to: "/home-care", icon: HomeIcon, cat: "care" },
  { key: "emergency", ar: "الطوارئ", en: "Emergency", descAr: "خدمات الطوارئ على مدار الساعة.", descEn: "24/7 emergency services.", to: "/emergency", icon: HeartPulse, cat: "care" },
  { key: "intl", ar: "المرضى الدوليون", en: "International Patients", descAr: "خدمات المرضى من خارج المملكة.", descEn: "Services for international patients.", to: "/international-patients", icon: Plane, cat: "care" },
  { key: "corp", ar: "خدمات الشركات", en: "Corporate", descAr: "عقود واتفاقيات الشركات.", descEn: "Corporate contracts.", to: "/corporate", icon: Building2, cat: "care" },

  { key: "insurance", ar: "التأمين الطبي", en: "Insurance", descAr: "شركات التأمين المعتمدة.", descEn: "Approved insurance providers.", to: "/insurance", icon: ShieldCheck, cat: "billing" },
  { key: "packages", ar: "الباقات الطبية", en: "Medical Packages", descAr: "فحوصات وباقات بأسعار مميزة.", descEn: "Screening packages.", to: "/packages", icon: CreditCard, cat: "billing" },
  { key: "invoices", ar: "الفواتير", en: "Invoices", descAr: "استعراض فواتيرك.", descEn: "View your invoices.", to: "/my", icon: FileText, cat: "billing", auth: true },

  { key: "rate", ar: "قيّم تجربتك", en: "Rate Us", descAr: "شاركنا رأيك في الخدمة.", descEn: "Share your experience.", to: "/rate", icon: Star, cat: "support" },
  { key: "complaints", ar: "الشكاوى والاقتراحات", en: "Feedback", descAr: "صوتك يهمّنا.", descEn: "Your voice matters.", to: "/complaints", icon: MessageSquareWarning, cat: "support" },
  { key: "contact", ar: "تواصل معنا", en: "Contact", descAr: "أرقام وقنوات التواصل.", descEn: "Phones & channels.", to: "/contact", icon: Phone, cat: "support" },
  { key: "doctors", ar: "دليل الأطباء", en: "Doctor Directory", descAr: "تصفح الأطباء بالتخصص.", descEn: "Browse doctors by specialty.", to: "/doctors", icon: Users, cat: "support" },
];

const CATS: { key: Category | "all"; ar: string; en: string }[] = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "appointments", ar: "المواعيد", en: "Appointments" },
  { key: "records", ar: "الملفات الطبية", en: "Medical Records" },
  { key: "pharmacy", ar: "الصيدلية", en: "Pharmacy" },
  { key: "care", ar: "الرعاية", en: "Care" },
  { key: "billing", ar: "الفواتير والتأمين", en: "Billing & Insurance" },
  { key: "support", ar: "الدعم", en: "Support" },
];

function ServicesPortal() {
  const { lang } = useI18n();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return SERVICES.filter((s) => (cat === "all" ? true : s.cat === cat)).filter((s) => {
      if (!query) return true;
      const hay = `${s.ar} ${s.en} ${s.descAr} ${s.descEn} ${s.keywords ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [q, cat]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: SERVICES.length };
    for (const s of SERVICES) map[s.cat] = (map[s.cat] ?? 0) + 1;
    return map;
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative hero-gradient-deep overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, var(--brand-gold) 0, transparent 45%), radial-gradient(circle at 80% 80%, var(--brand-soft) 0, transparent 45%)",
          }}
          aria-hidden
        />
        <div className="container-app relative py-14 md:py-20">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--brand-gold-soft)] bg-white/15 px-3.5 py-1 text-xs font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand-gold)" }} aria-hidden />
              {lang === "ar" ? "بوابة الخدمات الإلكترونية" : "E-Services Portal"}
            </div>
            <h1 className="text-4xl md:text-5xl leading-tight text-white">
              {lang === "ar"
                ? "جميع خدماتك الطبية في مكان واحد"
                : "All your medical services, in one place"}
            </h1>
            <p className="mt-3 text-white/85 max-w-2xl leading-8">
              {lang === "ar"
                ? "احجز، تابع تقاريرك، اطلب دواءك، وتواصل معنا بسهولة."
                : "Book, track reports, order medicines and reach us easily."}
            </p>

            <div className="mt-6 flex items-center gap-2 bg-white rounded-2xl p-2 shadow-lg">
              <div className="grid place-items-center h-10 w-10 text-primary">
                <Search className="h-5 w-5" />
              </div>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  lang === "ar"
                    ? "ابحث عن خدمة… (حجز، صيدلية، أشعة)"
                    : "Search a service… (book, pharmacy, lab)"
                }
                className="flex-1 border-0 focus-visible:ring-0 text-foreground text-base h-11"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="text-xs font-semibold text-muted-foreground px-3 h-9 rounded-lg hover:bg-muted"
                >
                  {lang === "ar" ? "مسح" : "Clear"}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="border-b bg-background sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="container-app py-3 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            {CATS.map((c) => {
              const active = cat === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setCat(c.key)}
                  className={`px-4 h-9 rounded-full text-sm font-semibold transition-colors border ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {lang === "ar" ? c.ar : c.en}
                  <span className={`ms-2 text-[11px] ${active ? "text-white/80" : "text-muted-foreground"}`}>
                    {counts[c.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="py-10 md:py-14">
        <div className="container-app">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-2xl md:text-3xl">
              {lang === "ar" ? "الخدمات المتاحة" : "Available services"}
              <span className="ms-2 text-sm text-muted-foreground font-normal">
                ({results.length})
              </span>
            </h2>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-2xl">
              <p className="text-muted-foreground">
                {lang === "ar" ? "لا توجد نتائج مطابقة." : "No matching services."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {results.map((s) => {
                const Icon = s.icon;
                return (
                  <Link
                    key={s.key}
                    to={s.to}
                    className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-md transition-all flex flex-col h-full"
                  >
                    <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-4 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base">
                          {lang === "ar" ? s.ar : s.en}
                        </h3>
                        {s.auth && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {lang === "ar" ? "دخول" : "Sign-in"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground leading-6">
                        {lang === "ar" ? s.descAr : s.descEn}
                      </p>
                    </div>
                    <span className="mt-4 inline-flex items-center text-xs font-semibold text-primary">
                      {lang === "ar" ? "ابدأ ←" : "Open →"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
