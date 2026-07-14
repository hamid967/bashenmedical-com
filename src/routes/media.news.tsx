import { createFileRoute } from "@tanstack/react-router";
import { Newspaper, Calendar } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/media/news")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الأخبار — مجمع باعشن الطبي" },
      { name: "description", content: "آخر أخبار وفعاليات مجمع باعشن الطبي: افتتاحات، شراكات، حملات توعية، وإنجازات طبية." },
      { property: "og:title", content: "المركز الإعلامي — أخبار باعشن" },
      { property: "og:description", content: "متابعة أخبار مجمع باعشن الطبي." },
      { property: "og:url", content: "https://bashenmedical.com/media/news" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/media/news" }],
  }),
  component: NewsPage,
});

const news = [
  { date: "2026-06-15", tag: "افتتاح", title: "إطلاق خدمة الاستشارات الطبية عن بُعد", excerpt: "أطلق المجمع خدمة استشارات الفيديو مع أطبائه الاستشاريين لتغطية أوسع لسكان المنطقة." },
  { date: "2026-05-20", tag: "توعية", title: "حملة الفحص المبكر لسرطان الثدي", excerpt: "بالتعاون مع جمعية زهرة، فحوصات مجانية طوال شهر أكتوبر." },
  { date: "2026-04-10", tag: "شراكة", title: "شراكة مع الهيئة السعودية للتخصصات الصحية", excerpt: "برنامج تدريبي جديد للأطباء المقيمين في تخصصات الأسرة والباطنية." },
  { date: "2026-03-01", tag: "إنجاز", title: "تجديد اعتماد CBAHI للسنة الثالثة", excerpt: "المجمع يجدد اعتماده كمنشأة صحية معتمدة وفق معايير الجودة السعودية." },
  { date: "2026-02-14", tag: "مبادرة", title: "أيام صحة القلب — فحوصات مجانية", excerpt: "فعالية توعوية استمرت 3 أيام بحضور أطباء استشاريين." },
];

function NewsPage() {
  return (
    <>
      <PageHero
        eyebrow="المركز الإعلامي"
        title="أحدث الأخبار والفعاليات"
        subtitle="تابع آخر مستجدات المجمع، فعاليات التوعية الصحية، والشراكات المهنية."
      />
      <section className="container-app py-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {news.map((n) => (
          <article key={n.title} className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg transition">
            <div className="aspect-[16/9] bg-gradient-to-br from-primary/15 to-accent/15 grid place-items-center">
              <Newspaper className="h-12 w-12 text-primary/40" />
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold">{n.tag}</span>
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {n.date}</span>
              </div>
              <h2 className="mt-2 text-base font-bold">{n.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-6">{n.excerpt}</p>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
