import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Calendar, Clock, ArrowLeft, BookOpen, Search, X } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { bmcOgImageMeta } from "@/lib/og-meta";

const SITE_URL = "https://happy-hugger-fluff.lovable.app";

const searchSchema = z.object({
  q: z.string().optional().default(""),
  cat: z.string().optional().default(""),
  season: z.string().optional().default(""),
});

type Category = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
};

type ArticleItem = {
  id: string;
  slug: string;
  title_ar: string;
  excerpt_ar: string;
  cover_image_url: string | null;
  reading_minutes: number;
  season: string | null;
  published_at: string | null;
  category_id: string | null;
  keywords: string[] | null;
  health_categories: { slug: string; name_ar: string } | null;
};

const dataQuery = () => ({
  queryKey: ["health-search-data"],
  queryFn: async (): Promise<{ articles: ArticleItem[]; categories: Category[] }> => {
    const [ar, cr] = await Promise.all([
      supabase
        .from("health_articles")
        .select(
          "id, slug, title_ar, excerpt_ar, cover_image_url, reading_minutes, season, published_at, category_id, keywords, health_categories(slug, name_ar)",
        )
        .eq("is_published", true)
        .order("published_at", { ascending: false }),
      supabase
        .from("health_categories")
        .select("id, slug, name_ar, name_en")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    if (ar.error) throw ar.error;
    if (cr.error) throw cr.error;
    return {
      articles: (ar.data ?? []) as unknown as ArticleItem[],
      categories: (cr.data ?? []) as Category[],
    };
  },
});

export const Route = createFileRoute("/health/search")({
  validateSearch: searchSchema,
  loader: ({ context }) => context.queryClient.ensureQueryData(dataQuery()),
  head: () => {
    const url = `${SITE_URL}/health/search`;
    const title = "بحث في المدونة الصحية | مجمع باعشن الطبي";
    const desc =
      "ابحث في مقالات المدونة الصحية بمجمع باعشن الطبي بصبيا، جازان. صفِّ المقالات حسب التصنيف والموسم والكلمات المفتاحية.";
    return {
      meta: [
      ...bmcOgImageMeta(),
        { title },
        { name: "description", content: desc },
        { name: "robots", content: "noindex, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:locale", content: "ar_SA" },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/health` }],
    };
  },
  component: HealthSearch,
  errorComponent: ({ error }) => (
    <div className="container-app py-20 text-center text-destructive" role="alert">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-20 text-center text-muted-foreground">
      لا توجد نتائج.
    </div>
  ),
});

const SEASON_AR: Record<string, string> = {
  spring: "الربيع",
  summer: "الصيف",
  autumn: "الخريف",
  winter: "الشتاء",
  all: "كل المواسم",
};

const SEASONS = ["spring", "summer", "autumn", "winter", "all"] as const;

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

function HealthSearch() {
  const { lang } = useI18n();
  const navigate = useNavigate({ from: "/health/search" });
  const { q, cat, season } = Route.useSearch();
  const { data } = useSuspenseQuery(dataQuery());
  const { articles, categories } = data;

  const [qLocal, setQLocal] = useState(q);
  useEffect(() => {
    setQLocal(q);
  }, [q]);

  // Debounce q writes to URL
  useEffect(() => {
    const id = setTimeout(() => {
      if (qLocal !== q) {
        navigate({
          search: (prev: { q?: string; cat?: string; season?: string }) => ({ ...prev, q: qLocal || undefined }),
          replace: true,
        });
      }
    }, 300);
    return () => clearTimeout(id);
  }, [qLocal, q, navigate]);

  const results = useMemo(() => {
    const nq = normalize(qLocal);
    return articles.filter((a) => {
      if (cat && a.health_categories?.slug !== cat) return false;
      if (season && a.season !== season) return false;
      if (!nq) return true;
      const hay = normalize(
        [a.title_ar, a.excerpt_ar, (a.keywords ?? []).join(" "), a.health_categories?.name_ar ?? ""].join(" "),
      );
      return hay.includes(nq);
    });
  }, [articles, qLocal, cat, season]);

  const activeCatName = categories.find((c) => c.slug === cat);
  const hasFilters = Boolean(qLocal || cat || season);

  const resetAll = () => {
    setQLocal("");
    navigate({ search: {}, replace: true });
  };

  const setCat = (slug: string) =>
    navigate({ search: (prev: { q?: string; cat?: string; season?: string }) => ({ ...prev, cat: slug || undefined }), replace: true });
  const setSeason = (s: string) =>
    navigate({ search: (prev: { q?: string; cat?: string; season?: string }) => ({ ...prev, season: s || undefined }), replace: true });

  return (
    <div>
      <section className="hero-gradient-deep text-white py-12">
        <div className="container-app">
          <nav className="text-white/80 text-sm mb-3" aria-label="breadcrumb">
            <Link to="/" className="hover:underline">الرئيسية</Link>
            <span className="mx-2">/</span>
            <Link to="/health" className="hover:underline">المدونة الصحية</Link>
            <span className="mx-2">/</span>
            <span>البحث</span>
          </nav>
          <div className="flex items-center gap-3">
            <Search className="h-7 w-7" />
            <h1 className="text-3xl md:text-4xl font-extrabold">
              {lang === "ar" ? "بحث في المدونة الصحية" : "Search the Health Blog"}
            </h1>
          </div>
          <p className="mt-3 text-white/90 max-w-2xl leading-8">
            {lang === "ar"
              ? "ابحث بالكلمات المفتاحية وصفِّ حسب التصنيف أو الموسم."
              : "Search by keyword and filter by category or season."}
          </p>

          <div className="mt-6 relative max-w-2xl">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-5 w-5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value.slice(0, 100))}
              placeholder={lang === "ar" ? "ابحث عن مقال، عرض، مرض موسمي..." : "Search articles, symptoms, seasons..."}
              className="w-full ps-11 pe-11 py-3 rounded-xl border border-border bg-card text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="search articles"
              maxLength={100}
            />
            {qLocal && (
              <button
                type="button"
                onClick={() => setQLocal("")}
                className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground"
                aria-label="clear search"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="py-6 border-b border-border bg-muted/30">
        <div className="container-app space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              {lang === "ar" ? "التصنيف" : "Category"}
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={!cat} onClick={() => setCat("")}>
                {lang === "ar" ? "الكل" : "All"}
              </FilterChip>
              {categories.map((c) => (
                <FilterChip key={c.id} active={cat === c.slug} onClick={() => setCat(c.slug)}>
                  {lang === "ar" ? c.name_ar : c.name_en || c.name_ar}
                </FilterChip>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              {lang === "ar" ? "الموسم" : "Season"}
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={!season} onClick={() => setSeason("")}>
                {lang === "ar" ? "الكل" : "All"}
              </FilterChip>
              {SEASONS.map((s) => (
                <FilterChip key={s} active={season === s} onClick={() => setSeason(s)}>
                  {SEASON_AR[s]}
                </FilterChip>
              ))}
            </div>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <X className="h-4 w-4" /> {lang === "ar" ? "إعادة ضبط الفلاتر" : "Reset filters"}
            </button>
          )}
        </div>
      </section>

      <section className="py-10">
        <div className="container-app">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? `${results.length} نتيجة${activeCatName ? ` في «${activeCatName.name_ar}»` : ""}`
                : `${results.length} result(s)`}
            </p>
            <Link to="/health" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              {lang === "ar" ? "تصفح كل المقالات" : "Browse all articles"}
            </Link>
          </div>

          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">
                {lang === "ar"
                  ? "لم نجد مقالات مطابقة. جرّب كلمات أخرى أو تصفح كل التصنيفات."
                  : "No matching articles. Try different keywords or browse categories."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  to="/health"
                  className="rounded-full border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary"
                >
                  {lang === "ar" ? "المدونة الصحية" : "Health Blog"}
                </Link>
                <Link
                  to="/specialties"
                  className="rounded-full border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary"
                >
                  {lang === "ar" ? "التخصصات" : "Specialties"}
                </Link>
                <Link
                  to="/book"
                  className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90"
                >
                  {lang === "ar" ? "احجز موعداً" : "Book an appointment"}
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {results.map((a) => (
                <ArticleCard key={a.id} article={a} highlight={qLocal} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border hover:border-primary hover:text-primary")
      }
    >
      {children}
    </button>
  );
}

function ArticleCard({ article, highlight }: { article: ArticleItem; highlight: string }) {
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
          {article.health_categories?.name_ar && (
            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
              {article.health_categories.name_ar}
            </span>
          )}
          {seasonLabel && <span>{seasonLabel}</span>}
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
          <Highlight text={article.title_ar} term={highlight} />
        </h3>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-3 leading-6">
          <Highlight text={article.excerpt_ar} term={highlight} />
        </p>
        <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          اقرأ المقال <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </div>
      </div>
    </Link>
  );
}

function Highlight({ text, term }: { text: string; term: string }) {
  const t = term.trim();
  if (!t) return <>{text}</>;
  try {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(re);
    return (
      <>
        {parts.map((p, i) =>
          re.test(p) ? (
            <mark key={i} className="bg-primary/20 text-inherit rounded px-0.5">
              {p}
            </mark>
          ) : (
            <span key={i}>{p}</span>
          ),
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}
