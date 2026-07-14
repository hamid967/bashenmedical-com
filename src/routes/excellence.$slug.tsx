import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CheckCircle2, Users, CalendarPlus, Phone } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { CenterBookingForm } from "@/components/CenterBookingForm";
import { EXCELLENCE_CENTERS, getExcellenceCenterBySlug } from "@/data/excellence-centers";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/excellence/$slug")({
  loader: ({ params }) => {
    const center = getExcellenceCenterBySlug(params.slug);
    if (!center) throw notFound();
    return { center };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.center;
    if (!c) return { meta: [
      ...bmcOgImageMeta(),{ title: "مركز غير موجود — مجمع باعشن الطبي" }] };
    const url = `https://bashenmedical.com/excellence/${c.slug}`;
    const title = `${c.name} — مراكز التميز | مجمع باعشن الطبي`;
    return {
      meta: [
        { title },
        { name: "description", content: c.desc },
        { property: "og:title", content: title },
        { property: "og:description", content: c.desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <h1 className="text-2xl font-bold text-destructive">تعذّر تحميل المركز</h1>
      <p className="mt-2 text-sm text-muted-foreground">{(error as Error)?.message}</p>
      <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
        إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center">
      <h1 className="text-2xl font-bold">المركز غير موجود</h1>
      <p className="mt-2 text-sm text-muted-foreground">قد يكون الرابط قديماً أو المركز غير متاح.</p>
      <Link to="/excellence" className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
        عودة لمراكز التميز
      </Link>
    </div>
  ),
  component: CenterPage,
});

function CenterPage() {
  const { center } = Route.useLoaderData();
  const others = EXCELLENCE_CENTERS.filter((c) => c.slug !== center.slug).slice(0, 4);
  const Icon = center.icon;

  return (
    <>
      <PageHero
        eyebrow="مراكز التميز"
        title={center.name}
        subtitle={center.desc}
      >
        <div className="flex flex-wrap gap-3">
          <Link
            to="/book"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <CalendarPlus className="h-4 w-4" />
            احجز موعدك الآن
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-5 py-2.5 text-sm font-semibold hover:bg-muted"
          >
            <Phone className="h-4 w-4" />
            تواصل مع المركز
          </Link>
        </div>
      </PageHero>

      <section className="container-app py-10 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
                <Icon className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold">عن المركز</h2>
            </div>
            <p className="text-sm leading-8 text-foreground/80">{center.longDesc}</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 text-xl font-bold">أهم الخدمات</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {center.services.map((s: string) => (
                <li key={s} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
              <Users className="h-4 w-4" />
              الفريق الطبي
            </div>
            <p className="text-sm leading-7 text-foreground/80">{center.team}</p>
            <Link
              to="/doctors"
              className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
            >
              تصفّح جميع الأطباء ←
            </Link>
          </div>

          <CenterBookingForm centerName={center.name} services={center.services} />
        </aside>
      </section>

      {others.length > 0 && (
        <section className="container-app pb-14">
          <h2 className="mb-4 text-xl font-bold">مراكز تميز أخرى</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((o) => (
              <Link
                key={o.slug}
                to="/excellence/$slug"
                params={{ slug: o.slug }}
                className="group rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-md transition"
              >
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <o.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold">{o.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{o.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
