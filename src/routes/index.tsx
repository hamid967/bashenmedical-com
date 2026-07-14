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

const HOME_URL = "https://bashenmedical.com/";
const HOME_TITLE =
  "مجمع باعشن الطبي بصبيا جازان — حجز أطباء استشاريين وصيدلية | Baeshen Medical";
const HOME_DESC =
  "مجمع باعشن الطبي في صبيا، جازان — معتمد من CBAHI. احجز موعدك مع استشاريين في الباطنة والأطفال والنساء والولادة والأسنان والعيون، واطلب دواءك من صيدلياتنا مع خدمة رعاية منزلية.";
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
  const { t, lang } = useI18n();
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
    <div className="futuristic" dir={isAr ? "rtl" : "ltr"}>
      {/* ===== HERO ===== */}
      <section className="aurora-bg grid-overlay relative">
        <div className="container-app relative py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--fut-border-strong)] bg-white/[0.03] px-4 py-1.5 text-[11px] tracking-[0.35em] uppercase text-[color:var(--fut-ink-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-teal)] pulse-neon" />
              {isAr ? "طب المستقبل · مجمع باعشن" : "Future of Care · Baeshen"}
            </div>
            <h1 className="mt-6 text-4xl md:text-6xl font-extrabold leading-[1.1]">
              <span className="block text-[color:var(--fut-ink)]">
                {isAr ? "مجمع باعشن الطبي — رعاية استشارية" : "Baeshen Medical Complex — Specialist Care"}
              </span>
              <span className="block text-neon">
                {isAr ? "في صبيا، جازان" : "in Sabya, Jazan"}
              </span>
            </h1>
            <p className="mt-5 text-base md:text-lg text-[color:var(--fut-ink-muted)] leading-8">
              {isAr
                ? "احجز مع استشاريين معتمدين، تابع تقاريرك، واطلب دواءك من صيدلياتنا — كلها من مكان واحد."
                : "Book certified consultants, track reports, and order medication — all in one place."}
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/book" className="btn-magnetic pulse-soft">
                <CalendarCheck2 className="h-4 w-4" />
                {isAr ? "احجز موعدك الآن" : "Book an appointment"}
              </Link>
              <Link
                to="/doctors"
                className="neon-glow-purple inline-flex items-center gap-2 rounded-full border border-[var(--fut-border)] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-[color:var(--fut-ink)] backdrop-blur-md"
              >
                <Search className="h-4 w-4" />
                {isAr ? "تصفّح الأطباء" : "Browse doctors"}
              </Link>
            </div>
          </div>

          {/* Stats strip */}
          <StaggerReveal className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS.map((s) => (
              <RevealItem key={s.k} className="glass-fut p-5 text-center">
                <div className="text-3xl md:text-4xl font-black text-neon">{s.k}</div>
                <div className="mt-1 text-xs tracking-widest uppercase text-[color:var(--fut-ink-muted)]">
                  {isAr ? s.ar : s.en}
                </div>
              </RevealItem>
            ))}
          </StaggerReveal>
        </div>
      </section>

      {/* ===== QUICK BOOKING ===== */}
      <section className="relative py-16 md:py-20">
        <div className="container-app">
          <div className="glass-fut mx-auto max-w-4xl p-6 md:p-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] tracking-[0.35em] uppercase text-[color:var(--neon-teal)]">
                  {isAr ? "حجز سريع" : "Quick booking"}
                </div>
                <h2 className="mt-2 text-2xl md:text-3xl font-bold text-[color:var(--fut-ink)]">
                  {isAr ? "ابدأ موعدك في 30 ثانية" : "Start your appointment in 30 seconds"}
                </h2>
              </div>
              <Link
                to="/book"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
              >
                {isAr ? "نموذج الحجز الكامل" : "Full booking form"}
                <ArrowLeft className={`h-4 w-4 ${isAr ? "" : "rotate-180"}`} />
              </Link>
            </div>

            <form onSubmit={onQuickBook} className="grid gap-3 md:grid-cols-[1.2fr_1fr_1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-xs text-[color:var(--fut-ink-muted)]">
                  {isAr ? "التخصص" : "Specialty"}
                </span>
                <select
                  value={quickSpecialty}
                  onChange={(e) => setQuickSpecialty(e.target.value)}
                  className="input-glow w-full appearance-none"
                >
                  <option value="">{isAr ? "اختر تخصصًا" : "Select a specialty"}</option>
                  {specialties?.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {isAr ? s.name_ar : s.name_en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[color:var(--fut-ink-muted)]">
                  {isAr ? "الاسم" : "Full name"}
                </span>
                <input
                  type="text"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder={isAr ? "الاسم الكامل" : "Your name"}
                  className="input-glow w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-[color:var(--fut-ink-muted)]">
                  {isAr ? "الجوال" : "Mobile"}
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
                  {isAr ? "متابعة" : "Continue"}
                </button>
              </div>
            </form>

            <p className="mt-3 text-[11px] text-[color:var(--fut-ink-dim)]">
              {isAr
                ? "بمتابعتك توافق على سياسة الخصوصية. لن يتم تأكيد الحجز حتى إكمال الخطوات في صفحة الحجز."
                : "By continuing you accept our privacy policy. Your slot is confirmed after the full booking flow."}
            </p>
          </div>
        </div>
      </section>

      {/* ===== SPECIALTIES ===== */}
      <section className="py-16 md:py-20">
        <div className="container-app">
          <div className="mb-10 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] tracking-[0.35em] uppercase text-[color:var(--neon-teal)]">
                {isAr ? "التخصصات" : "Specialties"}
              </div>
              <h2 className="mt-2 text-3xl md:text-4xl font-bold text-[color:var(--fut-ink)]">
                {t("specialties_title")}
              </h2>
              <p className="mt-2 max-w-2xl text-[color:var(--fut-ink-muted)]">
                {t("specialties_sub")}
              </p>
            </div>
            <Link
              to="/specialties"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
            >
              {t("all_specialties")}
              <ArrowLeft className={`h-4 w-4 ${isAr ? "" : "rotate-180"}`} />
            </Link>
          </div>

          <SkeletonSwap
            loading={specialtiesLoading}
            error={specialtiesError}
            skeleton={<SpecialtiesSkeleton count={8} />}
            errorFallback={
              <SectionError
                title={isAr ? "تعذّر تحميل التخصصات" : "Could not load specialties"}
                hint={
                  isAr
                    ? "حدث خطأ أثناء الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة."
                    : "A network error occurred. Check your connection and try again."
                }
                retryLabel={isAr ? "إعادة المحاولة" : "Try again"}
                onRetry={() => refetchSpecialties()}
              />
            }
          >
            <StaggerReveal className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {specialties?.slice(0, 12).map((s) => (
                <RevealItem key={s.id}>
                  <Link
                    to="/book"
                    search={{ specialty: s.slug }}
                    className="glass-fut neon-glow-hover group block h-full p-5"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--fut-border)] bg-white/[0.04] text-[color:var(--neon-teal)] transition group-hover:border-[var(--neon-teal)]">
                      <Stethoscope className="h-5 w-5" />
                    </div>
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
      <section className="py-16 md:py-20">

        <div className="container-app">
          <div className="mb-10 max-w-2xl">
            <div className="text-[11px] tracking-[0.35em] uppercase text-[color:var(--neon-teal)]">
              {isAr ? "لماذا باعشن؟" : "Why Baeshen"}
            </div>
            <h2 className="mt-2 text-3xl md:text-4xl font-bold text-[color:var(--fut-ink)]">
              {isAr ? "رعاية موثوقة · تجربة كونسيرج" : "Trusted care · concierge experience"}
            </h2>
          </div>
          <StaggerReveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              const c = isAr ? f.ar : f.en;
              return (
                <RevealItem key={i} className="glass-fut neon-glow-hover p-6">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--fut-border-strong)] bg-white/[0.04] text-[color:var(--neon-teal)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[color:var(--fut-ink)]">{c.t}</h3>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--fut-ink-muted)]">{c.d}</p>
                </RevealItem>
              );
            })}
          </StaggerReveal>
        </div>
      </section>

      {/* ===== FEATURED DOCTORS ===== */}
      <section className="py-16 md:py-20">
        <div className="container-app">
          <div className="mb-10 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] tracking-[0.35em] uppercase text-[color:var(--neon-teal)]">
                {isAr ? "الفريق الطبي" : "Medical team"}
              </div>
              <h2 className="mt-2 text-3xl md:text-4xl font-bold text-[color:var(--fut-ink)]">
                {t("doctors_title")}
              </h2>
              <p className="mt-2 max-w-2xl text-[color:var(--fut-ink-muted)]">
                {t("doctors_sub")}
              </p>
            </div>
            <Link
              to="/doctors"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--neon-teal)] hover:opacity-80"
            >
              {t("nav_doctors")}
              <ArrowLeft className={`h-4 w-4 ${isAr ? "" : "rotate-180"}`} />
            </Link>
          </div>

          <SkeletonSwap
            loading={doctorsLoading}
            error={doctorsError}
            skeleton={<DoctorsSkeleton count={4} />}
            errorFallback={
              <SectionError
                title={isAr ? "تعذّر تحميل الأطباء" : "Could not load doctors"}
                hint={
                  isAr
                    ? "حدث خطأ أثناء الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة."
                    : "A network error occurred. Check your connection and try again."
                }
                retryLabel={isAr ? "إعادة المحاولة" : "Try again"}
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
                  <div className="grid h-24 w-24 place-items-center rounded-full text-2xl font-bold text-[#04121a] shadow-[var(--fut-glow-teal)]"
                       style={{ background: "var(--fut-gradient-neon)" }}>
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
                    {t("book_with_doctor")}
                  </Link>
                </RevealItem>
              ))}
            </StaggerReveal>
          </SkeletonSwap>
        </div>
      </section>

      {/* ===== VISIT / MAP ===== */}
      <section className="py-16 md:py-20">
        <div className="container-app grid items-center gap-8 md:grid-cols-2">
          <div>
            <div className="text-[11px] tracking-[0.35em] uppercase text-[color:var(--neon-teal)]">
              {isAr ? "زُرنا" : "Visit us"}
            </div>
            <h2 className="mt-2 text-3xl md:text-4xl font-bold text-[color:var(--fut-ink)]">
              {isAr ? "في قلب صبيا" : "In the heart of Sabya"}
            </h2>
            <p className="mt-3 text-[color:var(--fut-ink-muted)]">
              {isAr ? SITE.addressAr : SITE.addressEn}
            </p>
            <p className="mt-1 text-sm text-[color:var(--fut-ink-dim)]">
              {isAr ? `الرمز البريدي ${SITE.postalCode}` : `Postal code ${SITE.postalCode}`}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={SITE.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-magnetic"
              >
                <MapPin className="h-4 w-4" />
                {isAr ? "افتح في الخرائط" : "Open in Maps"}
              </a>
              <Link
                to="/contact"
                className="neon-glow-hover inline-flex items-center gap-2 rounded-full border border-[var(--fut-border)] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-[color:var(--fut-ink)]"
              >
                <Phone className="h-4 w-4" />
                {isAr ? "تواصل معنا" : "Contact us"}
              </Link>
            </div>
          </div>
          <div className="glass-fut aspect-video overflow-hidden !p-0">
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
      <section className="pb-24 pt-8">
        <div className="container-app">
          <div className="glass-fut relative overflow-hidden p-8 md:p-12 text-center">
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{ background: "var(--fut-gradient-aurora)" }}
            />
            <div className="relative">
              <h2 className="text-2xl md:text-4xl font-bold text-[color:var(--fut-ink)]">
                {isAr ? "جاهز لتجربة أفضل لرعايتك؟" : "Ready for a better care experience?"}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-[color:var(--fut-ink-muted)]">
                {isAr
                  ? "احجز الآن أو اترك رقمك ونتصل بك خلال دقائق."
                  : "Book now or leave your number — we'll call you within minutes."}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link to="/book" className="btn-magnetic">
                  <CalendarCheck2 className="h-4 w-4" />
                  {isAr ? "احجز الآن" : "Book now"}
                </Link>
                <Link
                  to="/contact"
                  className="neon-glow-purple inline-flex items-center gap-2 rounded-full border border-[var(--fut-border)] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-[color:var(--fut-ink)]"
                >
                  <Phone className="h-4 w-4" />
                  {isAr ? "اتصل بنا" : "Call us"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


