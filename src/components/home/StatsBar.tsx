import { useEffect, useRef, useState } from "react";
import { Users, Stethoscope, CalendarCheck2, Award } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Stat = {
  value: number;
  suffix?: string;
  labelAr: string;
  labelEn: string;
  icon: React.ElementType;
};

const STATS: Stat[] = [
  { value: 15, suffix: "+", labelAr: "سنة خبرة", labelEn: "Years experience", icon: Award },
  { value: 40, suffix: "+", labelAr: "استشاري وأخصائي", labelEn: "Consultants", icon: Stethoscope },
  { value: 14, suffix: "+", labelAr: "تخصص طبي", labelEn: "Specialties", icon: Users },
  {
    value: 50000,
    suffix: "+",
    labelAr: "مريض سنوياً",
    labelEn: "Patients / year",
    icon: CalendarCheck2,
  },
];

function useCountUp(target: number, active: boolean, duration = 1200) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.floor(target * (0.2 + 0.8 * p * (2 - p))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return n;
}

function StatCard({ s, active }: { s: Stat; active: boolean }) {
  const { lang } = useI18n();
  const n = useCountUp(s.value, active);
  const Icon = s.icon;
  const formatted = n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : n.toString();
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <div className="mt-3 text-3xl font-extrabold text-foreground tabular-nums">
        {formatted}
        {s.suffix ?? ""}
      </div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">
        {lang === "ar" ? s.labelAr : s.labelEn}
      </div>
    </div>
  );
}

export function StatsBar() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(true)),
      { threshold: 0.2 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-12">
      <div className="container-app grid gap-4 grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <StatCard key={s.labelAr} s={s} active={active} />
        ))}
      </div>
    </section>
  );
}
