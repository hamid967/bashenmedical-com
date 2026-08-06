import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import {
  Stethoscope,
  CalendarCheck2,
  Phone,
  MapPin,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  Search,
  Clock3,
  HeartPulse,
  FlaskConical,
  Scan,
  Video,
} from "lucide-react";
import { buildLocalBusinessSchema } from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";
import { StaggerReveal, RevealItem } from "@/components/motion/StaggerReveal";
import { AnnouncementsSection } from "@/components/home/AnnouncementsSection";
import {
  SkeletonSwap,
  SpecialtiesSkeleton,
  DoctorsSkeleton,
  SectionError,
} from "@/components/home/HomeSkeletons";
import ogHomeAsset from "@/assets/og-home-bmc.jpg.asset.json";
import { JazanPattern } from "@/components/jazan/JazanPattern";
import { JazanSectionLabel } from "@/components/jazan/JazanSectionLabel";
import { JazanIconFrame } from "@/components/jazan/JazanIconFrame";
import { DoctorAutocomplete } from "@/components/home/DoctorAutocomplete";
import { NewDoctorsSection } from "@/components/home/NewDoctorsSection";
import i18n from "i18next";

// UDH-style headline e-services surfaced on the homepage as quick-access tiles.
const HOME_ESERVICES: {
  key: string;
  ar: string;
  en: string;
  subAr: string;
  subEn: string;
  to: string;
  search?: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "book",
    ar: "احجز موعد",
    en: "Book Appointment",
    subAr: "عيادات خارجية فورية",
    subEn: "Instant outpatient booking",
    to: "/book",
    icon: CalendarCheck2,
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
    subAr: "من بوابة المريض بعد الدخول",
    subEn: "Via patient portal after sign-in",
    to: "/auth/login",
    search: { next: "/my" },
    icon: FlaskConical,
  },
  {
    key: "radiology",
    ar: "تقارير الأشعة",
    en: "Radiology Reports",
    subAr: "من بوابة المريض بعد الدخول",
    subEn: "Via patient portal after sign-in",
    to: "/auth/login",
    search: { next: "/my" },
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

const HOME_URL = "https://bashenmedical.com/";
const HOME_TITLE = "مجمع باعشن الطبي بصبيا جازان | Baeshen Medical";
const HOME_DESC =
  "مجمع باعشن الطبي في صبيا، جازان — معتمد من CBAHI. احجز مع استشاريين في الباطنة والأطفال والنساء والأسنان، واطلب دواءك مع رعاية منزلية.";
const HOME_OG_IMAGE = `https://bashenmedical.com${ogHomeAsset.url}`;
const OG_IMAGE_ALT_AR =
  "بطاقة مشاركة مجمع باعشن الطبي في صبيا، جازان — معتمد من CBAHI مع اسم المجمع وشعار الهلال والسمّاعة";
const OG_IMAGE_ALT_EN =
  "Baeshen Medical Complex share card — Sabya, Jazan, Saudi Arabia — CBAHI accredited";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clinicSettingsQuery()),
  head: ({ loaderData }) => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESC },
      {
        name: "keywords",
        content:
          "مجمع باعشن الطبي, باعشن, مستشفى صبيا, أطباء جازان, حجز طبيب صبيا, صيدلية صبيا, رعاية منزلية جازان, CBAHI, Baeshen Medical, Sabya, Jazan",
      },
      { name: "author", content: "Baeshen Medical Complex" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "theme-color", content: "#0f766e" },
      // Open Graph
      { property: "og:site_name", content: "Baeshen Medical" },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: HOME_URL },
      { property: "og:locale", content: "ar_SA" },
      { property: "og:locale:alternate", content: "en_US" },
      { property: "og:image", content: HOME_OG_IMAGE },
      { property: "og:image:secure_url", content: HOME_OG_IMAGE },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: OG_IMAGE_ALT_AR },
      // Twitter
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@BaeshenMedical" },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESC },
      { name: "twitter:image", content: HOME_OG_IMAGE },
      { name: "twitter:image:alt", content: OG_IMAGE_ALT_EN },
    ],
    links: [
      { rel: "canonical", href: HOME_URL },
      { rel: "alternate", hrefLang: "ar-SA", href: HOME_URL },
      { rel: "alternate", hrefLang: "en", href: HOME_URL },
      { rel: "alternate", hrefLang: "x-default", href: HOME_URL },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildLocalBusinessSchema({
            pageUrl: HOME_URL,
            settings: loaderData as ClinicSettings | undefined,
          }),
        ),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Baeshen Medical",
          alternateName: "مجمع باعشن الطبي",
          url: HOME_URL,
          inLanguage: ["ar-SA", "en"],
          potentialAction: {
            "@type": "SearchAction",
            target: `${HOME_URL}health/search?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }),
      },
    ],
  }),
  component: HomePage,
});

const STATS = [
  { k: "12+", ar: "تخصص طبي", en: "Specialties" },
  { k: "40+", ar: "طبيب استشاري", en: "Consultants" },
  { k: "24/7", ar: "طوارئ ورعاية", en: "Emergency" },
  { k: "CBAHI", ar: "معتمد", en: "Accredited" },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    ar: { t: "معتمد CBAHI", d: "معايير جودة ورعاية مرضى معتمدة وطنيًا." },
    en: { t: "CBAHI accredited", d: "Nationally accredited quality standards." },
  },
  {
    icon: HeartPulse,
    ar: { t: "استشاريون خبراء", d: "فريق طبي متعدد التخصصات في قلب صبيا." },
    en: { t: "Expert consultants", d: "Multi-specialty team in the heart of Sabya." },
  },
  {
    icon: Clock3,
    ar: { t: "حجز فوري", d: "احجز موعدك في أقل من دقيقة بتأكيد مباشر." },
    en: { t: "Instant booking", d: "Confirm your slot in under a minute." },
  },
  {
    icon: Sparkles,
    ar: { t: "تجربة رقمية", d: "بوابة مريض، تقارير، تذكيرات، وصيدلية أونلاين." },
    en: { t: "Digital-first", d: "Portal, reports, reminders, online pharmacy." },
  },
];

function HomePage() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const isAr = lang === "ar";

  const [quickSpecialty, setQuickSpecialty] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");

  const {
    data: specialties,
    isPending: specialtiesLoading,
    error: specialtiesError,
    refetch: refetchSpecialties,
  } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialties")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    // Fail fast on permanent errors (e.g. 401) instead of retrying and
    // keeping the skeleton visible for many seconds.
    retry: 1,
    retryDelay: 400,
  });
  const {
    data: doctors,
    isPending: doctorsLoading,
    error: doctorsError,
    refetch: refetchDoctors,
  } = useQuery({
    queryKey: ["doctors_featured"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("*, specialties(*)")
        .eq("is_active", true)
        .limit(4);
      if (error) throw error;
      return data;
    },
    retry: 1,
    retryDelay: 400,
  });

  const onQuickBook = (e: React.FormEvent) => {
    e.preventDefault();
    const search: Record<string, string> = {};
    if (quickSpecialty) search.specialty = quickSpecialty;
    if (quickName) search.name = quickName;
    if (quickPhone) search.phone = quickPhone;
    navigate({ to: "/book", search });
  };

  return (
    <div className="futuristic" dir={i18n.t("home:ltr")}>
      {/* ===== HERO — brand-first, one composition ===== */}
      <section className="aurora-bg grid-overlay relative overflow-hidden min-h-[min(92dvh,880px)] flex flex-col justify-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-x-0 bottom-0 h-2/3"
            style={{
              background:
                "linear-gradient(to top, rgba(252,249,242,0.55), transparent 60%), radial-gradient(60% 50% at 50% 100%, rgba(199,164,107,0.10), transparent 70%)",
            }}
          />
          <svg
            viewBox="0 0 1440 320"
            preserveAspectRatio="none"
            className="absolute inset-x-0 bottom-0 h-56 md:h-72 w-full"
          >
            <defs>
              <linearGradient id="jazan-hero-mtn-1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#075E63" stopOpacity="0" />
                <stop offset="100%" stopColor="#075E63" stopOpacity="0.18" />
              </linearGradient>
              <linearGradient id="jazan-hero-mtn-2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#24745E" stopOpacity="0" />
                <stop offset="100%" stopColor="#24745E" stopOpacity="0.22" />
              </linearGradient>
              <linearGradient id="jazan-hero-mtn-3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B85C3C" stopOpacity="0" />
                <stop offset="100%" stopColor="#B85C3C" stopOpacity="0.18" />
              </linearGradient>
            </defs>
            <path
              d="M0,240 L120,180 L260,220 L420,150 L600,210 L780,140 L960,200 L1140,160 L1320,220 L1440,180 L1440,320 L0,320 Z"
              fill="url(#jazan-hero-mtn-1)"
            />
            <path
              d="M0,280 L160,220 L180,240 L340,190 L360,210 L520,170 L540,190 L720,220 L900,180 L920,200 L1100,170 L1120,190 L1300,220 L1440,200 L1440,320 L0,320 Z"
              fill="url(#jazan-hero-mtn-2)"
            />
            <path
              d="M0,300 L200,260 L400,285 L620,250 L820,290 L1040,255 L1240,290 L1440,265 L1440,320 L0,320 Z"
              fill="url(#jazan-hero-mtn-3)"
            />
            <line
              x1="0"
              y1="308"
              x2="1440"
              y2="308"
              stroke="#0B8585"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="3 6"
            />
          </svg>
          <svg
            viewBox="0 0 120 200"
            className="absolute -bottom-4 start-2 md:start-8 h-40 md:h-56 w-auto opacity-40"
            aria-hidden="true"
          >
            <g stroke="#24745E" strokeWidth="1.2" fill="none" strokeLinecap="round">
              <path d="M60 195 L60 40" />
              {Array.from({ length: 8 }).map((_, i) => {
                const y = 40 + i * 18;
                const len = 34 - i * 2;
                return (
                  <g key={i}>
                    <path d={`M60 ${y} Q ${60 - len / 2} ${y - 8} ${60 - len} ${y - 4}`} />
                    <path d={`M60 ${y} Q ${60 + len / 2} ${y - 8} ${60 + len} ${y - 4}`} />
                  </g>
                );
              })}
              <circle cx="60" cy="34" r="4" fill="#C7A46B" opacity="0.7" stroke="none" />
            </g>
          </svg>
          <div className="absolute top-6 end-6 h-16 w-40 opacity-25">
            <JazanPattern variant="standard" />
          </div>
        </div>

        <div className="container-app relative py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="brand-mark text-[clamp(2.35rem,6vw,4.25rem)] text-[color:var(--brand-deep)]">
              {isAr ? SITE.nameAr : SITE.nameEn}
            </p>
            <h1 className="mt-4 text-[clamp(1.35rem,3vw,2rem)] font-bold leading-snug text-[color:var(--fut-ink)]">
              {i18n.t("home:baeshen_medical_complex_specialist_care")}{" "}
              <span className="text-[color:var(--brand)]">{i18n.t("home:in_sabya_jazan")}</span>
            </h1>
            <p className="mt-5 mx-auto max-w-xl text-base md:text-lg text-[color:var(--fut-ink-muted)] leading-8">
              {i18n.t("home:book_certified_consultants_track_reports")}
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/book" className="btn-magnetic pulse-soft">
                <CalendarCheck2 className="h-4 w-4" />
                {i18n.t("home:book_an_appointment")}
              </Link>
              <Link
                to="/doctors"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--jazan-gold)]/45 bg-white/80 px-5 py-3 text-sm font-semibold text-[var(--jazan-teal)] backdrop-blur-md hover:bg-white transition"
              >
                <Search className="h-4 w-4" />
                {i18n.t("home:browse_doctors")}
              </Link>
            </div>

            <div className="mt-8">
              <DoctorAutocomplete />
            </div>
          </div>
        </div>
      </section>

      {/* ===== QUICK BOOKING ===== */}
      <section className="site-section">
        <div className="container-app">
          <div className="glass-fut mx-auto max-w-4xl p-6 md:p-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="section-eyebrow">{i18n.t("home:quick_booking")}</div>
                <h2 className="section-heading mt-2">
                  {i18n.t("home:start_your_appointment_in_30_seconds")}
                </h2>
              </div>
              <Link
                to="/book"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
              >
                {i18n.t("home:full_booking_form")}
                <ArrowLeft className={`h-4 w-4 ${i18n.t("home:rotate_180")}`} />
              </Link>
            </div>

            <form onSubmit={onQuickBook} className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-xs text-[color:var(--fut-ink-muted)]">
                  {i18n.t("home:specialty")}
                </span>
                <select
                  value={quickSpecialty}
                  onChange={(e) => setQuickSpecialty(e.target.value)}
                  className="input-glow w-full appearance-none"
                >
                  <option value="">{i18n.t("home:select_a_specialty")}</option>
                  {specialties?.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {isAr ? s.name_ar : s.name_en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[color:var(--fut-ink-muted)]">
                  {i18n.t("home:full_name")}
                </span>
                <input
                  type="text"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder={i18n.t("home:your_name")}
                  className="input-glow w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[color:var(--fut-ink-muted)]">
                  {i18n.t("home:mobile")}
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  placeholder="05xxxxxxxx"
                  className="input-glow w-full"
                />
              </label>
              <div className="flex md:items-end">
                <button type="submit" className="btn-magnetic w-full md:w-auto">
                  <CalendarCheck2 className="h-4 w-4" />
                  {i18n.t("home:continue")}
                </button>
              </div>
            </form>

            <p className="mt-3 text-[11px] text-[color:var(--fut-ink-dim)]">
              {i18n.t("home:by_continuing_you_accept_our_privacy_pol")}
            </p>
          </div>
        </div>
      </section>

      {/* ===== TRUST STRIP (moved out of hero) ===== */}
      <section className="pb-4">
        <div className="container-app">
          <StaggerReveal className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS.map((s) => (
              <RevealItem key={s.k} className="glass-fut p-5 text-center relative overflow-hidden">
                <span
                  aria-hidden="true"
                  className="absolute -top-1 start-1/2 -translate-x-1/2 h-1 w-8 rounded-b bg-[var(--jazan-gold)]/70"
                />
                <div className="text-2xl md:text-3xl font-extrabold text-[color:var(--brand-deep)]">
                  {s.k}
                </div>
                <div className="mt-1 text-xs tracking-wide text-[color:var(--fut-ink-muted)]">
                  {isAr ? s.ar : s.en}
                </div>
              </RevealItem>
            ))}
          </StaggerReveal>
        </div>
      </section>

      {/* ===== E-SERVICES ===== */}
      <section className="site-section-alt">
        <div className="container-app">
          <div className="mb-10">
            <JazanSectionLabel>{isAr ? "الخدمات الإلكترونية" : "E-Services"}</JazanSectionLabel>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <h2 className="section-heading">
                {isAr
                  ? "كل خدماتك الطبية بنقرة واحدة"
                  : "All your medical services, one click away"}
              </h2>
              <Link
                to="/services"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
              >
                {isAr ? "كل الخدمات الإلكترونية" : "All e-services"}
                <ArrowLeft className={`h-4 w-4 ${i18n.t("home:rotate_180")}`} />
              </Link>
            </div>
          </div>
          <StaggerReveal className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {HOME_ESERVICES.map((s) => {
              const Icon = s.icon;
              return (
                <RevealItem key={s.key}>
                  <Link
                    to={s.to}
                    search={s.search}
                    className="glass-fut group flex h-full flex-col items-center gap-2 p-5 text-center transition-transform hover:-translate-y-0.5"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--neon-teal)]/15 text-[color:var(--neon-teal)]">
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="text-sm font-bold text-[color:var(--fut-ink)]">
                      {isAr ? s.ar : s.en}
                    </span>
                    <span className="text-[11px] leading-4 text-[color:var(--fut-ink-dim)]">
                      {isAr ? s.subAr : s.subEn}
                    </span>
                  </Link>
                </RevealItem>
              );
            })}
          </StaggerReveal>
        </div>
      </section>

      {/* ===== SPECIALTIES ===== */}
      <section className="site-section">
        <div className="container-app">
          <div className="mb-10 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <JazanSectionLabel>{i18n.t("home:specialties")}</JazanSectionLabel>
              <h2 className="section-heading mt-2">{i18n.t("home:specialties_title")}</h2>
              <p className="section-lede">{i18n.t("home:specialties_sub")}</p>
            </div>
            <Link
              to="/specialties"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
            >
              {i18n.t("home:all_specialties")}
              <ArrowLeft className={`h-4 w-4 ${i18n.t("home:rotate_180")}`} />
            </Link>
          </div>

          <SkeletonSwap
            loading={specialtiesLoading}
            error={specialtiesError}
            skeleton={<SpecialtiesSkeleton count={8} />}
            errorFallback={
              <SectionError
                title={i18n.t("home:could_not_load_specialties")}
                hint={i18n.t("home:a_network_error_occurred_check_your_conn")}
                retryLabel={i18n.t("home:try_again")}
                onRetry={() => refetchSpecialties()}
              />
            }
          >
            <StaggerReveal className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {specialties?.slice(0, 12).map((s) => (
                <RevealItem key={s.id}>
                  <Link
                    to="/book"
                    search={{ specialty: s.id }}
                    className="glass-fut neon-glow-hover group block h-full p-5 jazan-hairline jazan-hairline-hover transition"
                  >
                    <JazanIconFrame size="sm">
                      <Stethoscope className="h-5 w-5" />
                    </JazanIconFrame>
                    <div className="mt-3 text-sm font-semibold text-[color:var(--fut-ink)]">
                      {isAr ? s.name_ar : s.name_en}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--fut-ink-muted)] line-clamp-2">
                      {isAr ? s.description_ar : s.description_en}
                    </div>
                  </Link>
                </RevealItem>
              ))}
            </StaggerReveal>
          </SkeletonSwap>
        </div>
      </section>

      {/* ===== ANNOUNCEMENTS ===== */}
      <AnnouncementsSection />

      {/* ===== WHY US ===== */}
      <section className="site-section-alt">
        <div className="container-app">
          <div className="mb-10 max-w-2xl">
            <JazanSectionLabel>{i18n.t("home:why_baeshen")}</JazanSectionLabel>
            <h2 className="section-heading mt-2">
              {i18n.t("home:trusted_care_concierge_experience")}
            </h2>
          </div>
          <StaggerReveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              const c = isAr ? f.ar : f.en;
              return (
                <RevealItem
                  key={i}
                  className="glass-fut neon-glow-hover p-6 jazan-hairline jazan-hairline-hover transition"
                >
                  <JazanIconFrame>
                    <Icon className="h-5 w-5" />
                  </JazanIconFrame>
                  <h3 className="mt-4 text-lg font-bold text-[color:var(--fut-ink)]">{c.t}</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--fut-ink-muted)]">{c.d}</p>
                </RevealItem>
              );
            })}
          </StaggerReveal>
        </div>
      </section>

      {/* ===== FEATURED DOCTORS ===== */}
      <section className="site-section">
        <div className="container-app">
          <div className="mb-10 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <JazanSectionLabel>{i18n.t("home:medical_team")}</JazanSectionLabel>
              <h2 className="section-heading mt-2">{i18n.t("home:doctors_title")}</h2>
              <p className="section-lede">{i18n.t("home:doctors_sub")}</p>
            </div>
            <Link
              to="/doctors"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
            >
              {i18n.t("home:nav_doctors")}
              <ArrowLeft className={`h-4 w-4 ${i18n.t("home:rotate_180")}`} />
            </Link>
          </div>

          <SkeletonSwap
            loading={doctorsLoading}
            error={doctorsError}
            skeleton={<DoctorsSkeleton count={4} />}
            errorFallback={
              <SectionError
                title={i18n.t("home:could_not_load_doctors")}
                hint={i18n.t("home:a_network_error_occurred_check_your_conn")}
                retryLabel={i18n.t("home:try_again")}
                onRetry={() => refetchDoctors()}
              />
            }
          >
            <StaggerReveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {doctors?.map((d) => (
                <RevealItem
                  key={d.id}
                  className="glass-fut neon-glow-hover flex flex-col items-center p-6 text-center"
                >
                  <div
                    className="grid h-24 w-24 place-items-center rounded-full text-2xl font-bold text-[#04121a] shadow-[var(--fut-glow-teal)]"
                    style={{ background: "var(--fut-gradient-neon)" }}
                  >
                    {(isAr ? d.name_ar : d.name_en).charAt(0)}
                  </div>
                  <div className="mt-4">
                    <div className="font-bold text-[color:var(--fut-ink)]">
                      {isAr ? d.name_ar : d.name_en}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--fut-ink-muted)]">
                      {isAr ? d.title_ar : d.title_en}
                    </div>
                  </div>
                  <Link
                    to="/book"
                    search={{ doctor: d.id }}
                    className="btn-magnetic mt-4 w-full !py-2 text-xs"
                  >
                    {i18n.t("home:book_with_doctor")}
                  </Link>
                </RevealItem>
              ))}
            </StaggerReveal>
          </SkeletonSwap>
        </div>
      </section>

      {/* ===== NEWLY JOINED DOCTORS ===== */}
      <NewDoctorsSection />

      {/* ===== VISIT / MAP ===== */}
      <section className="site-section-alt">
        <div className="container-app grid items-center gap-8 md:grid-cols-2">
          <div>
            <JazanSectionLabel>{i18n.t("home:visit_us")}</JazanSectionLabel>
            <h2 className="section-heading mt-2">{i18n.t("home:in_the_heart_of_sabya")}</h2>
            <p className="mt-3 text-[color:var(--fut-ink-muted)] leading-7">
              {isAr ? SITE.addressAr : SITE.addressEn}
            </p>
            <p className="mt-1 text-sm text-[color:var(--fut-ink-dim)]">
              {isAr ? `الرمز البريدي ${SITE.postalCode}` : `Postal code ${SITE.postalCode}`}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={SITE.mapsUrl} target="_blank" rel="noreferrer" className="btn-magnetic">
                <MapPin className="h-4 w-4" />
                {i18n.t("home:open_in_maps")}
              </a>
              <Link
                to="/contact"
                className="neon-glow-hover inline-flex items-center gap-2 rounded-full border border-[var(--fut-border)] bg-white/90 px-5 py-3 text-sm font-semibold text-[color:var(--fut-ink)]"
              >
                <Phone className="h-4 w-4" />
                {i18n.t("home:contact_us")}
              </Link>
            </div>
          </div>
          <div className="glass-fut aspect-video overflow-hidden !p-0 jazan-hairline">
            <iframe
              title="map"
              className="h-full w-full opacity-90"
              loading="lazy"
              src={`https://maps.google.com/maps?q=${SITE.lat},${SITE.lng}&z=15&output=embed`}
            />
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="site-section pb-24">
        <div className="container-app">
          <div
            className="relative overflow-hidden rounded-[1.5rem] border border-[color:var(--brand-gold-soft)] px-8 py-12 md:px-12 text-center text-white"
            style={{ background: "var(--fut-gradient-neon)" }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18), transparent 45%), radial-gradient(circle at 80% 80%, rgba(199,164,107,0.25), transparent 50%)",
              }}
              aria-hidden
            />
            <div className="relative">
              <h2 className="text-2xl md:text-4xl font-bold text-white">
                {i18n.t("home:ready_for_a_better_care_experience")}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-white/85 leading-7">
                {i18n.t("home:book_now_or_leave_your_number_we_ll_call")}
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/book"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[color:var(--brand-deep)] hover:bg-[color:var(--brand-sand)] transition"
                >
                  <CalendarCheck2 className="h-4 w-4" />
                  {i18n.t("home:book_now")}
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15 transition"
                >
                  <Phone className="h-4 w-4" />
                  {i18n.t("home:call_us")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
