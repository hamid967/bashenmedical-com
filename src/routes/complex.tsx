import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SITE, whatsappUrl } from "@/lib/site";
import {
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  Award,
  ShieldCheck,
  HeartPulse,
  Users,
  Building2,
  ChevronLeft,
  Home,
  Calendar,
  Stethoscope,
  Pill,
  Star,
} from "lucide-react";
import heroImg from "@/assets/complex-hero.jpg";
import lobbyImg from "@/assets/complex-lobby.jpg";
import clinicImg from "@/assets/complex-clinic.jpg";
import pharmacyImg from "@/assets/complex-pharmacy.jpg";
import logoAsset from "@/assets/bmc-logo.jpg.asset.json";

const logoImg = logoAsset.url;

import { buildLocalBusinessSchema, buildBreadcrumbs, SITE_URL } from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";

const COMPLEX_URL = `${SITE_URL}/complex`;

export const Route = createFileRoute("/complex")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clinicSettingsQuery()),
  head: ({ loaderData }) => ({
    meta: [
      { title: "المجمع الطبي | مجمع باعشن الطبي — صبيا، جازان" },
      {
        name: "description",
        content:
          "تعرّف على مجمع باعشن الطبي في صبيا، جازان. عيادات تخصصية، صيدلية داخلية، طوارئ ورعاية شاملة بمعايير عالمية.",
      },
      { property: "og:title", content: "المجمع الطبي — مجمع باعشن" },
      {
        property: "og:description",
        content:
          "رعاية متكاملة في قلب صبيا: تخصصات متعددة، أطباء استشاريون، وخدمة على مدار الأسبوع.",
      },
      { property: "og:image", content: heroImg },
      { property: "og:type", content: "website" },
      { property: "og:url", content: COMPLEX_URL },
      { property: "og:locale", content: "ar_SA" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: heroImg },
    ],
    links: [{ rel: "canonical", href: COMPLEX_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildLocalBusinessSchema({
            pageUrl: COMPLEX_URL,
            settings: loaderData as ClinicSettings | undefined,
            extraTypes: ["Place"],
            amenities: [
              { name: "اعتماد CBAHI" },
              { name: "صيدلية داخلية" },
              { name: "خدمات طوارئ" },
              { name: "مواقف سيارات" },
              { name: "وصول لذوي الاحتياجات الخاصة" },
              { name: "تأمين طبي مقبول" },
            ],
          }),
        ),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildBreadcrumbs([
            { name: "الرئيسية", path: "/" },
            { name: "المجمع الطبي", path: "/complex" },
          ]),
        ),
      },
    ],
  }),
  component: ComplexPage,
});

const gallery = [
  { src: lobbyImg, ar: "استقبال المجمع", en: "Reception lobby" },
  { src: clinicImg, ar: "غرف العيادات", en: "Clinic rooms" },
  { src: pharmacyImg, ar: "الصيدلية الداخلية", en: "In-house pharmacy" },
];

const features = [
  {
    icon: Award,
    ar_t: "اعتماد CBAHI",
    en_t: "CBAHI Accredited",
    ar_d: "منشأة معتمدة من المركز السعودي لاعتماد المنشآت الصحية.",
    en_d: "Accredited by the Saudi Central Board for Healthcare Accreditation.",
  },
  {
    icon: Users,
    ar_t: "فريق استشاري",
    en_t: "Consultant Team",
    ar_d: "نخبة من الاستشاريين والأخصائيين في مختلف التخصصات.",
    en_d: "A curated team of consultants and specialists across fields.",
  },
  {
    icon: HeartPulse,
    ar_t: "رعاية متكاملة",
    en_t: "Integrated Care",
    ar_d: "من الاستشارة إلى الفحوصات والصيدلية تحت سقف واحد.",
    en_d: "From consultation to diagnostics and pharmacy under one roof.",
  },
  {
    icon: ShieldCheck,
    ar_t: "سلامة المريض",
    en_t: "Patient Safety",
    ar_d: "بروتوكولات صارمة للتعقيم وسلامة الإجراءات الطبية.",
    en_d: "Strict sterilization and medical-safety protocols.",
  },
  {
    icon: Pill,
    ar_t: "صيدلية داخلية",
    en_t: "In-House Pharmacy",
    ar_d: "صرف الأدوية فور انتهاء الكشف مع خيار توصيل للمنزل.",
    en_d: "Instant dispensing after your visit with a home-delivery option.",
  },
  {
    icon: Building2,
    ar_t: "موقع استراتيجي",
    en_t: "Strategic Location",
    ar_d: "في قلب صبيا على طريق الملك عبدالعزيز، سهل الوصول.",
    en_d: "In central Sabya on King Abdulaziz Rd — easy to reach.",
  },
];

