import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicPageBySlug } from "@/lib/owner/pages.functions";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const row = await getPublicPageBySlug({ data: { slug: params.slug } });
    if (!row) throw notFound();
    return { page: row };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "الصفحة غير موجودة" }, { name: "robots", content: "noindex" }] };
    }
    const p: any = loaderData.page;
    const title = p.seo_title || p.title_ar;
    const desc = p.seo_description || "";
    const meta: any[] = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (p.og_image) {
      meta.push({ property: "og:image", content: p.og_image });
      meta.push({ name: "twitter:image", content: p.og_image });
    }
    return { meta };
  },
  component: PublicPage,
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-8" dir="rtl">
      <div className="text-center">
        <h1 className="text-xl font-bold text-slate-800">تعذّر عرض الصفحة</h1>
        <p className="text-sm text-slate-500 mt-2">{error?.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-dvh grid place-items-center p-8" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-800">الصفحة غير موجودة</h1>
        <p className="text-sm text-slate-500 mt-2">ربما تم حذفها أو أن الرابط غير صحيح.</p>
      </div>
    </div>
  ),
});

function PublicPage() {
  const { page } = Route.useLoaderData() as { page: any };
  return (
    <article className="max-w-3xl mx-auto px-4 py-12 md:py-16" dir="rtl">
      <header className="mb-8 border-b pb-6">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">{page.title_ar}</h1>
      </header>
      <div
        className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600"
        dangerouslySetInnerHTML={{ __html: renderContent(page.content_ar) }}
      />
    </article>
  );
}

// Very simple line-break renderer; content authors can also write raw HTML.
function renderContent(src: string): string {
  const trimmed = (src ?? "").trim();
  if (!trimmed) return "";
  // If it already contains block-level HTML tags, render as-is.
  if (/<(p|h[1-6]|ul|ol|blockquote|div|section|article|img)\b/i.test(trimmed)) {
    return trimmed;
  }
  // Otherwise turn double newlines into paragraphs.
  return trimmed
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeInline(para).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}
function escapeInline(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
