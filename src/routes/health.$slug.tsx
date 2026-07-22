import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Clock, ArrowLeft, MapPin, Phone } from "lucide-react";
import { SITE } from "@/lib/site";

const SITE_URL = "https://bashenmedical.com";

type Article = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  excerpt_ar: string;
  content_ar: string;
  cover_image_url: string | null;
  keywords: string[];
  season: string | null;
  reading_minutes: number;
  author_name: string | null;
  published_at: string | null;
  updated_at: string;
  category_id: string | null;
  health_categories: { slug: string; name_ar: string; name_en: string | null } | null;
};

type RelatedItem = {
  id: string;
  slug: string;
  title_ar: string;
  excerpt_ar: string;
  reading_minutes: number;
};

const articleQuery = (slug: string) => ({
  queryKey: ["health-article", slug],
  queryFn: async (): Promise<{ article: Article; related: RelatedItem[] }> => {
    const { data, error } = await supabase
      .from("health_articles")
      .select(
        "id, slug, title_ar, title_en, excerpt_ar, content_ar, cover_image_url, keywords, season, reading_minutes, author_name, published_at, updated_at, category_id, health_categories(slug, name_ar, name_en)",
      )
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    const article = data as unknown as Article;

    let related: RelatedItem[] = [];
    if (article.category_id) {
      const { data: rel } = await supabase
        .from("health_articles")
        .select("id, slug, title_ar, excerpt_ar, reading_minutes")
        .eq("is_published", true)
        .eq("category_id", article.category_id)
        .neq("id", article.id)
        .order("published_at", { ascending: false })
        .limit(3);
      related = (rel ?? []) as RelatedItem[];
    }
    return { article, related };
  },
});

export const Route = createFileRoute("/health/$slug")({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(articleQuery(params.slug)),
  head: ({ params, loaderData }) => {
    const data = loaderData as { article: Article; related: RelatedItem[] } | undefined;
    if (!data) {
      return {
        meta: [{ title: "المقال غير موجود" }, { name: "robots", content: "noindex" }],
      };
    }
    const { article } = data;
    const url = `${SITE_URL}/health/${params.slug}`;
    const title = `${article.title_ar} | المدونة الصحية — مجمع باعشن الطبي`;
    const desc = article.excerpt_ar.slice(0, 160);

    const articleLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title_ar,
      description: article.excerpt_ar,
      image: article.cover_image_url || undefined,
      datePublished: article.published_at ?? undefined,
      dateModified: article.updated_at,
      inLanguage: "ar",
      keywords: article.keywords.join(", "),
      author: {
        "@type": "Organization",
        name: article.author_name || "مجمع باعشن الطبي",
      },
      publisher: {
        "@type": "MedicalOrganization",
        name: "مجمع باعشن الطبي",
        url: SITE_URL,
      },
      mainEntityOfPage: url,
    };

    const breadcrumbs = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "المدونة الصحية", item: `${SITE_URL}/health` },
        { "@type": "ListItem", position: 3, name: article.title_ar, item: url },
      ],
    };

    const meta = [
      { title },
      { name: "description", content: desc },
      { name: "keywords", content: article.keywords.join(", ") },
      { property: "og:title", content: article.title_ar },
      { property: "og:description", content: desc },
      { property: "og:type", content: "article" },
      { property: "og:url", content: url },
      { property: "og:locale", content: "ar_SA" },
      { property: "article:published_time", content: article.published_at ?? "" },
      { property: "article:modified_time", content: article.updated_at },
      {
        name: "twitter:card",
        content: article.cover_image_url ? "summary_large_image" : "summary",
      },
      { name: "twitter:title", content: article.title_ar },
      { name: "twitter:description", content: desc },
    ];
    if (article.cover_image_url) {
      meta.push(
        { property: "og:image", content: article.cover_image_url },
        { name: "twitter:image", content: article.cover_image_url },
      );
    }

    return {
      meta,
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(articleLd) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbs) },
      ],
    };
  },
  notFoundComponent: ArticleNotFound,
  errorComponent: ArticleError,
  component: ArticleDetail,
});

function ArticleNotFound() {
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-3xl font-bold">المقال غير موجود</h1>
      <Link to="/health" className="mt-4 inline-block text-primary hover:underline">
        العودة إلى المدونة الصحية
      </Link>
    </div>
  );
}