function ComplexPage() {
  const { t: _t, lang } = useI18n();
  const ar = lang === "ar";

  const { data: specialties } = useQuery({
    queryKey: ["specialties_active"],
    queryFn: async () =>
      (await supabase.from("specialties").select("*").eq("is_active", true).order("sort_order"))
        .data ?? [],
  });
  const { data: doctors } = useQuery({
    queryKey: ["doctors_active"],
    queryFn: async () =>
      (
        await supabase
          .from("doctors")
          .select("*, specialties(*)")
          .eq("is_active", true)
          .order("sort_order")
          .limit(8)
      ).data ?? [],
  });

  return (
    <div className="bg-background">
      {/* Breadcrumb banner */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(1200px 400px at 50% 0%, hsl(var(--primary) / 0.25), transparent 60%)",
          }}
        />
        <div className="container-app relative py-10 md:py-14">
          <nav className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-primary inline-flex items-center gap-1">
              <Home className="h-3.5 w-3.5" /> {ar ? "الرئيسية" : "Home"}
            </Link>
            <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            <span className="text-foreground font-medium">
              {ar ? "المجمع الطبي" : "The Medical Complex"}
            </span>
          </nav>
          <div className="mt-6 flex items-center gap-4">
            <img
              src={logoImg}
              alt="Baeshen Medical Complex"
              width={72}
              height={72}
              className="h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-border"
            />
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-black tracking-tight">
                {ar
                  ? `${SITE.nameAr} — مجمع طبي متكامل في صبيا، جازان`
                  : `${SITE.nameEn} — Full-service Medical Complex in Sabya, Jazan`}
              </h1>
              <p className="mt-1 text-sm md:text-base text-muted-foreground">
                {ar
                  ? "عيادات تخصصية، صيدلية داخلية، وخدمات طوارئ باعتماد CBAHI"
                  : "Specialist clinics, in-house pharmacy, and emergency services — CBAHI accredited"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HERO */}
      <section className="relative">
        <div className="container-app py-6 md:py-10">
          <div className="relative overflow-hidden rounded-3xl border border-border shadow-2xl">
            <img
              src={heroImg}
              alt={ar ? "مبنى مجمع باعشن الطبي" : "Baeshen Medical Complex building"}
              width={1920}
              height={1080}
              className="w-full h-[380px] md:h-[560px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 text-white">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-[11px] font-semibold ring-1 ring-white/30">
                  <Star className="h-3 w-3" /> {ar ? "معتمد من CBAHI" : "CBAHI Accredited"}
                </span>
                <h2 className="mt-3 text-2xl md:text-4xl font-bold leading-tight drop-shadow">
                  {ar
                    ? "رعايتك تبدأ من هنا — بجودة عالمية ولمسة إنسانية"
                    : "Your care starts here — world-class quality, human touch"}
                </h2>
                <p className="mt-2 text-sm md:text-base text-white/85 max-w-xl">
                  {ar
                    ? "مجمع باعشن الطبي يقدّم خدمات تخصصية دقيقة وآمنة لكل أفراد الأسرة، مع التزام كامل بجودة الخدمة وراحة المراجع."
                    : "Baeshen Medical Complex delivers precise, safe specialty care for the whole family, with an uncompromising focus on quality and comfort."}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    to="/book"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Calendar className="h-4 w-4" /> {ar ? "احجز موعدك" : "Book an Appointment"}
                  </Link>
                  <a
                    href={whatsappUrl(
                      ar
                        ? `مرحبًا ${SITE.nameAr}، أرغب بالاستفسار.`
                        : `Hello ${SITE.nameEn}, I would like to inquire.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/20"
                  >
                    <MessageCircle className="h-4 w-4" /> {ar ? "واتساب" : "WhatsApp"}
                  </a>
                  <a
                    href={`tel:${SITE.phone}`}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/20"
                  >
                    <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Info strip */}
      <section className="container-app pb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            icon={<MapPin className="h-5 w-5" />}
            title={ar ? "العنوان" : "Address"}
            value={ar ? SITE.addressAr : SITE.addressEn}
            href={SITE.mapsUrl}
          />
          <InfoCard
            icon={<Clock className="h-5 w-5" />}
            title={ar ? "ساعات العمل" : "Working hours"}
            value={
              ar
                ? "السبت – الأربعاء 9ص – 9م / الخميس 9ص – 1م"
                : "Sat – Wed 9am – 9pm / Thu 9am – 1pm"
            }
          />
          <InfoCard
            icon={<Phone className="h-5 w-5" />}
            title={ar ? "اتصل بنا" : "Call us"}
            value={SITE.phoneDisplay}
            href={`tel:${SITE.phone}`}
          />
          <InfoCard
            icon={<MessageCircle className="h-5 w-5" />}
            title={ar ? "واتساب" : "WhatsApp"}
            value={SITE.mobileDisplay}
            href={whatsappUrl(
              ar
                ? `مرحبًا ${SITE.nameAr}، أرغب بالاستفسار.`
                : `Hello ${SITE.nameEn}, I would like to inquire.`,
            )}
          />
        </div>
      </section>

      {/* About */}
      <section className="container-app py-10 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] items-center">
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              {ar ? "عن المجمع" : "About the Complex"}
            </span>
            <h3 className="mt-2 text-2xl md:text-3xl font-bold">
              {ar
                ? "مجمع طبي رائد في صبيا يجمع بين الخبرة والتقنية"
                : "A leading medical complex in Sabya — expertise meets technology"}
            </h3>
            <div className="mt-4 space-y-3 text-sm md:text-base text-muted-foreground leading-relaxed">
              <p>
                {ar
                  ? "مجمع باعشن الطبي أحد أبرز الوجهات الصحية في محافظة صبيا بمنطقة جازان. يقدّم المجمع خدمات طبية متكاملة على أيدي نخبة من الأطباء الاستشاريين والاختصاصيين، مع بيئة علاجية آمنة، ومعايير جودة عالمية، وحرص دائم على راحة المراجع وأسرته في كل خطوة من رحلة العلاج."
                  : "Baeshen Medical Complex is a leading healthcare destination in Sabya, Jazan region. It delivers integrated medical services through a select team of consultants and specialists in a safe, standards-driven environment — with an unwavering focus on patient comfort at every step."}
              </p>
              <p>
                {ar
                  ? "من الاستشارة الأولى إلى الفحوصات والتحاليل والصيدلية، صُمّم المجمع ليكون تجربة سلسة توفّر وقتك وتضمن جودة رعايتك."
                  : "From your first consultation to diagnostics, labs, and pharmacy, the complex was designed as one seamless journey that saves your time and safeguards your care."}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                to="/specialties"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <Stethoscope className="h-4 w-4" /> {ar ? "التخصصات" : "Specialties"}
              </Link>
              <Link
                to="/doctors"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <Users className="h-4 w-4" /> {ar ? "الأطباء" : "Doctors"}
              </Link>
              <Link
                to="/pharmacy"
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <Pill className="h-4 w-4" /> {ar ? "الصيدلية" : "Pharmacy"}
              </Link>
            </div>
          </div>
          <div className="relative">
            <img
              src={lobbyImg}
              alt={ar ? "استقبال المجمع" : "Complex lobby"}
              loading="lazy"
              width={1200}
              height={800}
              className="w-full h-[300px] md:h-[420px] object-cover rounded-3xl border border-border shadow-xl"
            />
            <div className="absolute -bottom-6 -start-6 hidden md:block rounded-2xl bg-primary text-primary-foreground px-5 py-4 shadow-xl">
              <div className="text-3xl font-black leading-none">15+</div>
              <div className="text-xs opacity-90 mt-1">{ar ? "تخصص طبي" : "Specialties"}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-border bg-muted/30">
        <div className="container-app py-12 md:py-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              {ar ? "لماذا باعشن" : "Why Baeshen"}
            </span>
            <h3 className="mt-2 text-2xl md:text-3xl font-bold">
              {ar ? "مميزات تجعل تجربتك أفضل" : "What makes your experience better"}
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/50 hover:shadow-lg transition"
                >
                  <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center group-hover:bg-primary group-hover:text-primary-foreground transition">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h4 className="mt-4 font-bold">{ar ? f.ar_t : f.en_t}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{ar ? f.ar_d : f.en_d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="container-app py-12 md:py-16">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              {ar ? "جولة بصرية" : "Visual tour"}
            </span>
            <h3 className="mt-2 text-2xl md:text-3xl font-bold">
              {ar ? "من داخل المجمع" : "Inside the complex"}
            </h3>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {gallery.map((g, i) => (
            <figure
              key={i}
              className="group relative overflow-hidden rounded-2xl border border-border shadow-sm hover:shadow-xl transition"
            >
              <img
                src={g.src}
                alt={ar ? g.ar : g.en}
                loading="lazy"
                width={1200}
                height={800}
                className="w-full h-[240px] md:h-[280px] object-cover group-hover:scale-105 transition duration-500"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white text-sm font-medium">
                {ar ? g.ar : g.en}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Specialties strip */}
      {specialties && specialties.length > 0 && (
        <section className="border-y border-border bg-muted/30">
          <div className="container-app py-12 md:py-16">
            <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
              <div>
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  {ar ? "تخصصاتنا" : "Our specialties"}
                </span>
                <h3 className="mt-2 text-2xl md:text-3xl font-bold">
                  {ar ? "خدمات طبية متكاملة" : "Comprehensive medical services"}
                </h3>
              </div>
              <Link to="/specialties" className="text-sm font-medium text-primary hover:underline">
                {ar ? "عرض الكل" : "View all"} →
              </Link>
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {specialties.slice(0, 8).map((s) => (
                <Link
                  key={s.id}
                  to="/book"
                  search={{ specialty: s.slug }}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary hover:shadow-md transition"
                >
                  <div className="h-11 w-11 shrink-0 rounded-lg bg-primary/10 text-primary grid place-items-center font-bold text-sm group-hover:bg-primary group-hover:text-primary-foreground transition">
                    {(ar ? s.name_ar : s.name_en).charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {ar ? s.name_ar : s.name_en}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {ar ? "احجز الآن" : "Book now"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Doctors */}
      {doctors && doctors.length > 0 && (
        <section className="container-app py-12 md:py-16">
          <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
            <div>
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                {ar ? "استشاريونا" : "Our consultants"}
              </span>
              <h3 className="mt-2 text-2xl md:text-3xl font-bold">
                {ar ? "نخبة من الأطباء" : "A team you can trust"}
              </h3>
            </div>
            <Link to="/doctors" className="text-sm font-medium text-primary hover:underline">
              {ar ? "كل الأطباء" : "All doctors"} →
            </Link>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {doctors.map((d) => (
              <div
                key={d.id}
                className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg transition"
              >
                <div className="aspect-square bg-gradient-to-br from-primary/10 to-primary/5 grid place-items-center">
                  {d.photo_url ? (
                    <img
                      src={d.photo_url}
                      alt={ar ? d.name_ar : d.name_en}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-4xl font-black text-primary/60">
                      {(ar ? d.name_ar : d.name_en).charAt(0)}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="font-bold text-sm line-clamp-1">{ar ? d.name_ar : d.name_en}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {ar ? d.title_ar : d.title_en}
                  </div>
                  <Link
                    to="/book"
                    search={{ doctor: d.id }}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary/10 text-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition"
                  >
                    <Calendar className="h-3 w-3" /> {ar ? "احجز مع الطبيب" : "Book"}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Map + Contact */}
      <section className="border-t border-border bg-muted/30">
        <div className="container-app py-12 md:py-16">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                {ar ? "تواصل وموقع" : "Contact & location"}
              </span>
              <h3 className="mt-2 text-xl md:text-2xl font-bold">
                {ar ? "نحن هنا لخدمتك" : "We're here to serve you"}
              </h3>
              <ul className="mt-5 space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span>{ar ? SITE.addressAr : SITE.addressEn}</span>
                </li>
                <li className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <a href={`tel:${SITE.phone}`} className="hover:text-primary">
                    {SITE.phoneDisplay}
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <MessageCircle className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <a
                    href={whatsappUrl(
                      ar
                        ? `مرحبًا ${SITE.nameAr}، أرغب بالاستفسار.`
                        : `Hello ${SITE.nameEn}, I would like to inquire.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary"
                  >
                    {SITE.mobileDisplay}
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-primary mt-1 shrink-0" />
                  <span>
                    {ar
                      ? "السبت – الأربعاء: 9 ص – 9 م | الخميس: 9 ص – 1 م"
                      : "Sat – Wed: 9am – 9pm | Thu: 9am – 1pm"}
                  </span>
                </li>
              </ul>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Link
                  to="/book"
                  className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Calendar className="h-4 w-4" /> {ar ? "احجز" : "Book"}
                </Link>
                <a
                  href={SITE.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                >
                  <MapPin className="h-4 w-4" /> {ar ? "الاتجاهات" : "Directions"}
                </a>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden border border-border shadow-sm min-h-[320px]">
              <iframe
                title="map"
                src={`https://www.google.com/maps?q=${SITE.lat},${SITE.lng}&z=15&output=embed`}
                className="w-full h-full min-h-[320px] border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  value,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary/60 hover:shadow-md transition h-full">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-muted-foreground">{title}</div>
        <div className="mt-0.5 text-sm font-semibold truncate">{value}</div>
      </div>
    </div>
  );
  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel="noopener noreferrer"
      >
        {inner}
      </a>
    );
  }
  return inner;
}
