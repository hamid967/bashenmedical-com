import { Link } from "@tanstack/react-router";
import { Smartphone, QrCode, Bell, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function AppPromo() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  return (
    <section className="py-16 md:py-24 bg-secondary/40">
      <div className="container-app">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-deep via-primary to-navy shadow-2xl shadow-primary/20">
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_30%,white/0.2,transparent_45%),radial-gradient(circle_at_80%_70%,white/0.15,transparent_55%)]"
          />
          <div className="relative grid gap-8 md:grid-cols-2 items-center p-8 md:p-14 text-primary-foreground">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5" />
                {isAr ? "بوابة المرضى" : "Patient Portal"}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold leading-tight">
                {isAr ? "بوابة باعشن الرقمية — كل تقاريرك بين يديك" : "Your health, in your pocket"}
              </h2>
              <p className="mt-3 text-white/80 max-w-lg">
                {isAr
                  ? "سجّل الدخول للاطلاع على مواعيدك، تقاريرك المخبرية، الأشعة والوصفات، مع تذكيرات ذكية."
                  : "Sign in to see your appointments, lab and radiology reports and prescriptions — with smart reminders."}
              </p>

              <ul className="mt-6 space-y-2 text-sm">
                {[
                  {
                    ic: Bell,
                    ar: "تذكيرات المواعيد قبل الزيارة",
                    en: "Appointment reminders before your visit",
                  },
                  {
                    ic: QrCode,
                    ar: "بطاقة QR للوصول السريع في الاستقبال",
                    en: "QR card for fast reception check-in",
                  },
                  { ic: Smartphone, ar: "متوفّر على جميع الأجهزة", en: "Works on any device" },
                ].map((f) => {
                  const Ic = f.ic;
                  return (
                    <li key={f.en} className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/15">
                        <Ic className="h-3.5 w-3.5" />
                      </span>
                      <span>{isAr ? f.ar : f.en}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/auth"
                  className="inline-flex items-center rounded-full bg-white text-primary px-5 py-2.5 text-sm font-bold hover:bg-white/90 transition"
                >
                  {isAr ? "دخول البوابة" : "Open portal"}
                </Link>
                <Link
                  to="/lookup"
                  className="inline-flex items-center rounded-full bg-white/10 border border-white/25 px-5 py-2.5 text-sm font-semibold hover:bg-white/20 transition"
                >
                  {isAr ? "تتبع موعد" : "Track appointment"}
                </Link>
              </div>
            </div>

            <div className="relative hidden md:block">
              <div className="relative mx-auto w-64 aspect-[9/16] rounded-[2.5rem] bg-white/10 border-[6px] border-white/20 shadow-2xl overflow-hidden backdrop-blur">
                <div className="absolute inset-0 p-5 flex flex-col gap-3">
                  <div className="h-8 rounded-lg bg-white/15" />
                  <div className="rounded-xl bg-white/15 p-3">
                    <div className="h-3 w-24 rounded bg-white/40" />
                    <div className="mt-2 h-6 w-32 rounded bg-white/60" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="aspect-square rounded-xl bg-white/15" />
                    <div className="aspect-square rounded-xl bg-white/15" />
                    <div className="aspect-square rounded-xl bg-white/25" />
                    <div className="aspect-square rounded-xl bg-white/15" />
                  </div>
                  <div className="mt-auto h-14 rounded-xl bg-white/25" />
                </div>
              </div>
              <div className="absolute -end-4 top-10 h-20 w-20 rounded-2xl bg-accent/40 blur-2xl" />
              <div className="absolute -start-6 bottom-8 h-24 w-24 rounded-full bg-white/20 blur-2xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
