import { createFileRoute } from "@tanstack/react-router";
import { Siren, Phone, MapPin, AlertTriangle, HeartPulse, Ambulance } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { SITE } from "@/lib/site";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/emergency")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الطوارئ 24/7 — مجمع باعشن الطبي" },
      { name: "description", content: "أرقام الطوارئ والاتصال العاجل بمجمع باعشن الطبي في صبيا، مع إرشادات السلامة قبل وصول الإسعاف." },
      { property: "og:title", content: "الطوارئ 24/7 — مجمع باعشن الطبي" },
      { property: "og:description", content: "أرقام وإرشادات الطوارئ." },
      { property: "og:url", content: "https://bashenmedical.com/emergency" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/emergency" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": ["EmergencyService", "MedicalWebPage"],
          "@id": "https://bashenmedical.com/emergency",
          name: "الطوارئ 24/7 — مجمع باعشن الطبي",
          description:
            "خدمة الطوارئ الطبية على مدار الساعة بمجمع باعشن الطبي، صبيا، جازان.",
          url: "https://bashenmedical.com/emergency",
          inLanguage: "ar-SA",
          areaServed: [{ "@type": "City", name: "Sabya" }, { "@type": "AdministrativeArea", name: "Jazan Region" }],
          provider: { "@id": "https://bashenmedical.com/#organization" },
          hoursAvailable: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
            opens: "00:00",
            closes: "23:59",
          },
        }),
      },
    ],
  }),
  component: EmergencyPage,
});

function EmergencyPage() {
  return (
    <>
      <section className="bg-gradient-to-br from-destructive/15 to-destructive/5 border-b border-border">
        <div className="container-app py-14">
          <div className="inline-flex items-center gap-2 rounded-full bg-destructive/20 text-destructive px-3 py-1 text-xs font-bold">
            <Siren className="h-3.5 w-3.5" /> طوارئ
          </div>
          <h1 className="mt-3 text-3xl md:text-5xl font-black">للحالات الحرجة اتصل الآن</h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">إذا كنت أو أحد من حولك في حالة خطر، لا تتردد. اتصل بأقرب رقم أدناه أو توجّه مباشرة لأقرب طوارئ.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <a href="tel:997" className="rounded-2xl bg-destructive text-destructive-foreground p-5 shadow-lg hover:opacity-95">
              <div className="text-xs opacity-90 mb-1">الهلال الأحمر السعودي</div>
              <div className="text-4xl font-black tracking-wider">997</div>
              <div className="mt-2 text-xs">إسعاف — على مستوى المملكة</div>
            </a>
            <a href="tel:937" className="rounded-2xl bg-primary text-primary-foreground p-5 shadow-lg hover:opacity-95">
              <div className="text-xs opacity-90 mb-1">صحة — استشارة طبية</div>
              <div className="text-4xl font-black tracking-wider">937</div>
              <div className="mt-2 text-xs">24 ساعة — وزارة الصحة</div>
            </a>
            <a href={`tel:${SITE.mobile}`} className="rounded-2xl bg-background border-2 border-primary text-foreground p-5 hover:bg-muted">
              <div className="text-xs text-muted-foreground mb-1">مجمع باعشن الطبي</div>
              <div className="text-3xl font-black tracking-wide text-primary">{SITE.mobileDisplay}</div>
              <div className="mt-2 text-xs text-muted-foreground">جوال الطوارئ</div>
            </a>
          </div>
        </div>
      </section>

      <section className="container-app py-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold flex items-center gap-2"><HeartPulse className="h-5 w-5 text-destructive" /> متى تتوجه للطوارئ؟</h2>
          <ul className="mt-4 space-y-2 text-sm text-foreground/90">
            {[
              "ألم شديد في الصدر أو صعوبة في التنفس",
              "نزيف حاد لا يتوقف",
              "فقدان وعي أو تشوش شديد",
              "إصابة بحادث مروري أو سقوط قوي",
              "تسمم أو ابتلاع مادة سامة",
              "شلل مفاجئ أو صعوبة في الكلام (احتمال جلطة)",
              "حرارة مرتفعة عند رضيع أقل من 3 أشهر",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" /><span>{x}</span></li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold flex items-center gap-2"><Ambulance className="h-5 w-5 text-primary" /> إرشادات قبل وصول الإسعاف</h2>
          <ul className="mt-4 space-y-2 text-sm text-foreground/90 list-decimal ps-5">
            <li>ابقَ هادئاً، ولا تحرّك المصاب إلا للضرورة القصوى.</li>
            <li>افتح المجرى التنفسي واحرص أن يكون النفس منتظماً.</li>
            <li>اضغط مباشرة على مواضع النزيف بقطعة قماش نظيفة.</li>
            <li>لا تُعطِ المصاب طعاماً أو شراباً حتى وصول المسعف.</li>
            <li>سجّل وقت بداية الأعراض لإبلاغ فريق الطوارئ.</li>
          </ul>
          <div className="mt-6 flex items-start gap-2 text-sm">
            <MapPin className="h-4 w-4 mt-0.5 text-primary" />
            <a href={SITE.mapsUrl} target="_blank" rel="noreferrer" className="hover:text-primary">{SITE.addressAr}</a>
          </div>
          <a href={`tel:${SITE.phone}`} className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold">
            <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
          </a>
        </div>
      </section>
    </>
  );
}
