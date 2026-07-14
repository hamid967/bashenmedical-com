import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Award, ShieldCheck, Trophy, ArrowRight, Calendar, Tag } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { accreditationQuery, accreditationsQuery, type Accreditation } from "@/lib/accreditations";
import { trackEvent } from "@/lib/analytics";

const SITE_URL = "https://bashenmedical.com";

export const Route = createFileRoute("/accreditations/$id")({
  loader: async ({ context, params }) => {
    const a = await context.queryClient.ensureQueryData(accreditationQuery(params.id));
    if (!a) throw notFound();
    // Preload list for related section.
    await context.queryClient.ensureQueryData(accreditationsQuery());
    return a;
  },
  head: ({ loaderData, params }) => {
    const a = (loaderData ?? null) as Accreditation | null;
    if (!a) {
      return {
        meta: [
          { title: "اعتماد غير موجود — مجمع باعشن" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const url = `${SITE_URL}/accreditations/${params.id}`;
    const desc = a.description_ar ?? `${a.title_ar} — اعتماد مجمع باعشن الطبي.`;
    return {
      meta: [
        { title: `${a.title_ar} — الاعتمادات | مجمع باعشن` },
        { name: "description", content: desc },
        { property: "og:title", content: a.title_ar },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        ...(a.image_url ? [{ property: "og:image" as const, content: a.image_url }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <p className="text-destructive">تعذّر التحميل: {error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
        إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center">
      <h1 className="text-2xl font-bold mb-2">الاعتماد غير موجود</h1>
      <Link to="/accreditations" className="inline-flex items-center gap-1 text-primary font-semibold hover:underline">
        <ArrowRight className="h-4 w-4" /> الرجوع للاعتمادات
      </Link>
    </div>
  ),
  component: AccreditationDetail,
});

function iconFor(category: string | null) {
  if (!category) return Award;
  if (/دولي|international/i.test(category)) return Trophy;
  if (/جودة|quality|iso/i.test(category)) return ShieldCheck;
  return Award;
}

function AccreditationDetail() {
  const { id } = Route.useParams();
  const { lang } = useI18n();
  const { data } = useSuspenseQuery(accreditationQuery(id));
  const { data: allData } = useSuspenseQuery(accreditationsQuery());
  const a = data as Accreditation;
  const Icon = iconFor(a.category);
  const title = lang === "ar" ? a.title_ar : a.title_en;
  const desc = lang === "ar" ? a.description_ar : a.description_en;
  const related = (allData ?? []).filter((x) => x.id !== a.id).slice(0, 3);

  useEffect(() => {
    trackEvent("accreditation_view", {
      id: a.id,
      title: a.title_ar,
      category: a.category ?? "",
      year: a.year ?? "",
    });
  }, [a.id, a.title_ar, a.category, a.year]);

  return (
    <article className="container-app py-10 max-w-4xl mx-auto">
      <Link
        to="/accreditations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowRight className="h-4 w-4" /> الاعتمادات والجوائز
      </Link>

      <header className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-accent/5 to-background p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Icon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            {a.category && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold">
                <Tag className="h-3 w-3" /> {a.category}
              </span>
            )}
            <h1 className="mt-2 text-2xl md:text-4xl font-black leading-tight">{title}</h1>
            {a.year && (
              <div className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" /> سنة الاعتماد: {a.year}
              </div>
            )}
          </div>
        </div>
      </header>

      {a.image_url && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 grid place-items-center">
          <img
            src={a.image_url}
            alt={title}
            className="max-h-64 w-auto object-contain"
            loading="lazy"
          />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold mb-3">عن هذا الاعتماد</h2>
        <p className="text-muted-foreground leading-8 whitespace-pre-line">
          {desc ?? "هذا الاعتماد جزء من التزام مجمع باعشن الطبي بأعلى معايير الجودة والسلامة العالمية."}
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link
          to="/about"
          className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition"
        >
          <div className="text-xs font-semibold text-primary">تعرّف علينا</div>
          <div className="mt-1 font-bold">عن المجمع</div>
          <p className="mt-1 text-xs text-muted-foreground">رؤيتنا ورسالتنا وقصتنا.</p>
        </Link>
        <Link
          to="/specialties"
          className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition"
        >
          <div className="text-xs font-semibold text-primary">الخدمات</div>
          <div className="mt-1 font-bold">التخصصات الطبية</div>
          <p className="mt-1 text-xs text-muted-foreground">استكشف تخصصاتنا وأطباءنا.</p>
        </Link>
        <Link
          to="/contact"
          className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition"
        >
          <div className="text-xs font-semibold text-primary">تواصل</div>
          <div className="mt-1 font-bold">تواصل معنا</div>
          <p className="mt-1 text-xs text-muted-foreground">استفسارات الاعتمادات والجودة.</p>
        </Link>
      </section>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-bold mb-4">اعتمادات ذات صلة</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((r) => {
              const RIcon = iconFor(r.category);
              return (
                <Link
                  key={r.id}
                  to="/accreditations/$id"
                  params={{ id: r.id }}
                  className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <RIcon className="h-5 w-5" />
                  </div>
                  <div className="mt-3 text-sm font-semibold line-clamp-2">
                    {lang === "ar" ? r.title_ar : r.title_en}
                  </div>
                  {r.category && (
                    <div className="mt-1 text-xs text-muted-foreground">{r.category}</div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </article>
  );
}
