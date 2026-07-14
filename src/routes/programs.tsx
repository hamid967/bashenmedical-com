import { createFileRoute, Link } from "@tanstack/react-router";
import {
  HeartPulse,
  Building2,
  Home,
  
  Baby,
  Plane,
  Video,
  Activity,
  ShieldPlus,
  Users,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { bmcOgImageMeta } from "@/lib/og-meta";

const SITE_URL = "https://bashenmedical.com";
const PAGE_URL = `${SITE_URL}/programs`;
const TITLE = "برامج مجمع باعشن الطبي — رعاية متكاملة لكل مرحلة";
const DESC =
  "برامج طبية متخصصة في مجمع باعشن الطبي بصبيا، جازان: صحة الشركات، الرعاية المنزلية، صحة الأم والطفل، الأمراض المزمنة، الرأي الطبي الثاني، الطب عن بُعد، والمرضى الدوليين. قدّم طلبك أونلاين.";

type Program = {
  id: string;
  title: string;
  tagline: string;
  Icon: React.ComponentType<{ className?: string }>;
  audience: string;
  benefits: string[];
  services: string[];
  applyTo:
    | "/book"
    | "/corporate"
    | "/home-care"
    | "/second-opinion"
    | "/telemedicine"
    | "/international-patients"
    | "/packages"
    | "/emergency";
  applyLabel: string;
  secondary?: { to: "/contact" | "/faq" | "/packages" | "/specialties"; label: string };
};

const PROGRAMS: Program[] = [
  {
    id: "executive-health",
    title: "برنامج الفحص التنفيذي الشامل",
    tagline: "فحص طبي متكامل خلال يوم واحد، مع تقرير تفصيلي واستشارة استشاري.",
    Icon: HeartPulse,
    audience: "كبار المسؤولين والراغبين بفحص وقائي دقيق فوق 35 سنة.",
    benefits: [
      "أكثر من 60 فحصًا مخبريًا وصورًا شعاعية",
      "تخطيط قلب و إيكو ومخطط مجهود عند الحاجة",
      "استشارة استشاري باطنية وتغذية",
      "تقرير طبي رقمي مفصّل وخطة متابعة",
    ],
    services: ["فحص شامل بلاتيني", "فحص صحة القلب", "فحص السكري", "فحص هرمونات وفيتامينات"],
    applyTo: "/packages",
    applyLabel: "تصفّح الباقات وقدّم الآن",
    secondary: { to: "/specialties", label: "التخصصات الطبية" },
  },
  {
    id: "corporate-wellness",
    title: "برنامج صحة الشركات والموظفين",
    tagline: "اتفاقيات طبية وفحوصات ما قبل التوظيف وعيادات في مقر الشركة.",
    Icon: Building2,
    audience: "الشركات، المصانع، الجهات الحكومية، والمؤسسات التعليمية.",
    benefits: [
      "أسعار تفضيلية للموظفين وذويهم",
      "فحوصات ما قبل التوظيف واللياقة السنوية",
      "حملات توعوية وتطعيمات موسمية",
      "إدارة حساب مخصص وفوترة شهرية موحدة",
    ],
    services: ["فحص ما قبل التوظيف", "عيادات دورية داخل المنشأة", "برامج الصحة المهنية", "تطعيم الإنفلونزا"],
    applyTo: "/corporate",
    applyLabel: "قدّم طلب اتفاقية شركة",
    secondary: { to: "/contact", label: "تواصل مع فريق الشركات" },
  },
  {
    id: "home-care",
    title: "برنامج الرعاية المنزلية",
    tagline: "رعاية طبية وتمريضية متكاملة في منزلك بإشراف فريق مؤهل.",
    Icon: Home,
    audience: "كبار السن، مرضى ما بعد العمليات، والمرضى ذوي الحالات المزمنة.",
    benefits: [
      "زيارات طبيب وتمريض منتظمة",
      "علاج طبيعي وتنفسي منزلي",
      "متابعة الجروح والقساطر والتغذية",
      "توفير الأجهزة الطبية والمستلزمات",
    ],
    services: ["زيارات تمريضية", "علاج طبيعي منزلي", "متابعة كبار السن", "رعاية ما بعد الجراحة"],
    applyTo: "/home-care",
    applyLabel: "اطلب زيارة منزلية",
    secondary: { to: "/faq", label: "الأسئلة الشائعة" },
  },
  {
    id: "maternal-child",
    title: "برنامج صحة الأم والطفل",
    tagline: "متابعة الحمل والولادة، تطعيمات الأطفال، وعيادات نمو وتغذية.",
    Icon: Baby,
    audience: "الحوامل، الأمهات الجدد، والأطفال حتى 14 سنة.",
    benefits: [
      "متابعة حمل شهرية مع استشارية نساء وولادة",
      "أشعة رباعية الأبعاد ومختبر متكامل",
      "جدول تطعيمات معتمد من وزارة الصحة",
      "استشارات رضاعة وتغذية للأطفال",
    ],
    services: ["عيادة النساء والولادة", "عيادة الأطفال", "التطعيمات", "الأشعة والمختبر"],
    applyTo: "/book",
    applyLabel: "احجز موعد الأم والطفل",
    secondary: { to: "/specialties", label: "التخصصات ذات الصلة" },
  },
  {
    id: "chronic-care",
    title: "برنامج إدارة الأمراض المزمنة",
    tagline: "متابعة منتظمة لمرضى السكري، الضغط، الربو، وأمراض القلب.",
    Icon: Activity,
    audience: "المرضى المصابون بأحد الأمراض المزمنة أو أكثر.",
    benefits: [
      "خطة علاجية فردية وأهداف قابلة للقياس",
      "تذكيرات آلية بالمواعيد والأدوية",
      "متابعة قراءات السكر والضغط عن بُعد",
      "استشارات تغذية ونفسية عند الحاجة",
    ],
    services: ["عيادة السكري", "عيادة الضغط والقلب", "عيادة الربو والصدرية", "التثقيف الصحي"],
    applyTo: "/book",
    applyLabel: "سجّل في برنامج المتابعة",
    secondary: { to: "/packages", label: "باقة السكري والقلب" },
  },
  {
    id: "second-opinion",
    title: "برنامج الرأي الطبي الثاني",
    tagline: "مراجعة ملفك الطبي من نخبة الاستشاريين قبل اتخاذ قرار العلاج.",
    Icon: ShieldPlus,
    audience: "المرضى المرشحون لعمليات جراحية أو خطط علاجية طويلة.",
    benefits: [
      "مراجعة كاملة للتقارير والصور والتحاليل",
      "رأي مكتوب موثّق خلال 72 ساعة",
      "خيارات علاجية بديلة عند وجودها",
      "خصوصية تامة وتشفير للملفات",
    ],
    services: ["تحميل تقارير وصور", "استشارة استشاري", "تقرير طبي مكتوب", "خطة علاج مقترحة"],
    applyTo: "/second-opinion",
    applyLabel: "قدّم طلب رأي ثاني",
    secondary: { to: "/faq", label: "كيف تعمل الخدمة؟" },
  },
  {
    id: "telemedicine",
    title: "برنامج الطب عن بُعد",
    tagline: "استشارة طبية بالفيديو مع استشاري مرخّص من داخل السعودية.",
    Icon: Video,
    audience: "المرضى الراغبون بالاستشارة من المنزل أو خارج مدينة صبيا.",
    benefits: [
      "مواعيد خلال 30 دقيقة",
      "وصفات طبية إلكترونية وتوصيل الدواء",
      "متابعة نتائج التحاليل عن بُعد",
      "أسعار ثابتة ومعتمدة تأمينيًا",
    ],
    services: ["استشارة عامة", "استشارة أطفال", "استشارة نفسية", "متابعة أمراض مزمنة"],
    applyTo: "/telemedicine",
    applyLabel: "ابدأ استشارة أونلاين",
    secondary: { to: "/specialties", label: "التخصصات المتاحة" },
  },
  {
    id: "international",
    title: "برنامج المرضى الدوليين",
    tagline: "خدمة شاملة تشمل التنسيق الطبي، الترجمة، والإقامة.",
    Icon: Plane,
    audience: "المرضى القادمون من خارج المملكة للعلاج أو الفحص.",
    benefits: [
      "منسّق طبي مخصص لكل مريض",
      "ترجمة طبية (عربي، إنجليزي، أردو)",
      "حجز الإقامة والمواصلات",
      "متابعة ما بعد العودة عن بُعد",
    ],
    services: ["تقييم عن بُعد قبل السفر", "التنسيق الطبي", "خدمات الترجمة", "المتابعة بعد العلاج"],
    applyTo: "/international-patients",
    applyLabel: "قدّم طلب مريض دولي",
    secondary: { to: "/contact", label: "تواصل مع المكتب الدولي" },
  },
];

export const Route = createFileRoute("/programs")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:locale", content: "ar_SA" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: PROGRAMS.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: p.title,
            url: `${PAGE_URL}#${p.id}`,
          })),
        }),
      },
    ],
  }),
  component: ProgramsPage,
});

