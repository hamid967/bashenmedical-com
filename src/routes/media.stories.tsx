import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Heart, ArrowLeft } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { listPatientStories, type PatientStory } from "@/lib/patient-stories.functions";
import { bmcOgImageMeta } from "@/lib/og-meta";

const storiesQuery = queryOptions({
  queryKey: ["patient-stories"],
  queryFn: () => listPatientStories(),
});

export const Route = createFileRoute("/media/stories")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "قصص المرضى — مجمع باعشن الطبي" },
      {
        name: "description",
        content: "قصص حقيقية من مرضى مجمع باعشن الطبي — رحلات علاج، تجارب نجاح، وشهادات ملهمة.",
      },
      { property: "og:title", content: "قصص المرضى — مجمع باعشن" },
      { property: "og:description", content: "تجارب علاج ملهمة من مرضانا." },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/media/stories" }],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(storiesQuery);
    return null;
  },
  errorComponent: ({ error }) => (
    <div className="container-app py-16 text-center">
      <p className="text-destructive">تعذّر تحميل القصص: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-muted-foreground">
      لا توجد قصص منشورة بعد.
    </div>
  ),
  component: StoriesPage,
});

function StoriesPage() {
  const { data } = useSuspenseQuery(storiesQuery);
  const stories = data as PatientStory[];

  return (
    <>
      <PageHero
        eyebrow="المركز الإعلامي"
        title="قصص المرضى"
        subtitle="خلف كل رحلة علاج قصة إنسانية — نشارك بعضها بإذن أصحابها، لتكون مصدر أمل ومعرفة لآخرين."
      />

      <section className="container-app py-10">
        {stories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <Heart className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            سنبدأ بنشر أولى القصص قريبًا.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {stories.map((s) => (
              <Link
                key={s.id}
                to="/media/stories/$slug"
                params={{ slug: s.slug }}
                className="group rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg hover:border-primary/40 transition"
              >
                <div className="aspect-[16/9] bg-gradient-to-br from-primary/15 to-accent/15 grid place-items-center overflow-hidden">
                  {s.hero_image_url ? (
                    <img
                      src={s.hero_image_url}
                      alt={s.title_ar}
                      loading="lazy"
                      className="h-full w-full object-cover group-hover:scale-105 transition"
                    />
                  ) : (
                    <Heart className="h-12 w-12 text-primary/40" />
                  )}
                </div>
                <div className="p-5">
                  {s.specialty && (
                    <span className="inline-block rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-semibold">
                      {s.specialty}
                    </span>
                  )}
                  <h2 className="mt-2 text-base font-bold group-hover:text-primary transition">
                    {s.title_ar}
                  </h2>
                  {s.excerpt && (
                    <p className="mt-1.5 text-sm text-muted-foreground leading-6 line-clamp-3">
                      {s.excerpt}
                    </p>
                  )}
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    اقرأ القصة كاملة <ArrowLeft className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// Silence lint for exports used indirectly
export { notFound };
