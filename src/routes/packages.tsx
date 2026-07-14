import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الباقات الطبية والفحوصات الشاملة — مجمع باعشن الطبي" },
      { name: "description", content: "باقات فحص شامل، ما قبل الزواج، ما قبل التوظيف، صحة القلب، والسكري بأسعار تنافسية." },
      { property: "og:title", content: "الباقات الطبية والفحوصات الشاملة" },
      { property: "og:description", content: "باقات فحص طبية شاملة بأسعار تنافسية." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/packages" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/packages" }],
  }),
  component: PackagesPage,
});

const packages = [
  {
    name: "فحص شامل — أساسي",
    price: "299",
    for: "للرجال والنساء أعلى من 18 سنة",
    highlight: false,
    items: ["كشف طبيب باطنية", "تحليل دم شامل CBC", "سكر صائم", "دهون كاملة", "وظائف كبد وكلى", "تحليل بول"],
  },
  {
    name: "فحص شامل — بلاتيني",
    price: "899",
    for: "فحص متقدم يشمل صور أشعة وقلب",
    highlight: true,
    items: ["كشف استشاري باطنية", "تحاليل الأساسي كاملة", "فيتامين D و B12", "هرمون الغدة الدرقية", "تخطيط قلب ECG", "أشعة صدر", "أشعة بطن", "تقرير طبي مفصّل"],
  },
  {
    name: "فحص ما قبل الزواج",
    price: "149",
    for: "شهادة معتمدة رسمياً",
    highlight: false,
    items: ["فصيلة الدم", "أنيميا الخلايا المنجلية", "الثلاسيميا", "التهاب الكبد B و C", "HIV"],
  },
  {
    name: "فحص ما قبل التوظيف",
    price: "199",
    for: "للشركات والأفراد",
    highlight: false,
    items: ["كشف طبيب", "تحاليل دم أساسية", "أشعة صدر", "فحص نظر وسمع مبدئي", "شهادة لياقة صحية"],
  },
  {
    name: "باقة صحة القلب",
    price: "649",
    for: "للأعمار فوق 40 سنة",
    highlight: false,
    items: ["كشف استشاري قلب", "تخطيط قلب ECG", "إيكو قلب", "دهون كاملة", "سكر تراكمي", "تقرير طبي"],
  },
  {
    name: "باقة السكري ومتابعته",
    price: "349",
    for: "لمرضى السكري وذويهم",
    highlight: false,
    items: ["كشف طبيب باطنية", "سكر صائم وفاطر", "سكر تراكمي HbA1c", "وظائف كلى", "بروتين في البول", "فحص قاع العين"],
  },
];

function PackagesPage() {
  return (
    <>
      <PageHero
        eyebrow="الباقات الطبية"
        title="فحوصات شاملة بأسعار تنافسية"
        subtitle="اختر الباقة المناسبة لك واستمتع بخصومات خاصة عند الحجز عبر الموقع. جميع الأسعار بالريال السعودي وشاملة الضريبة."
      />
      <section className="container-app py-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((p) => (
          <div
            key={p.name}
            className={`relative rounded-2xl border p-6 flex flex-col ${
              p.highlight
                ? "border-primary bg-gradient-to-br from-primary/5 to-accent/5 shadow-lg"
                : "border-border bg-card"
            }`}
          >
            {p.highlight && (
              <div className="absolute -top-3 start-6 rounded-full bg-primary text-primary-foreground text-[11px] px-3 py-1 font-semibold shadow">
                الأكثر طلباً
              </div>
            )}
            <h3 className="text-lg font-bold">{p.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{p.for}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-black text-primary">{p.price}</span>
              <span className="text-sm text-muted-foreground">ر.س</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm flex-1">
              {p.items.map((it) => (
                <li key={it} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/book"
              className={`mt-6 text-center rounded-md px-4 py-2.5 text-sm font-semibold ${
                p.highlight
                  ? "bg-gradient-to-r from-primary to-accent text-primary-foreground"
                  : "border border-primary text-primary hover:bg-primary/5"
              }`}
            >
              احجز الباقة
            </Link>
          </div>
        ))}
      </section>
      <section className="container-app pb-14">
        <div className="rounded-2xl border border-border bg-muted/40 p-6 flex items-start gap-4">
          <ShieldCheck className="h-8 w-8 text-primary shrink-0" />
          <div>
            <h4 className="font-bold">تغطيات التأمين مقبولة</h4>
            <p className="text-sm text-muted-foreground mt-1">
              نقبل معظم بطاقات التأمين المعتمدة. تفقّد قائمة شركات التأمين لدينا للتأكد من التغطية.
            </p>
            <Link to="/insurance" className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">
              شركات التأمين المعتمدة →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
