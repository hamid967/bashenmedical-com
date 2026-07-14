import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Award, ShieldCheck, Trophy, Search, X } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useI18n } from "@/lib/i18n";
import { PageHero } from "@/components/PageShell";
import { accreditationsQuery, type Accreditation } from "@/lib/accreditations";
import { trackEvent } from "@/lib/analytics";
import { bmcOgImageMeta } from "@/lib/og-meta";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  cat: fallback(z.string(), "").default(""),
});

const SITE_URL = "https://bashenmedical.com";
const PAGE_URL = `${SITE_URL}/accreditations`;
const PAGE_TITLE = "الاعتمادات والجوائز الطبية | مجمع باعشن الطبي";
const PAGE_DESC =
  "شهادات واعتمادات مجمع باعشن الطبي المحلية والدولية: CBAHI، ACHSI، HIMSS، CAP، ISO 9001 و14001 — دليل التزامنا بأعلى معايير جودة الرعاية الصحية والسلامة.";
const OG_TITLE = "الاعتمادات والجوائز الطبية | مجمع باعشن";
const OG_DESC =
  "اعتمادات محلية ودولية معتمدة (CBAHI، ACHSI، HIMSS، CAP، ISO) تؤكد جودة الرعاية والسلامة في مجمع باعشن الطبي.";

export const Route = createFileRoute("/accreditations")({
  validateSearch: zodValidator(searchSchema),
  loader: ({ context }) => context.queryClient.ensureQueryData(accreditationsQuery()),
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESC },
      {
        name: "keywords",
        content:
          "اعتمادات مجمع باعشن, شهادات جودة طبية, CBAHI, ACHSI, HIMSS, CAP, ISO 9001, ISO 14001, جودة الرعاية الصحية, مستشفى معتمد جدة",
      },
      { property: "og:title", content: OG_TITLE },
      { property: "og:description", content: OG_DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:site_name", content: "مجمع باعشن الطبي" },
      { property: "og:locale", content: "ar_SA" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: OG_TITLE },
      { name: "twitter:description", content: OG_DESC },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: PAGE_TITLE,
          description: PAGE_DESC,
          url: PAGE_URL,
          inLanguage: "ar",
          isPartOf: { "@type": "WebSite", name: "مجمع باعشن الطبي", url: SITE_URL },
          about: {
            "@type": "MedicalOrganization",
            name: "مجمع باعشن الطبي",
            url: SITE_URL,
            hasCredential: [
              "CBAHI Accreditation",
              "ACHSI International Accreditation",
              "HIMSS Analytics",
              "College of American Pathologists (CAP)",
              "ISO 9001 Quality Management",
              "ISO 14001 Environmental Management",
            ],
          },
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "الرئيسية", item: SITE_URL },
              { "@type": "ListItem", position: 2, name: "الاعتمادات والجوائز", item: PAGE_URL },
            ],
          },
        }),
      },
    ],
  }),
  component: AccreditationsPage,
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <p className="text-destructive font-semibold">تعذّر تحميل الاعتمادات</p>
      <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
        إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="container-app py-16 text-center">لا توجد اعتمادات</div>,
});

function iconFor(category: string | null) {
  if (!category) return Award;
  if (/دولي|international/i.test(category)) return Trophy;
  if (/جودة|quality|iso/i.test(category)) return ShieldCheck;
  return Award;
}

