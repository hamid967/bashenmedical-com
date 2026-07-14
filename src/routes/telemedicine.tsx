import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Video,
  Clock,
  ShieldCheck,
  Smartphone,
  MessageCircle,
  CheckCircle2,
  Stethoscope,
  Baby,
  Brain,
  HeartPulse,
  Sparkles,
} from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";
import { ServiceRequestForm } from "@/components/ServiceRequestForm";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/telemedicine")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الاستشارة الطبية عن بُعد — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "احجز استشارة طبية بالفيديو مع أطباء مجمع باعشن الطبي — تخصصات باطنية، أطفال، نفسية، جلدية وقلب — بوصفة إلكترونية وتوصيل دواء.",
      },
      { property: "og:title", content: "الاستشارة الطبية عن بُعد" },
      { property: "og:description", content: "استشر طبيبك أونلاين بالفيديو." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/telemedicine" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/telemedicine" }],
  }),
  component: TelemedicinePage,
});

const specialties = [
  { icon: <Stethoscope className="h-5 w-5" />, name: "طب باطني", from: 120 },
  { icon: <Baby className="h-5 w-5" />, name: "طب أطفال", from: 130 },
  { icon: <Brain className="h-5 w-5" />, name: "الصحة النفسية", from: 200 },
  { icon: <HeartPulse className="h-5 w-5" />, name: "أمراض القلب", from: 250 },
  { icon: <Sparkles className="h-5 w-5" />, name: "جلدية وتجميل", from: 180 },
  { icon: <Stethoscope className="h-5 w-5" />, name: "طب أسرة", from: 100 },
];

const faqs = [
  {
    q: "هل الاستشارة عن بُعد معتمدة رسمياً؟",
    a: "نعم، خدمة الاستشارات المرئية معتمدة من هيئة الصحة السعودية ووفق ضوابط نظام صحة الرقمية.",
  },
  {
    q: "هل الوصفة الإلكترونية تُصرف من أي صيدلية؟",
    a: "الوصفة مربوطة بمنصة وصفتي ويمكن صرفها من صيدلية باعشن أو أي صيدلية مرخّصة داخل المملكة.",
  },
  {
    q: "هل تغطي شركات التأمين الاستشارة عن بُعد؟",
    a: "معظم بطاقات التأمين المعتمدة لدينا تشمل الاستشارات المرئية — تحقق من صفحة شركات التأمين.",
  },
];

function TelemedicinePage() {
  return (
    <>
      <PageHero
        eyebrow="خدمة عن بُعد"
        title="طبيبك أونلاين — أينما كنت"
        subtitle="استشارة طبية بالفيديو مع أطبائنا الاستشاريين، مع وصفة إلكترونية وتوصيل الدواء عبر صيدلياتنا."
      >
        <div className="flex flex-wrap gap-3">
          <a
            href="#request"
            className="rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground px-5 py-2.5 font-semibold shadow-sm"
          >
            احجز استشارة الآن
          </a>
          <Link
            to="/doctors"
            className="rounded-md border border-primary text-primary px-5 py-2.5 font-semibold hover:bg-primary/5"
          >
            تصفح الأطباء
          </Link>
        </div>
      </PageHero>

      <section className="container-app py-10 grid gap-5 md:grid-cols-3">
        <SectionCard icon={<Video className="h-5 w-5" />} title="مكالمة فيديو HD" desc="مكالمة آمنة مشفّرة عبر تطبيق باعشن الطبي، بدون تنصيب أدوات إضافية." />
        <SectionCard icon={<Clock className="h-5 w-5" />} title="مواعيد مرنة" desc="فترات مسائية ونهاية الأسبوع لتناسب جدولك، مع توفر عاجل خلال 30 دقيقة." />
        <SectionCard icon={<ShieldCheck className="h-5 w-5" />} title="سرية تامة" desc="بياناتك الطبية محفوظة وفق أنظمة حماية المعلومات الصحية السعودية." />
        <SectionCard icon={<Smartphone className="h-5 w-5" />} title="وصفة إلكترونية" desc="نرسل وصفتك مباشرة إلى صيدلية باعشن لصرفها أو توصيلها." />
        <SectionCard icon={<MessageCircle className="h-5 w-5" />} title="متابعة بعد الجلسة" desc="تواصل نصي مجاني لمدة 48 ساعة بعد الاستشارة للأسئلة المتعلقة." />
        <SectionCard icon={<CheckCircle2 className="h-5 w-5" />} title="مناسبة لـ" desc="متابعة الأدوية، الاستفسارات، تفسير التحاليل، الأمراض المزمنة، والصحة النفسية." />
      </section>

      <section className="container-app pb-4">
        <h2 className="text-2xl font-bold mb-4">التخصصات المتاحة عن بُعد</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specialties.map((s) => (
            <div key={s.name} className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  تبدأ من <span className="font-semibold text-primary">{s.from}</span> ر.س
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="request" className="container-app py-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-8">
            <h2 className="text-2xl font-bold mb-4">كيف تعمل الخدمة؟</h2>
            <ol className="grid gap-4 sm:grid-cols-2">
              {[
                "احجز موعدك عبر الموقع أو التطبيق",
                "ادفع رسوم الاستشارة إلكترونياً",
                "انضم للمكالمة عبر الرابط في وقتها",
                "استلم الوصفة والتوصية بعد الجلسة",
              ].map((s, i) => (
                <li key={s} className="rounded-xl bg-background p-4 border border-border">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-bold mb-2">
                    {i + 1}
                  </div>
                  <p className="text-sm">{s}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-bold mb-3">أسئلة شائعة</h3>
            <div className="space-y-3">
              {faqs.map((f) => (
                <details key={f.q} className="group rounded-lg border border-border p-3">
                  <summary className="cursor-pointer font-semibold text-sm marker:text-primary">
                    {f.q}
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground leading-6">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>

        <ServiceRequestForm
          tag="استشارة عن بُعد"
          refPrefix="TEL"
          title="احجز استشارتك المرئية"
          subtitle="سنرسل لك رابط الاجتماع قبل الموعد بـ15 دقيقة على جوالك."
          services={specialties.map((s) => s.name)}
          extraLabel="ملخّص الشكوى (اختياري)"
          extraPlaceholder="مثال: أعاني من صداع مستمر منذ أسبوعين ودوخة عند الوقوف."
          submitLabel="احجز الاستشارة"
        />
      </section>
    </>
  );
}
