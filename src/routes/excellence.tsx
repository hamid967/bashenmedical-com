import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHero } from "@/components/PageShell";
import { EXCELLENCE_CENTERS } from "@/data/excellence-centers";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/excellence")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "مراكز التميز — مجمع باعشن الطبي" },
      { name: "description", content: "مراكز التميز في مجمع باعشن الطبي: القلب، العظام، العيون، النساء والولادة، طب الأسنان، الأعصاب، الجهاز الهضمي والجراحة التجميلية." },
      { property: "og:title", content: "مراكز التميز — مجمع باعشن الطبي" },
      { property: "og:description", content: "رعاية متخصصة في ثمانية مجالات طبية." },
      { property: "og:url", content: "https://happy-hugger-fluff.lovable.app/excellence" },
    ],
    links: [{ rel: "canonical", href: "https://happy-hugger-fluff.lovable.app/excellence" }],
  }),
  component: ExcellencePage,
});

function ExcellencePage() {
  return (
    <>
      <PageHero
        eyebrow="مراكز التميز"
        title="رعاية متخصصة على أعلى مستوى"
        subtitle="نفخر بمراكز التميز في مجمع باعشن الطبي حيث نقدّم رعاية متكاملة برعاية أطباء استشاريين وتقنيات حديثة."
      />
      <section className="container-app py-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {EXCELLENCE_CENTERS.map((c) => (
          <Link
            key={c.slug}
            to="/excellence/$slug"
            params={{ slug: c.slug }}
            className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-lg transition"
          >
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-sm">
              <c.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold">{c.name}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-6">{c.desc}</p>
            <span className="mt-4 inline-flex text-sm font-semibold text-primary group-hover:underline">
              اعرف المزيد ←
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
