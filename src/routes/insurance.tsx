import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, PhoneCall, Search, Info } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/insurance")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "شركات التأمين المعتمدة — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "قائمة شركات التأمين الصحي المعتمدة لدى مجمع باعشن الطبي في صبيا، جازان — تحقّق من شركتك ومستوى التغطية قبل الحجز.",
      },
      { property: "og:title", content: "شركات التأمين المعتمدة" },
      { property: "og:description", content: "اطّلع على شركات التأمين الصحي المعتمدة." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/insurance" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/insurance" }],
  }),
  component: InsurancePage,
});

type Coverage = "شامل" | "أساسي" | "محدود";

const insurers: { name: string; coverage: Coverage; notes?: string }[] = [
  { name: "بوبا العربية", coverage: "شامل" },
  { name: "التعاونية للتأمين", coverage: "شامل" },
  { name: "ملاذ للتأمين", coverage: "شامل" },
  { name: "المتحدة للتأمين التعاوني", coverage: "شامل" },
  { name: "الدرع العربي", coverage: "شامل" },
  { name: "ولاء للتأمين", coverage: "أساسي" },
  { name: "MedGulf", coverage: "شامل" },
  { name: "Tawuniya", coverage: "شامل" },
  { name: "الراجحي تكافل", coverage: "أساسي" },
  { name: "الاتحاد التجاري", coverage: "أساسي" },
  { name: "أليانز إس إف", coverage: "شامل" },
  { name: "التأمين الأهلي", coverage: "شامل" },
  { name: "سلامة للتأمين", coverage: "محدود", notes: "الطوارئ فقط" },
  { name: "ساب تكافل", coverage: "أساسي" },
];

const coverageStyles: Record<Coverage, string> = {
  شامل: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  أساسي: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  محدود: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

function InsurancePage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Coverage>("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return insurers.filter((i) => {
      if (filter !== "all" && i.coverage !== filter) return false;
      if (!query) return true;
      return i.name.toLowerCase().includes(query);
    });
  }, [q, filter]);

  return (
    <>
      <PageHero
        eyebrow="التأمين الصحي"
        title="شركات التأمين المعتمدة لدينا"
        subtitle="نقبل معظم بطاقات التأمين الصحي في المملكة. ابحث عن شركتك أدناه أو تواصل معنا للتأكد من التغطية."
      />

      <section className="container-app py-8">
        <div className="rounded-2xl border border-border bg-card p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث عن شركة تأمين…"
              aria-label="بحث عن شركة تأمين"
              className="w-full ps-9 pe-3 py-2.5 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="flex gap-2 text-xs">
            {(["all", "شامل", "أساسي", "محدود"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 font-semibold transition ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {f === "all" ? "الكل" : f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((i) => (
            <div
              key={i.name}
              className="rounded-xl border border-border bg-card p-5 flex flex-col gap-2 hover:border-primary/40 hover:shadow-sm transition"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold truncate">{i.name}</div>
                  <span
                    className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${coverageStyles[i.coverage]}`}
                  >
                    تغطية {i.coverage}
                  </span>
                </div>
              </div>
              {i.notes && <p className="text-[11px] text-muted-foreground">{i.notes}</p>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              لا توجد شركات تطابق بحثك.
            </div>
          )}
        </div>
      </section>

      <section className="container-app pb-8">
        <div className="rounded-2xl border border-border bg-muted/40 p-6">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold mb-2">ملاحظات مهمّة حول التغطية</h3>
              <ul className="text-sm space-y-1.5 text-muted-foreground">
                <li>
                  <span className="font-semibold text-foreground">تغطية شامل:</span> تشمل الكشف، التحاليل، الأشعة، الأدوية، والعمليات الاختيارية حسب حدود الوثيقة.
                </li>
                <li>
                  <span className="font-semibold text-foreground">تغطية أساسي:</span> الكشف والحالات الطارئة فقط — بعض الخدمات تحتاج موافقة مسبقة.
                </li>
                <li>
                  <span className="font-semibold text-foreground">تغطية محدود:</span> الطوارئ فقط أو باقة محدّدة — يرجى التأكد قبل الحجز.
                </li>
                <li>يُشترط إحضار بطاقة التأمين وبطاقة الهوية عند كل زيارة.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="container-app pb-14">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-6 md:p-8 flex flex-col md:flex-row items-start gap-4 justify-between">
          <div>
            <h3 className="text-xl font-bold">لم تجد شركة التأمين لديك؟</h3>
            <p className="text-sm text-muted-foreground mt-1">
              تواصل مع قسم التأمين لدينا للتأكد من قبول بطاقتك ومعرفة التغطية الفعلية قبل الحجز.
            </p>
          </div>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 font-semibold shadow-sm"
          >
            <PhoneCall className="h-4 w-4" /> تواصل مع قسم التأمين
          </Link>
        </div>
      </section>
    </>
  );
}