function AccreditationsPage() {
  const { lang } = useI18n();
  const { data } = useSuspenseQuery(accreditationsQuery());
  const all = data as Accreditation[];
  const { q, cat } = Route.useSearch();
  const navigate = useNavigate({ from: "/accreditations" });

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const a of all) if (a.category) s.add(a.category);
    return Array.from(s);
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((a) => {
      if (cat && a.category !== cat) return false;
      if (!needle) return true;
      const hay = [
        a.title_ar,
        a.title_en,
        a.description_ar ?? "",
        a.description_en ?? "",
        a.category ?? "",
        a.year ? String(a.year) : "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [all, q, cat]);

  const hasFilter = Boolean(q || cat);

  return (
    <>
      <PageHero
        eyebrow="الجودة والتميّز"
        title="الاعتمادات والجوائز"
        subtitle="نلتزم بأعلى معايير الرعاية الصحية العالمية. هذه بعض الشهادات والجوائز التي حصلنا عليها."
      />

      <section className="container-app py-12">
        {/* Search + filter bar */}
        <div className="mb-6 rounded-2xl border border-border bg-card p-4 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={q}
              onChange={(e) =>
                navigate({ search: (prev: { q: string; cat: string }) => ({ ...prev, q: e.target.value }), replace: true })
              }
              placeholder="ابحث في الاعتمادات (اسم، جهة، سنة…)"
              aria-label="بحث في الاعتمادات"
              className="w-full rounded-lg border border-input bg-background ps-9 pe-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={cat}
            onChange={(e) =>
              navigate({ search: (prev: { q: string; cat: string }) => ({ ...prev, cat: e.target.value }), replace: true })
            }
            aria-label="تصفية حسب النوع"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary min-w-40"
          >
            <option value="">كل الأنواع</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {hasFilter && (
            <button
              type="button"
              onClick={() => navigate({ search: { q: "", cat: "" }, replace: true })}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <X className="h-4 w-4" /> مسح
            </button>
          )}
        </div>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate({ search: (prev: { q: string; cat: string }) => ({ ...prev, cat: "" }), replace: true })}
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                cat === ""
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              الكل ({all.length})
            </button>
            {categories.map((c) => {
              const count = all.filter((a) => a.category === c).length;
              const active = cat === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    navigate({
                      search: (prev: { q: string; cat: string }) => ({ ...prev, cat: active ? "" : c }),
                      replace: true,
                    })
                  }
                  className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  {c} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div className="mb-4 text-sm text-muted-foreground" aria-live="polite">
          {filtered.length === all.length
            ? `عرض ${all.length} اعتماد`
            : `عرض ${filtered.length} من ${all.length} اعتماد`}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">لا توجد نتائج مطابقة لبحثك.</p>
            {hasFilter && (
              <button
                type="button"
                onClick={() => navigate({ search: { q: "", cat: "" }, replace: true })}
                className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                مسح الفلاتر
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => {
              const Icon = iconFor(a.category);
              return (
                <Link
                  key={a.id}
                  to="/accreditations/$id"
                  params={{ id: a.id }}
                  onClick={() =>
                    trackEvent("accreditation_card_click", {
                      id: a.id,
                      title: a.title_ar,
                      category: a.category ?? "",
                      location: "accreditations_list",
                      query: q,
                      filter_category: cat,
                    })
                  }
                  className="block rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    {a.year && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {a.year}
                      </span>
                    )}
                  </div>
                  {a.image_url && (
                    <img
                      src={a.image_url}
                      alt={lang === "ar" ? a.title_ar : a.title_en}
                      className="mt-4 h-24 w-full rounded-lg object-contain bg-muted/40"
                      loading="lazy"
                    />
                  )}
                  <h3 className="mt-4 font-bold text-base leading-6">
                    {lang === "ar" ? a.title_ar : a.title_en}
                  </h3>
                  {a.category && (
                    <div className="mt-1 text-xs font-medium text-primary">{a.category}</div>
                  )}
                  {(lang === "ar" ? a.description_ar : a.description_en) && (
                    <p className="mt-2 text-sm text-muted-foreground leading-6 line-clamp-3">
                      {lang === "ar" ? a.description_ar : a.description_en}
                    </p>
                  )}
                  <div className="mt-4 text-xs font-semibold text-primary">عرض التفاصيل ←</div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            to="/about"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            عن المجمع
          </Link>
        </div>
      </section>
    </>
  );
}
