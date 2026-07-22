import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Heart, ArrowRight } from "lucide-react";
import { getPatientStory, type PatientStory } from "@/lib/patient-stories.functions";

const storyQuery = (slug: string) =>
  queryOptions({
    queryKey: ["patient-story", slug],
    queryFn: () => getPatientStory({ data: { slug } }),
  });

export const Route = createFileRoute("/media/stories/$slug")({
  head: ({ loaderData }) => {
    const s = (loaderData ?? null) as PatientStory | null;
    if (!s) {
      return {
        meta: [{ title: "قصة غير موجودة — مجمع باعشن" }, { name: "robots", content: "noindex" }],
      };
    }
    return {
      meta: [
        { title: `${s.title_ar} — قصص المرضى | مجمع باعشن` },
        { name: "description", content: s.excerpt ?? "قصة مريض من مجمع باعشن الطبي." },
        { property: "og:title", content: s.title_ar },
        { property: "og:description", content: s.excerpt ?? "قصة مريض من مجمع باعشن." },
        { property: "og:type", content: "article" },
        ...(s.hero_image_url ? [{ property: "og:image" as const, content: s.hero_image_url }] : []),
      ],
      links: [{ rel: "canonical", href: `https://bashenmedical.com/media/stories/${s.slug}` }],
    };
  },
  loader: async ({ context, params }) => {
    const q = storyQuery(params.slug);
    const s = await context.queryClient.ensureQueryData(q);
    if (!s) throw notFound();
    return s;
  },
  errorComponent: ({ error }) => (
    <div className="container-app py-16 text-center">
      <p className="text-destructive">تعذّر التحميل: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center">
      <h1 className="text-2xl font-bold mb-2">القصة غير موجودة</h1>
      <p className="text-muted-foreground mb-6">قد تكون أُخفيت أو حُذفت.</p>
      <Link
        to="/media/stories"
        className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
      >
        <ArrowRight className="h-4 w-4" /> الرجوع لقائمة القصص
      </Link>
    </div>
  ),
  component: StoryDetail,
});

function StoryDetail() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(storyQuery(slug));
  const s = data as PatientStory;

  return (
    <article className="container-app py-10 max-w-3xl mx-auto">
      <Link
        to="/media/stories"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowRight className="h-4 w-4" /> قصص المرضى
      </Link>

      {s.specialty && (
        <span className="inline-block rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold mb-3">
          {s.specialty}
        </span>
      )}
      <h1 className="text-3xl md:text-4xl font-black leading-tight">{s.title_ar}</h1>
      {s.published_at && (
        <p className="mt-2 text-xs text-muted-foreground">
          نُشرت في{" "}
          {new Date(s.published_at).toLocaleDateString("ar-SA", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      )}

      {s.hero_image_url ? (
        <img
          src={s.hero_image_url}
          alt={s.title_ar}
          className="mt-6 w-full rounded-2xl border border-border object-cover aspect-[16/9]"
        />
      ) : (
        <div className="mt-6 aspect-[16/9] rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 grid place-items-center">
          <Heart className="h-16 w-16 text-primary/40" />
        </div>
      )}

      {s.excerpt && <p className="mt-6 text-lg text-muted-foreground leading-8">{s.excerpt}</p>}

      {s.body_md && (
        <div className="mt-6 prose prose-neutral dark:prose-invert max-w-none whitespace-pre-line leading-8">
          {s.body_md}
        </div>
      )}

      <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <p className="text-sm text-muted-foreground">لديك قصة تودّ مشاركتها؟</p>
        <Link
          to="/contact"
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          تواصل معنا
        </Link>
      </div>
    </article>
  );
}