function ProgramsPage() {
  return (
    <div>
      <PageHero
        eyebrow="برامج طبية متكاملة"
        title="برامجنا الطبية"
        subtitle="حزم رعاية متكاملة صمّمت لكل مرحلة عمرية وحالة صحية — قدّم طلبك أونلاين وابدأ رحلتك مع فريقنا."
      />

      {/* Quick nav */}
      <section className="container-app -mt-6 mb-10">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {PROGRAMS.map((p) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary"
              >
                <p.Icon className="h-3.5 w-3.5" />
                {p.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Programs */}
      <section className="container-app space-y-6 pb-16">
        {PROGRAMS.map((p, idx) => (
          <article
            key={p.id}
            id={p.id}
            className="scroll-mt-24 rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm"
          >
            <div className="grid gap-6 md:grid-cols-[auto,1fr] md:items-start">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <p.Icon className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span>برنامج {String(idx + 1).padStart(2, "0")}</span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> {p.audience}
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold leading-tight">{p.title}</h2>
                <p className="mt-2 text-muted-foreground leading-7">{p.tagline}</p>

                <div className="mt-6 grid gap-6 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">مميزات البرنامج</h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {p.benefits.map((b) => (
                        <li key={b} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-2">الخدمات المشمولة</h3>
                    <div className="flex flex-wrap gap-2">
                      {p.services.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-foreground/80"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    to={p.applyTo}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {p.applyLabel}
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                  {p.secondary && (
                    <Link
                      to={p.secondary.to}
                      className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                    >
                      {p.secondary.label}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* CTA */}
      <section className="container-app pb-16">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-accent p-8 md:p-10 text-primary-foreground text-center">
          <h2 className="text-2xl md:text-3xl font-bold">لم تجد البرنامج المناسب؟</h2>
          <p className="mt-2 text-primary-foreground/90 max-w-2xl mx-auto">
            فريقنا الطبي جاهز لتصميم خطة رعاية مخصصة لك أو لعائلتك. تواصل معنا وسنساعدك في اختيار الأنسب.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center rounded-lg bg-background text-foreground px-5 py-2.5 text-sm font-semibold hover:bg-background/90"
            >
              تواصل معنا
            </Link>
            <Link
              to="/book"
              className="inline-flex items-center rounded-lg border border-primary-foreground/40 px-5 py-2.5 text-sm font-semibold hover:bg-primary-foreground/10"
            >
              احجز موعدًا
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
