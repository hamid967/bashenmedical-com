import { createFileRoute } from "@tanstack/react-router";
import { Plane, Hotel, Languages, FileText, ShieldCheck, HeartPulse, MapPin } from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";
import { ServiceRequestForm } from "@/components/ServiceRequestForm";
import { whatsappUrl } from "@/lib/site";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/international-patients")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "المرضى الدوليون — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "خدمات متكاملة للمرضى الدوليين في مجمع باعشن: تأشيرة علاجية، حجز فندق، مترجم طبي، رأي طبي ثانٍ ومتابعة ما بعد العلاج.",
      },
      { property: "og:title", content: "International Patients — Baeshen Medical" },
      {
        property: "og:description",
        content: "End-to-end support for international patients in Jazan, Saudi Arabia.",
      },
      { property: "og:url", content: "https://bashenmedical.com/international-patients" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/international-patients" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "MedicalWebPage",
          "@id": "https://bashenmedical.com/international-patients",
          name: "International Patients — Baeshen Medical",
          description:
            "End-to-end support for international patients in Jazan: medical visa, hotel booking, translator, second opinion, and follow-up.",
          url: "https://bashenmedical.com/international-patients",
          inLanguage: ["ar-SA", "en"],
          isPartOf: { "@id": "https://bashenmedical.com/#website" },
          provider: { "@id": "https://bashenmedical.com/#organization" },
          audience: { "@type": "MedicalAudience", audienceType: "Patient" },
          availableLanguage: ["Arabic", "English"],
        }),
      },
    ],
  }),
  component: IntlPage,
});

const services = [
  "تأشيرة علاجية / خطاب دعم",
  "رأي طبي ثانٍ",
  "حجز فندق قريب",
  "مترجم طبي",
  "ملف طبي مُترجم",
  "متابعة عن بُعد بعد العلاج",
];

const steps = [
  { title: "أرسل استفسارك", desc: "املأ النموذج أو راسلنا على واتساب مع ملخّص الحالة." },
  { title: "خطة علاج مبدئية", desc: "يراجع فريقنا الطبي حالتك ويرسل خطة وميزانية خلال 48 ساعة." },
  {
    title: "التأشيرة والوصول",
    desc: "نُصدر خطاب الدعم ونساعد في حجز الفندق والاستقبال من المطار.",
  },
  { title: "العلاج والمتابعة", desc: "علاج بإشراف استشاريين + متابعة عن بُعد بعد عودتك." },
];

function IntlPage() {
  return (
    <>
      <PageHero
        eyebrow="International Patients · للمرضى الدوليين"
        title="نرحّب بالمرضى من خارج المملكة"
        subtitle="نُقدّم دعماً متكاملاً — من التأشيرة والإقامة إلى الترجمة الطبية ومتابعة ما بعد العلاج — بمعايير عالمية في قلب منطقة جازان."
      >
        <div className="flex flex-wrap gap-3">
          <a
            href="#request"
            className="rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground px-5 py-2.5 font-semibold shadow-sm"
          >
            ابدأ طلبك — Start your request
          </a>
          <a
            href={whatsappUrl(
              "Hello Baeshen Medical, I need help with international patient services. — مرحبًا، أحتاج مساعدة في خدمات المرضى الدوليين.",
            )}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md border border-primary text-primary px-5 py-2.5 font-semibold hover:bg-primary/5"
          >
            WhatsApp
          </a>
        </div>
      </PageHero>

      <section className="container-app py-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard
          icon={<Plane className="h-5 w-5" />}
          title="التأشيرة الطبية"
          desc="نقدم خطاباً معتمداً لدعم طلب التأشيرة العلاجية للمريض ومرافقيه."
        />
        <SectionCard
          icon={<Hotel className="h-5 w-5" />}
          title="الإقامة والفندق"
          desc="أسعار خاصة مع فنادق شريكة قريبة من المجمع، مع خدمة النقل."
        />
        <SectionCard
          icon={<Languages className="h-5 w-5" />}
          title="مترجم طبي"
          desc="عربية · إنجليزية · أوردو · سواحيلية · فرنسية — طوال فترة إقامتك."
        />
        <SectionCard
          icon={<FileText className="h-5 w-5" />}
          title="ملف طبي مُترجم"
          desc="جميع تقاريرك الطبية باللغة التي تختارها، معتمدة رسمياً."
        />
        <SectionCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="تنسيق التأمين الدولي"
          desc="نتعامل مع شبكات تأمين إقليمية ودولية — نساعدك في المطالبات."
        />
        <SectionCard
          icon={<HeartPulse className="h-5 w-5" />}
          title="رأي طبي ثانٍ"
          desc="مراجعة تقاريرك من قِبل استشاريينا قبل السفر — عن بُعد."
        />
      </section>

      <section className="container-app pb-4">
        <h2 className="text-2xl font-bold mb-4">كيف تعمل رحلتك معنا؟</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-bold mb-3">
                {i + 1}
              </div>
              <h3 className="font-bold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-6">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="request" className="container-app py-10 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h3 className="font-bold">لماذا جازان؟</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-7">
              منطقة جازان بوابة الجنوب: قريبة من الحدود اليمنية وشرق أفريقيا، بمطار دولي وشبكة فنادق
              حديثة، ومناخ جبلي معتدل في فيفاء وجبل الحشر يوفّر فرصة نقاهة مثالية بعد العلاج.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-bold mb-2">اللغات المتوفرة</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              {["العربية", "English", "اردو", "Kiswahili", "Français", "አማርኛ"].map((l) => (
                <span key={l} className="rounded-full bg-muted px-3 py-1 font-semibold">
                  {l}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="font-bold mb-2">مكتب المرضى الدوليين</h3>
            <ul className="text-sm space-y-1.5 text-muted-foreground">
              <li>
                البريد:{" "}
                <span dir="ltr" className="text-foreground">
                  intl@baeshen.med
                </span>
              </li>
              <li>
                واتساب:{" "}
                <span dir="ltr" className="text-foreground">
                  +966 55 508 8623
                </span>
              </li>
              <li>ساعات العمل: 8:00ص – 8:00م بتوقيت مكة المكرمة</li>
            </ul>
          </div>
        </div>

        <ServiceRequestForm
          tag="مرضى دوليون"
          refPrefix="INT"
          title="ابدأ طلبك — Start your request"
          subtitle="سنراجع طلبك ونعود إليك خلال 48 ساعة بخطة وميزانية مبدئية."
          services={services}
          extraLabel="ملخّص الحالة + البلد"
          extraPlaceholder="مثال: مريض من اليمن، عمر 45، يحتاج مراجعة استشاري قلب — أرفق ملخّصاً موجزاً."
          extraRequired
          dateLabel="تاريخ الوصول المتوقع"
          timeLabel="الوقت التقريبي"
          submitLabel="إرسال الطلب"
        />
      </section>
    </>
  );
}
