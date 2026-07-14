import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Calendar, Clock, ArrowLeft, BookOpen, Search } from "lucide-react";
import { bmcOgImageMeta } from "@/lib/og-meta";

const SITE_URL = "https://bashenmedical.com";

type Category = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
};

type ArticleListItem = {
  id: string;
  slug: string;
  title_ar: string;
  excerpt_ar: string;
  cover_image_url: string | null;
  reading_minutes: number;
  season: string | null;
  published_at: string | null;
  category_id: string | null;
  health_categories: { slug: string; name_ar: string } | null;
};

const listQuery = () => ({
  queryKey: ["health-index"],
  queryFn: async (): Promise<{ articles: ArticleListItem[]; categories: Category[] }> => {
    const [ar, cr] = await Promise.all([
      supabase
        .from("health_articles")
        .select(
          "id, slug, title_ar, excerpt_ar, cover_image_url, reading_minutes, season, published_at, category_id, health_categories(slug, name_ar)",
        )
        .eq("is_published", true)
        .order("published_at", { ascending: false }),
      supabase
        .from("health_categories")
        .select("id, slug, name_ar, name_en, description_ar")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    if (ar.error) throw ar.error;
    if (cr.error) throw cr.error;
    return {
      articles: (ar.data ?? []) as unknown as ArticleListItem[],
      categories: (cr.data ?? []) as Category[],
    };
  },
});

export const Route = createFileRoute("/health/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(listQuery()),
  head: () => {
    const url = `${SITE_URL}/health`;
    const title = "المدونة الصحية — نصائح ومقالات موسمية | مجمع باعشن الطبي";
    const desc =
      "مقالات صحية موسمية بأقلام أطباء مجمع باعشن الطبي بصبيا، جازان: الوقاية، التغذية، صحة الطفل والأمراض الموسمية.";
    const blogLd = {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "المدونة الصحية — مجمع باعشن الطبي",
      url,
      inLanguage: "ar",
      publisher: {
        "@type": "MedicalOrganization",
        name: "مجمع باعشن الطبي",
        url: SITE_URL,
      },
    };
    return {
      meta: [
      ...bmcOgImageMeta(),
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:locale", content: "ar_SA" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: JSON.stringify(blogLd) }],
    };
  },
  component: HealthIndex,
});

const SEASON_AR: Record<string, string> = {
  spring: "الربيع",
  summer: "الصيف",
  autumn: "الخريف",
  winter: "الشتاء",
  all: "كل المواسم",
};

function HealthIndex() {
  const { lang } = useI18n();
  const { data } = useSuspenseQuery(listQuery());
  const { articles, categories } = data;

  return (
    <div>
      <section className="hero-gradient-deep text-white py-14">
        <div className="container-app">
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8" />
            <h1 className="text-3xl md:text-4xl font-extrabold">
              {lang === "ar" ? "المدونة الصحية" : "Health Blog"}
            </h1>
          </div>
          <p className="mt-4 text-white/90 max-w-2xl leading-8">
            {lang === "ar"
              ? "نصائح ومقالات موسمية موثوقة بأقلام أطباء مجمع باعشن الطبي في صبيا، جازان."
              : "Trusted seasonal health articles by physicians at Baeshen Medical Complex."}
          </p>
          <Link
            to="/health/search"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/95 text-foreground px-4 py-3 text-sm font-semibold shadow-sm hover:bg-white transition"
          >
            <Search className="h-4 w-4" />
            {lang === "ar" ? "ابحث في المقالات..." : "Search articles..."}
          </Link>
        </div>
      </section>

      <section className="py-10">
        <div className="container-app">
          <h2 className="text-lg font-bold mb-4">
            {lang === "ar" ? "التصنيفات" : "Categories"}
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const count = articles.filter((a) => a.category_id === c.id).length;
              return (
                <a
                  key={c.id}
                  href={`#cat-${c.slug}`}
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary transition"
                >
                  {lang === "ar" ? c.name_ar : c.name_en || c.name_ar}
                  <span className="ms-2 text-xs text-muted-foreground">({count})</span>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {categories.map((c) => {
        const items = articles.filter((a) => a.category_id === c.id);
        if (items.length === 0) return null;
        return (
          <section key={c.id} id={`cat-${c.slug}`} className="py-10 border-t border-border">
            <div className="container-app">
              <div className="mb-6">
                <h2 className="text-2xl font-bold">
                  {lang === "ar" ? c.name_ar : c.name_en || c.name_ar}
                </h2>
                {c.description_ar && (
                  <p className="mt-1 text-sm text-muted-foreground">{c.description_ar}</p>
                )}
              </div>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {items.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {articles.length === 0 && (
        <div className="container-app py-20 text-center text-muted-foreground">
          لا توجد مقالات منشورة بعد. عد قريباً.
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article }: { article: ArticleListItem }) {
  const seasonLabel = article.season ? SEASON_AR[article.season] : null;
  return (
    <Link
      to="/health/$slug"
      params={{ slug: article.slug }}
      className="group rounded-2xl border border-border bg-card overflow-hidden hover:border-primary hover:shadow-lg transition"
    >
      <div className="aspect-video bg-primary/10 grid place-items-center overflow-hidden">
        {article.cover_image_url ? (
          <img
            src={article.cover_image_url}
            alt={article.title_ar}
            className="w-full h-full object-cover group-hover:scale-105 transition"
            loading="lazy"
          />
        ) : (
          <BookOpen className="h-12 w-12 text-primary/50" />
        )}
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-2">
          {seasonLabel && (
            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
              {seasonLabel}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {article.reading_minutes} د
          </span>
          {article.published_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(article.published_at).toLocaleDateString("ar-SA")}
            </span>
          )}
        </div>
        <h3 className="font-bold text-lg leading-7 group-hover:text-primary transition">
          {article.title_ar}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-3 leading-6">
          {article.excerpt_ar}
        </p>
        <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          اقرأ المقال <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </div>
      </div>
    </Link>
  );
}
