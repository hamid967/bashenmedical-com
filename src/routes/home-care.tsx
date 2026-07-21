import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeIcon, Syringe, Stethoscope, Activity, Baby, Pill, MapPin, Clock, Check } from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";
import { HomeCareRequestForm } from "@/components/HomeCareRequestForm";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/home-care")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الرعاية المنزلية — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "خدمات طبية منزلية: زيارة طبيب، تمريض، سحب عينات، علاج طبيعي وتوصيل أدوية في محافظة صبيا وجازان — احجز زيارة اليوم.",
      },
      { property: "og:title", content: "الرعاية المنزلية — مجمع باعشن الطبي" },
      { property: "og:description", content: "رعاية طبية متكاملة بمنزلك." },
      { property: "og:url", content: "https://bashenmedical.com/home-care" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/home-care" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": ["MedicalWebPage", "MedicalBusiness"],
          "@id": "https://bashenmedical.com/home-care",
          name: "الرعاية المنزلية — مجمع باعشن الطبي",
          description:
            "خدمات طبية منزلية: زيارة طبيب، تمريض، سحب عينات، علاج طبيعي وتوصيل أدوية في صبيا وجازان.",
          url: "https://bashenmedical.com/home-care",
          inLanguage: "ar-SA",
          isPartOf: { "@id": "https://bashenmedical.com/#website" },
          provider: { "@id": "https://bashenmedical.com/#organization" },
          areaServed: [{ "@type": "City", name: "Sabya" }, { "@type": "AdministrativeArea", name: "Jazan Region" }],
          medicalSpecialty: ["GeneralPractice", "Nursing", "Physiotherapy"],
          audience: { "@type": "MedicalAudience", audienceType: "Patient" },
        }),
      },
    ],
  }),
  component: HomeCarePage,
});

const services = [
  "زيارة طبيب بالمنزل",
  "خدمات تمريض",
  "سحب عينات مختبر",
  "علاج طبيعي منزلي",
  "رعاية أطفال وتطعيمات",
  "توصيل أدوية",
];

const coverageAreas = [
  "صبيا",
  "أبو عريش",
  "صامطة",
  "بيش",
  "الحقو",
  "الدرب",
  "جازان (المدينة)",
  "الطوال",
];

const pricing = [
  { name: "زيارة تمريض قصيرة", price: "150", desc: "حتى 30 دقيقة — جرعة أو ضمّادة." },
  { name: "زيارة طبيب عام", price: "349", desc: "كشف وتشخيص مبدئي وصرف وصفة." },
  { name: "باقة رعاية شهرية", price: "1,499", desc: "زيارتان أسبوعيًا لكبار السن ومرضى المزمنة." },
];

function HomeCarePage() {
  return (
    <>
      <PageHero
        eyebrow="خدمة منزلية"
        title="رعاية طبية متكاملة بمنزلك"
        subtitle="لكبار السن ومرضى الأمراض المزمنة ومن يصعب عليهم الوصول للمجمع — فريقنا المؤهّل يزورك خلال ساعات."
      >
        <div className="flex flex-wrap gap-3">
          <a
            href="#request"
            className="rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground px-5 py-2.5 font-semibold shadow-sm"
          >
            اطلب زيارة الآن
          </a>
          <Link
            to="/contact"
            className="rounded-md border border-primary text-primary px-5 py-2.5 font-semibold hover:bg-primary/5"
          >
            تواصل مع القسم
          </Link>
        </div>
      </PageHero>

      <section className="container-app py-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard icon={<Stethoscope className="h-5 w-5" />} title="زيارة طبيب بالمنزل" desc="كشف وتشخيص من طبيب مؤهل في منزلك." />
        <SectionCard icon={<HomeIcon className="h-5 w-5" />} title="خدمات تمريض" desc="جرعات، ضمادات، رعاية جروح وقسطرة، متابعة يومية." />
        <SectionCard icon={<Syringe className="h-5 w-5" />} title="سحب عينات مختبر" desc="سحب عينة من المنزل وتوصيل النتائج إلكترونياً." />
        <SectionCard icon={<Activity className="h-5 w-5" />} title="علاج طبيعي" desc="جلسات إعادة تأهيل ما بعد الجراحة أو الإصابات." />
        <SectionCard icon={<Baby className="h-5 w-5" />} title="رعاية الأطفال" desc="تطعيمات ومتابعة نمو الرضّع في بيئة مألوفة." />
        <SectionCard icon={<Pill className="h-5 w-5" />} title="توصيل الأدوية" desc="من صيدلية باعشن بضمان سلسلة التبريد للأدوية الحسّاسة." />
      </section>

      <section className="container-app pb-4">
        <h2 className="text-2xl font-bold mb-4">باقات وأسعار مبدئية</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {pricing.map((p) => (
            <div key={p.name} className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-bold">{p.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black text-primary">{p.price}</span>
                <span className="text-sm text-muted-foreground">ر.س</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          * الأسعار تقديرية وتشمل الانتقال داخل نطاق التغطية، وقد تختلف حسب نوع الخدمة والمسافة.
        </p>
      </section>

      <section id="request" className="container-app py-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-5 w-5 text-primary" />
              <h3 className="font-bold">نطاق التغطية</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {coverageAreas.map((c) => (
                <span key={c} className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-3 py-1">
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              خارج هذه المناطق؟ تواصل معنا وسنبذل ما بوسعنا لتوفير الخدمة.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-bold">مواعيد العمل</h3>
            </div>
            <ul className="text-sm space-y-1">
              <li className="flex justify-between border-b border-border/50 pb-1">
                <span>السبت – الخميس</span>
                <span className="font-semibold">8:00ص – 10:00م</span>
              </li>
              <li className="flex justify-between border-b border-border/50 pb-1">
                <span>الجمعة</span>
                <span className="font-semibold">2:00م – 10:00م</span>
              </li>
              <li className="flex justify-between text-primary">
                <span>حالات عاجلة</span>
                <span className="font-semibold">24/7</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-6">
            <h3 className="font-bold mb-2">لماذا رعاية باعشن المنزلية؟</h3>
            <ul className="text-sm space-y-1.5">
              {[
                "فريق مرخّص من هيئة التخصصات الصحية",
                "أجهزة طبية معتمدة ومعقّمة",
                "تقارير طبية إلكترونية بعد كل زيارة",
                "متابعة عبر التطبيق ورسائل SMS",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <HomeCareRequestForm services={services} />

      </section>
    </>
  );
}
