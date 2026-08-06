import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  User2,
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
import { JazanSectionLabel } from "@/components/jazan/JazanSectionLabel";
import { JazanIconFrame } from "@/components/jazan/JazanIconFrame";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeAbout } from "@/components/home/HomeAbout";
import { AppPromo } from "@/components/home/AppPromo";
import { NewDoctorsSection } from "@/components/home/NewDoctorsSection";
import ogHomeAsset from "@/assets/og-home-bmc.jpg.asset.json";
import i18n from "i18next";

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
    subAr: "بعد التسجيل في المنصة",
    subEn: "After platform sign-in",
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
    ar: { t: "حجز فوري", d: "احجز موعدك بعد التسجيل بتأكيد مباشر." },
    en: { t: "Instant booking", d: "Book after sign-in with direct confirmation." },
  },
  {
    icon: Sparkles,
    ar: { t: "تجربة رقمية", d: "بوابة مريض، تقارير، تذكيرات، وصيدلية أونلاين." },
    en: { t: "Digital-first", d: "Portal, reports, reminders, online pharmacy." },
  },
];

function HomePage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

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

  return (
    <div className="futuristic" dir={i18n.t("home:ltr")}>
      <HomeHero />

      {/* Trust strip — below hero fold */}
      <section className="pt-16 md:pt-20 pb-2">
        <div className="container-app">
          <StaggerReveal className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS.map((s) => (
              <RevealItem key={s.k} className="text-center py-3">
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

      <HomeAbout />

      {/* E-services */}
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
                    className="group flex h-full flex-col items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-white/80 p-5 text-center transition hover:-translate-y-0.5 hover:border-[color:var(--brand-gold)]/45"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--brand-mist)] text-[color:var(--brand-deep)]">
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

      {/* Specialties → book automation */}
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
              {specialties?.slice(0, 8).map((s) => (
                <RevealItem key={s.id}>
                  <Link
                    to="/book"
                    search={{ specialty: s.id }}
                    className="group block h-full rounded-2xl border border-[color:var(--border)] bg-white p-5 transition hover:border-[color:var(--brand-gold)]/50 hover:shadow-[0_14px_32px_-22px_rgba(7,94,99,0.45)]"
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
                    <div className="mt-3 text-xs font-semibold text-[color:var(--brand)] opacity-0 transition group-hover:opacity-100">
                      {isAr ? "احجز الآن ←" : "Book now →"}
                    </div>
                  </Link>
                </RevealItem>
              ))}
            </StaggerReveal>
          </SkeletonSwap>
        </div>
      </section>

      <AnnouncementsSection />

      {/* Why us */}
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
                  className="rounded-2xl border border-[color:var(--border)] bg-white p-6"
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

      {/* Featured doctors */}
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
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[color:var(--brand-gold)]/50 bg-[color:var(--brand-sand)]/50 px-4 py-2 text-sm font-semibold text-[color:var(--brand-deep)] hover:bg-[color:var(--brand-sand)]"
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
              {doctors?.map((d) => {
                const name = isAr ? d.name_ar : d.name_en;
                const title = isAr ? d.title_ar : d.title_en;
                const spec = isAr
                  ? (d.specialties as { name_ar?: string } | null)?.name_ar
                  : (d.specialties as { name_en?: string } | null)?.name_en;
                return (
                  <RevealItem key={d.id}>
                    <article className="home-doctor-card">
                      <div className="home-doctor-card__photo">
                        {d.photo_url ? (
                          <img src={d.photo_url} alt="" loading="lazy" />
                        ) : (
                          <span className="grid h-20 w-20 place-items-center rounded-full bg-white/70 text-[color:var(--brand-deep)] text-2xl font-bold">
                            {name?.charAt(0) || <User2 className="h-8 w-8" />}
                          </span>
                        )}
                      </div>
                      <div className="home-doctor-card__body">
                        <h3 className="font-bold text-[color:var(--fut-ink)]">{name}</h3>
                        <p className="mt-1 text-xs text-[color:var(--fut-ink-muted)]">
                          {title || spec}
                        </p>
                        <div className="mt-auto flex flex-col gap-2 pt-4">
                          <Link
                            to="/book"
                            search={{ doctor: d.id, specialty: d.specialty_id ?? undefined }}
                            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[color:var(--brand-gold)] px-3 py-2 text-xs font-bold text-[color:var(--brand-deep)] hover:bg-[color:var(--brand-gold-soft)]"
                          >
                            <CalendarCheck2 className="h-3.5 w-3.5" />
                            {i18n.t("home:book_with_doctor")}
                          </Link>
                          {d.slug ? (
                            <Link
                              to="/doctors/$slug"
                              params={{ slug: d.slug }}
                              className="inline-flex items-center justify-center rounded-full border border-[color:var(--border)] px-3 py-2 text-xs font-semibold text-[color:var(--brand-deep)] hover:bg-[color:var(--brand-mist)]"
                            >
                              {isAr ? "عرض الملف" : "View profile"}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  </RevealItem>
                );
              })}
            </StaggerReveal>
          </SkeletonSwap>
        </div>
      </section>

      <NewDoctorsSection />

      <AppPromo />

      {/* Visit / map */}
      <section className="site-section">
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
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white px-5 py-3 text-sm font-semibold text-[color:var(--fut-ink)] hover:border-[color:var(--brand-gold)]/45"
              >
                <Phone className="h-4 w-4" />
                {i18n.t("home:contact_us")}
              </Link>
            </div>
          </div>
          <div className="aspect-video overflow-hidden rounded-2xl border border-[color:var(--border)]">
            <iframe
              title="map"
              className="h-full w-full"
              loading="lazy"
              src={`https://maps.google.com/maps?q=${SITE.lat},${SITE.lng}&z=15&output=embed`}
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="site-section pb-24">
        <div className="container-app">
          <div className="home-cta-band px-8 py-12 md:px-12 text-center">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18), transparent 45%), radial-gradient(circle at 80% 80%, rgba(199,164,107,0.28), transparent 50%)",
              }}
              aria-hidden
            />
            <div className="relative">
              <h2 className="text-2xl md:text-4xl font-bold text-white">
                {isAr ? "ابدأ رحلتك نحو صحة أفضل الآن" : "Start your journey to better health"}
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-white/85 leading-7">
                {isAr
                  ? "سجّل في المنصة واحجز موعدك مع استشاريي مجمع باعشن الطبي."
                  : "Sign in to the platform and book with Baeshen Medical consultants."}
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/book"
                  className="inline-flex items-center gap-2 rounded-full bg-[color:var(--brand-gold)] px-6 py-3 text-sm font-bold text-[color:var(--brand-deep)] hover:bg-[color:var(--brand-gold-soft)] transition"
                >
                  <CalendarCheck2 className="h-4 w-4" />
                  {i18n.t("home:book_now")}
                </Link>
                <Link
                  to="/auth/register"
                  search={{ next: "/book" }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15 transition"
                >
                  {isAr ? "إنشاء حساب" : "Create account"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
