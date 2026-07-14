import { createFileRoute } from "@tanstack/react-router";
import { Smartphone, Bell, CalendarCheck2, FileText, Download, Apple } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "تطبيق مجمع باعشن للجوال — احجز وتابع صحتك" },
      {
        name: "description",
        content:
          "حمّل تطبيق مجمع باعشن الطبي لحجز المواعيد، عرض تقارير المختبر والوصفات، وتلقّي تذكيرات فورية عن مواعيدك.",
      },
      { property: "og:title", content: "تطبيق مجمع باعشن الطبي" },
      {
        property: "og:description",
        content: "احجز موعدك واتابع ملفك الطبي من جوالك.",
      },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/app" }],
  }),
  component: AppPage,
});

const FEATURES = [
  {
    icon: <CalendarCheck2 className="h-6 w-6" />,
    title: "حجز فوري",
    desc: "احجز موعدك مع أي استشاري في دقائق، مع تأكيد فوري ودمج تلقائي مع تقويم جوالك.",
  },
  {
    icon: <Bell className="h-6 w-6" />,
    title: "تذكيرات ذكية",
    desc: "تذكيرات قبل الموعد بيوم وقبل ساعة، مع دعم تنبيهات الأدوية والوصفات النشطة.",
  },
  {
    icon: <FileText className="h-6 w-6" />,
    title: "تقارير وملف كامل",
    desc: "اطّلع على تقارير المختبر والأشعة والوصفات والفواتير — كلها متاحة PDF جاهز للتنزيل.",
  },
  {
    icon: <Smartphone className="h-6 w-6" />,
    title: "استشارة عن بُعد",
    desc: "محادثة فيديو مع طبيبك دون الحاجة للحضور — من راحة منزلك.",
  },
];

function AppPage() {
  return (
    <>
      <PageHero
        eyebrow="تطبيق الجوال"
        title="مجمع باعشن — بين يديك"
        subtitle="التطبيق الرسمي يفتح لك بوابة المريض الكاملة: مواعيد، تقارير، وصفات، فواتير، وتذكيرات — كلها في مكان واحد."
      />

      <section className="container-app py-10 grid gap-8 lg:grid-cols-[1.2fr_1fr] items-start">
        <div>
          <h2 className="text-2xl font-bold mb-6">لماذا التطبيق؟</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition"
              >
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  {f.icon}
                </div>
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-6">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href="#"
              aria-label="تحميل من App Store"
              className="flex items-center gap-3 rounded-xl bg-foreground text-background p-4 hover:opacity-90 transition"
            >
              <Apple className="h-8 w-8" />
              <div className="text-right">
                <div className="text-[11px] opacity-80">قريبًا على</div>
                <div className="text-lg font-bold">App Store</div>
              </div>
            </a>
            <a
              href="#"
              aria-label="تحميل من Google Play"
              className="flex items-center gap-3 rounded-xl bg-foreground text-background p-4 hover:opacity-90 transition"
            >
              <Download className="h-8 w-8" />
              <div className="text-right">
                <div className="text-[11px] opacity-80">قريبًا على</div>
                <div className="text-lg font-bold">Google Play</div>
              </div>
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            التطبيق قيد الإطلاق — سجّل رقمك في صفحة{" "}
            <a href="/contact" className="text-primary font-semibold hover:underline">
              تواصل معنا
            </a>{" "}
            لإخبارك فور توفّره.
          </p>
        </div>

        <div className="rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-accent/5 to-background p-8 text-center">
          <div className="mx-auto grid h-40 w-40 place-items-center rounded-3xl bg-background shadow-xl">
            <Smartphone className="h-20 w-20 text-primary" />
          </div>
          <div className="mt-6 rounded-2xl border border-border bg-card p-5">
            <div className="text-sm text-muted-foreground mb-2">امسح للتنزيل</div>
            <div className="mx-auto h-36 w-36 rounded-lg bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%),linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%)] bg-[length:12px_12px] bg-[position:0_0,6px_6px] opacity-90" />
            <p className="mt-3 text-xs text-muted-foreground">رمز QR سيُفعَّل عند إطلاق التطبيق</p>
          </div>
        </div>
      </section>
    </>
  );
}
