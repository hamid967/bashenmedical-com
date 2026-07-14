import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Stethoscope, Users } from "lucide-react";
import { buildLocalBusinessSchema, buildBreadcrumbs } from "@/lib/localBusinessSchema";
import { specialtyDoctorCountsQuery } from "@/lib/accreditations";
import { PageHero } from "@/components/PageShell";


const SITE_URL = "https://happy-hugger-fluff.lovable.app";
const PAGE_URL = `${SITE_URL}/specialties`;
const PAGE_TITLE_AR = "التخصصات الطبية — مجمع باعشن الطبي بصبيا، جازان";
const PAGE_DESC_AR =
  "تخصصات طبية شاملة في مجمع باعشن الطبي بصبيا، جازان: الباطنة، الأطفال، النساء والولادة، الأسنان، العيون، الجراحة والمزيد. احجز موعدك أونلاين مع نخبة من الاستشاريين والأخصائيين.";

type Specialty = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  sort_order: number | null;
};

async function fetchSpecialties(): Promise<Specialty[]> {
  const { data, error } = await supabase
    .from("specialties")
    .select("id, slug, name_ar, name_en, description_ar, description_en, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Specialty[];
}

export const Route = createFileRoute("/specialties/")({
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["specialties"],
      queryFn: fetchSpecialties,
    }),
  head: ({ loaderData }) => {
    const list = (loaderData as Specialty[] | undefined) ?? [];
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: list.map((s, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: s.name_ar,
        url: `${SITE_URL}/specialties/${encodeURIComponent(s.slug)}`,
      })),
    };
    return {
      meta: [
        { title: PAGE_TITLE_AR },
        { name: "description", content: PAGE_DESC_AR },
        { property: "og:title", content: PAGE_TITLE_AR },
        { property: "og:description", content: PAGE_DESC_AR },
        { property: "og:type", content: "website" },
        { property: "og:url", content: PAGE_URL },
        { property: "og:locale", content: "ar_SA" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: PAGE_TITLE_AR },
        { name: "twitter:description", content: PAGE_DESC_AR },
      ],
      links: [{ rel: "canonical", href: PAGE_URL }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(buildLocalBusinessSchema({ pageUrl: PAGE_URL })) },
        { type: "application/ld+json", children: JSON.stringify(buildBreadcrumbs([
          { name: "الرئيسية", path: "/" },
          { name: "التخصصات", path: "/specialties" },
        ])) },
        ...(list.length > 0
          ? [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }]
          : []),
      ],

    };
  },
  component: SpecialtiesPage,
});

function SpecialtiesPage() {
  const { lang, t } = useI18n();
  const { data } = useSuspenseQuery({
    queryKey: ["specialties"],
    queryFn: fetchSpecialties,
  });
  const { data: counts } = useQuery(specialtyDoctorCountsQuery());
  return (
    <div>
      <PageHero
        eyebrow={lang === "ar" ? "التخصصات الطبية" : "Medical specialties"}
        title={t("specialties_title")}
        subtitle={t("specialties_sub")}
      />
      <section className="container-app py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((s) => (
            <div key={s.id} className="bento-card p-6 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="h-12 w-12 rounded-xl bg-[color:var(--brand-mist)] grid place-items-center text-[color:var(--brand-deep)] ring-1 ring-[color:var(--brand-gold-soft)]">
                  <Stethoscope className="h-6 w-6" />
                </div>
                {counts?.[s.id] ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-mist)] text-[color:var(--brand-deep)] px-2.5 py-1 text-[11px] font-semibold border border-[color:var(--brand-gold-soft)]">
                    <Users className="h-3 w-3" /> {counts[s.id]}+ {lang === "ar" ? "طبيب" : "doctors"}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-4 font-bold text-lg text-[color:var(--brand-deep)]">
                <Link
                  to="/specialties/$slug"
                  params={{ slug: s.slug }}
                  className="hover:text-primary"
                >
                  {lang === "ar" ? s.name_ar : s.name_en}
                </Link>
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-7 flex-1">
                {lang === "ar" ? s.description_ar : s.description_en}
              </p>
              <div className="mt-5 flex gap-2">
                <Link
                  to="/specialties/$slug"
                  params={{ slug: s.slug }}
                  className="inline-flex items-center rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95"
                >
                  {lang === "ar" ? "تفاصيل التخصص" : "View specialty details"}
                </Link>
                <Link
                  to="/book"
                  search={{ specialty: s.slug }}
                  className="inline-flex items-center rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:border-[color:var(--brand-gold)] hover:text-[color:var(--brand-deep)]"
                >
                  {t("cta_book")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
