import { Link } from "@tanstack/react-router";
import { Search, CalendarCheck, HeartPulse } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const STEPS = [
  {
    icon: Search,
    ar: { title: "اختر التخصص أو الطبيب", desc: "تصفّح 14 تخصصًا ونخبة من الاستشاريين." },
    en: { title: "Pick a specialty or doctor", desc: "Browse 14 specialties and top consultants." },
  },
  {
    icon: CalendarCheck,
    ar: { title: "احجز الموعد إلكترونيًا", desc: "اختر التاريخ والوقت المناسبين لك بضغطة." },
    en: { title: "Book online", desc: "Pick the date and time that suits you in one click." },
  },
  {
    icon: HeartPulse,
    ar: {
      title: "زُر المجمّع واستلم تقاريرك",
      desc: "تجربة رعاية سلسة من الاستقبال حتى المتابعة.",
    },
    en: {
      title: "Visit us & get your reports",
      desc: "A smooth experience from arrival to follow-up.",
    },
  },
];

export function PatientJourney() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  return (
    <section className="py-16 md:py-24 bg-secondary/40">
      <div className="container-app">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            {isAr ? "رحلة المريض" : "Patient Journey"}
          </div>
          <h2 className="text-3xl md:text-4xl font-bold">
            {isAr ? "ثلاث خطوات إلى رعاية أفضل" : "Three steps to better care"}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {isAr
              ? "من اختيار الطبيب إلى استلام التقارير — تجربة مصمَّمة حول المريض."
              : "From choosing your doctor to receiving your reports — designed around you."}
          </p>
        </div>

        <div className="relative grid gap-6 md:grid-cols-3">
          <div
            aria-hidden
            className="hidden md:block absolute top-16 start-[16.66%] end-[16.66%] h-0.5 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20"
          />
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const copy = isAr ? s.ar : s.en;
            return (
              <div key={i} className="relative bento-card p-6 text-center bg-card">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/25 relative">
                  <Icon className="h-7 w-7" />
                  <span className="absolute -top-2 -end-2 grid h-7 w-7 place-items-center rounded-full bg-white text-primary text-xs font-bold border-2 border-primary">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-bold">{copy.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-6">{copy.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/book"
            className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold hover:bg-primary/90 transition shadow-lg shadow-primary/25"
          >
            {isAr ? "ابدأ الحجز الآن" : "Start booking now"}
          </Link>
        </div>
      </div>
    </section>
  );
}
