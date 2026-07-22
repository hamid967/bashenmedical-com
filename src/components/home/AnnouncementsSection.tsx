import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Tag, Sparkles, CalendarDays, ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { StaggerReveal, RevealItem } from "@/components/motion/StaggerReveal";
import { SkeletonSwap, AnnouncementsSkeleton } from "@/components/home/HomeSkeletons";

type Kind = "offer" | "news" | "event";

type Item = {
  id: string;
  kind: Kind;
  badgeAr: string;
  badgeEn: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  ctaAr: string;
  ctaEn: string;
  to: string;
  dateAr?: string;
  dateEn?: string;
};

// Static placeholders; wired to `ads`/`offers` tables in Phase 2 of the plan.
const ITEMS: Item[] = [
  {
    id: "checkup",
    kind: "offer",
    badgeAr: "عرض حصري",
    badgeEn: "Exclusive offer",
    titleAr: "باقة الفحص الشامل بخصم 25%",
    titleEn: "Comprehensive checkup — 25% off",
    descAr: "فحوصات مخبرية، تخطيط قلب، واستشارة استشاري باطنة في زيارة واحدة.",
    descEn: "Full labs, ECG and an internist consultation — all in one visit.",
    ctaAr: "احجز الباقة",
    ctaEn: "Book the package",
    to: "/packages",
    dateAr: "لفترة محدودة",
    dateEn: "Limited time",
  },
  {
    id: "kids",
    kind: "event",
    badgeAr: "فعالية",
    badgeEn: "Event",
    titleAr: "يوم صحة الطفل — استشارات مجانية",
    titleEn: "Kids Health Day — free consultations",
    descAr: "استشارات مع أطباء الأطفال وتقييم النمو مجانًا هذا السبت.",
    descEn: "Free pediatric consultations and growth screening this Saturday.",
    ctaAr: "سجّل حضورك",
    ctaEn: "Reserve a spot",
    to: "/book",
    dateAr: "السبت · 10:00 ص",
    dateEn: "Saturday · 10:00 AM",
  },
  {
    id: "home-care",
    kind: "news",
    badgeAr: "جديد",
    badgeEn: "New",
    titleAr: "خدمة الرعاية المنزلية الآن في صبيا",
    titleEn: "Home care now available in Sabya",
    descAr: "تمريض، فحوصات، وأدوية إلى باب منزلك على مدار الأسبوع.",
    descEn: "Nursing, labs and medication delivered to your door, 7 days a week.",
    ctaAr: "اطلب الخدمة",
    ctaEn: "Request service",
    to: "/home-care",
  },
];

const KIND_META: Record<Kind, { icon: LucideIcon; color: string; glow: string }> = {
  offer: { icon: Tag, color: "var(--neon-teal)", glow: "var(--fut-glow-teal)" },
  event: { icon: CalendarDays, color: "var(--neon-purple)", glow: "var(--fut-glow-purple)" },
  news: { icon: Sparkles, color: "var(--electric-cyan)", glow: "var(--fut-glow-teal)" },
};

export function AnnouncementsSection() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  // Wired to a query so it participates in loading UX consistently with the
  // rest of the home page. Backed by static data now; swaps to ads/offers
  // tables in Phase 2 without touching this component.
  const { data: items = [], isPending } = useQuery({
    queryKey: ["home_announcements"],
    queryFn: async () => {
      // Small artificial latency ensures the skeleton has a visible pass
      // on fast connections; real DB queries will replace this.
      await new Promise((r) => setTimeout(r, 250));
      return ITEMS;
    },
    staleTime: 5 * 60_000,
  });

  return (
    <section className="py-16 md:py-20">
      <div className="container-app">
        <div className="mb-10 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.35em] uppercase text-[color:var(--neon-teal)]">
              <Megaphone className="h-3.5 w-3.5" />
              {isAr ? "الإعلانات والمنشورات" : "Announcements"}
            </div>
            <h2 className="mt-2 text-3xl md:text-4xl font-bold text-[color:var(--fut-ink)]">
              {isAr ? "جديدنا · عروضنا · فعالياتنا" : "News · Offers · Events"}
            </h2>
            <p className="mt-2 max-w-2xl text-[color:var(--fut-ink-muted)]">
              {isAr
                ? "تابع آخر ما يقدّمه مجمع باعشن الطبي من عروض وباقات وفعاليات صحية."
                : "The latest offers, packages and health events from Baeshen Medical."}
            </p>
          </div>
          <Link
            to="/media/news"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
          >
            {isAr ? "كل المنشورات" : "All posts"}
            <ArrowLeft className={`h-4 w-4 ${isAr ? "" : "rotate-180"}`} />
          </Link>
        </div>

        <SkeletonSwap loading={isPending} skeleton={<AnnouncementsSkeleton count={3} />}>
          <StaggerReveal className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => {
              const meta = KIND_META[it.kind];
              const Icon = meta.icon;
              return (
                <RevealItem
                  key={it.id}
                  className="glass-fut neon-glow-hover group relative flex h-full flex-col overflow-hidden p-6"
                >
                  {/* Aurora wash on hover */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: "var(--fut-gradient-aurora)" }}
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
                      style={{
                        color: meta.color,
                        borderColor: "var(--fut-border-strong)",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {isAr ? it.badgeAr : it.badgeEn}
                    </span>
                    {(it.dateAr || it.dateEn) && (
                      <span className="text-[11px] text-[color:var(--fut-ink-dim)]">
                        {isAr ? it.dateAr : it.dateEn}
                      </span>
                    )}
                  </div>

                  <h3 className="relative mt-5 text-xl font-bold leading-snug text-[color:var(--fut-ink)]">
                    {isAr ? it.titleAr : it.titleEn}
                  </h3>
                  <p className="relative mt-2 text-sm leading-6 text-[color:var(--fut-ink-muted)]">
                    {isAr ? it.descAr : it.descEn}
                  </p>

                  <div className="relative mt-auto pt-6">
                    <Link
                      to={it.to}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--fut-border)] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[color:var(--fut-ink)] transition group-hover:border-[var(--neon-teal)]"
                      style={{ boxShadow: "0 0 0 0 transparent" }}
                    >
                      {isAr ? it.ctaAr : it.ctaEn}
                      <ArrowLeft className={`h-4 w-4 ${isAr ? "" : "rotate-180"}`} />
                    </Link>
                  </div>

                  {/* Accent hairline */}
                  <span
                    className="pointer-events-none absolute inset-x-6 bottom-0 h-px opacity-40"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)`,
                    }}
                  />
                </RevealItem>
              );
            })}
          </StaggerReveal>
        </SkeletonSwap>
      </div>
    </section>
  );
}