function ArticleError({ reset }: { reset: () => void }) {
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-3xl font-bold">حدث خطأ</h1>
      <button
        onClick={reset}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

// Minimal, safe markdown -> HTML for our controlled content.
function renderMarkdown(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  const flush = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  const inline = (s: string) => {
    let t = escape(s);
    // links [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, txt, href) => {
      const safe = /^(https?:|\/|mailto:|tel:)/.test(href) ? href : "#";
      const external = /^https?:/.test(safe);
      return `<a href="${safe}"${external ? ' target="_blank" rel="noreferrer"' : ""} class="text-primary underline hover:no-underline">${txt}</a>`;
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-sm">$1</code>');
    return t;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const level = h[1].length;
      const sizes = ["text-3xl", "text-2xl", "text-xl", "text-lg"];
      out.push(
        `<h${level} class="${sizes[level - 1]} font-bold mt-8 mb-3">${inline(h[2])}</h${level}>`,
      );
      continue;
    }
    const ol = /^(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      if (!inOl) {
        flush();
        out.push('<ol class="list-decimal ps-6 my-4 space-y-2">');
        inOl = true;
      }
      out.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inUl) {
        flush();
        out.push('<ul class="list-disc ps-6 my-4 space-y-2">');
        inUl = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    flush();
    out.push(`<p class="my-4 leading-8">${inline(line)}</p>`);
  }
  flush();
  return out.join("\n");
}

const SEASON_AR: Record<string, string> = {
  spring: "الربيع",
  summer: "الصيف",
  autumn: "الخريف",
  winter: "الشتاء",
  all: "كل المواسم",
};

function ArticleDetail() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(articleQuery(slug));
  const { article, related } = data;
  const html = renderMarkdown(article.content_ar);
  const seasonLabel = article.season ? SEASON_AR[article.season] : null;

  return (
    <div>
      <section className="hero-gradient-deep text-white py-14">
        <div className="container-app">
          <nav className="text-xs text-white/80 mb-3">
            <Link to="/" className="hover:underline">
              الرئيسية
            </Link>
            <span className="mx-2">/</span>
            <Link to="/health" className="hover:underline">
              المدونة الصحية
            </Link>
            {article.health_categories && (
              <>
                <span className="mx-2">/</span>
                <span>{article.health_categories.name_ar}</span>
              </>
            )}
          </nav>
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">{article.title_ar}</h1>
          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-white/85">
            {seasonLabel && (
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                {seasonLabel}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" /> {article.reading_minutes} دقائق قراءة
            </span>
            {article.published_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(article.published_at).toLocaleDateString("ar-SA")}
              </span>
            )}
            {article.author_name && <span>· {article.author_name}</span>}
          </div>
        </div>
      </section>

      <article className="py-14">
        <div className="container-app max-w-3xl">
          {article.cover_image_url && (
            <img
              src={article.cover_image_url}
              alt={article.title_ar}
              className="w-full rounded-2xl mb-8 border border-border"
              loading="eager"
            />
          )}
          <p className="text-lg leading-8 text-muted-foreground border-s-4 border-primary ps-4 mb-8">
            {article.excerpt_ar}
          </p>
          <div
            className="prose-content text-foreground"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {article.keywords.length > 0 && (
            <div className="mt-10 pt-6 border-t border-border">
              <div className="text-sm font-semibold mb-3">الكلمات المفتاحية</div>
              <div className="flex flex-wrap gap-2">
                {article.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>

      {related.length > 0 && (
        <section className="py-12 bg-muted/40 border-t border-border">
          <div className="container-app">
            <h2 className="text-2xl font-bold mb-6">مقالات ذات صلة</h2>
            <div className="grid gap-5 md:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  to="/health/$slug"
                  params={{ slug: r.slug }}
                  className="rounded-2xl border border-border bg-card p-5 hover:border-primary hover:shadow-md transition"
                >
                  <h3 className="font-bold leading-6 group-hover:text-primary">{r.title_ar}</h3>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{r.excerpt_ar}</p>
                  <div className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    اقرأ <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="py-10 bg-primary text-primary-foreground">
        <div className="container-app flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-bold text-lg">تحتاج استشارة طبية؟</div>
            <div className="text-sm opacity-90 flex items-center gap-2 mt-1">
              <MapPin className="h-4 w-4" /> {SITE.addressAr}
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              to="/book"
              className="rounded-lg bg-white text-primary px-5 py-2.5 text-sm font-bold hover:bg-white/90"
            >
              احجز موعداً
            </Link>
            <a
              href={`tel:${SITE.phone}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/30 px-5 py-2.5 text-sm font-bold hover:bg-white/20"
            >
              <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
