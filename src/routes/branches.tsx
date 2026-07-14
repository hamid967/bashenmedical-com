import { createFileRoute, Link, ErrorComponent, type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock, ArrowLeft, Building2, Siren } from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";
import { listPublicBranches, type PublicBranch } from "@/lib/branches.functions";
import { bmcOgImageMeta } from "@/lib/og-meta";

const branchesQuery = () =>
  queryOptions({
    queryKey: ["public-branches"],
    queryFn: () => listPublicBranches(),
  });

export const Route = createFileRoute("/branches")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "مستشفياتنا وفروعنا — مجمع باعشن الطبي" },
      { name: "description", content: "تعرّف على فروع مجمع باعشن الطبي مع الصور، الخريطة، ساعات العمل وأرقام الطوارئ لكل فرع." },
      { property: "og:title", content: "مستشفياتنا وفروعنا — مجمع باعشن الطبي" },
      { property: "og:description", content: "قائمة فروع مجمع باعشن الطبي بالخريطة وساعات العمل." },
      { property: "og:url", content: "https://bashenmedical.com/branches" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/branches" }],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(branchesQuery());
  },
  component: BranchesPage,
  errorComponent: BranchesError,
  notFoundComponent: () => <div className="container-app py-16 text-center">الصفحة غير موجودة</div>,
});

function BranchesError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="container-app py-16 text-center">
      <ErrorComponent error={error} />
      <button
        className="mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm"
        onClick={() => { reset(); router.invalidate(); }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

const DAY_LABELS: Record<string, string> = {
  sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء",
  wed: "الأربعاء", thu: "الخميس", fri: "الجمعة",
};

function formatHours(hours: PublicBranch["working_hours"]): { day: string; time: string }[] {
  if (!hours || typeof hours !== "object") return [];
  return Object.entries(hours).map(([k, v]) => ({
    day: DAY_LABELS[k.toLowerCase()] ?? k,
    time: String(v),
  }));
}

function mapEmbed(b: PublicBranch): string | null {
  if (b.map_embed_url) return b.map_embed_url;
  if (b.lat != null && b.lng != null) {
    return `https://www.google.com/maps?q=${b.lat},${b.lng}&hl=ar&z=15&output=embed`;
  }
  return null;
}

function BranchesPage() {
  const { data: branches } = useSuspenseQuery(branchesQuery());

  return (
    <>
      <PageHero
        eyebrow="مستشفياتنا"
        title="فروع مجمع باعشن الطبي"
        subtitle="شبكة رعاية صحية متكاملة. اختر أقرب فرع لك واطّلع على ساعات العمل والخدمات."
      />

      <section className="container-app py-10 grid gap-6 lg:grid-cols-2">
        {branches.length === 0 && (
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
            لا توجد فروع منشورة حالياً.
          </div>
        )}

        {branches.map((b) => {
          const hours = formatHours(b.working_hours);
          const embed = mapEmbed(b);
          const directions =
            b.lat != null && b.lng != null
              ? `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`
              : null;
          return (
            <article key={b.id} className="bento-card overflow-hidden flex flex-col p-0">
              <div
                className="aspect-[16/8] overflow-hidden relative"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-mist) 0%, var(--brand-sky) 60%, color-mix(in oklab, var(--brand-gold) 25%, white) 100%)",
                }}
              >
                {b.hero_image_url ? (
                  <img src={b.hero_image_url} alt={b.name_ar} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-full w-full grid place-items-center">
                    <Building2 className="h-14 w-14 text-[color:var(--brand-deep)]/70" />
                  </div>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-bold text-[color:var(--brand-deep)]">{b.name_ar}</h2>
                  {b.city_ar && (
                    <span className="text-[11px] rounded-full bg-[color:var(--brand-mist)] text-[color:var(--brand-deep)] border border-[color:var(--brand-gold-soft)] px-2 py-0.5 font-semibold">
                      {b.city_ar}
                    </span>
                  )}
                </div>
                {b.description_ar && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{b.description_ar}</p>
                )}

                <ul className="mt-4 space-y-2 text-sm">
                  {b.address_ar && (
                    <li className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span>{b.address_ar}</span>
                    </li>
                  )}
                  {b.phone && (
                    <li className="flex items-start gap-2">
                      <Phone className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <a href={`tel:${b.phone}`} className="hover:text-primary" dir="ltr">{b.phone}</a>
                    </li>
                  )}
                  {b.emergency_phone && (
                    <li className="flex items-start gap-2">
                      <Siren className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                      <a href={`tel:${b.emergency_phone}`} className="text-destructive font-semibold hover:underline" dir="ltr">
                        طوارئ: {b.emergency_phone}
                      </a>
                    </li>
                  )}
                </ul>

                {hours.length > 0 && (
                  <div className="mt-4 rounded-lg border border-border/60 bg-muted/40 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                      <Clock className="h-4 w-4 text-primary" /> ساعات العمل
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {hours.map((h) => (
                        <div key={h.day} className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{h.day}</dt>
                          <dd dir="ltr">{h.time}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {embed && (
                  <div className="mt-4 rounded-lg overflow-hidden border border-border">
                    <iframe
                      title={`خريطة ${b.name_ar}`}
                      src={embed}
                      className="w-full h-48"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                )}

                <div className="mt-5 flex gap-2">
                  <Link
                    to="/branches/$slug"
                    params={{ slug: b.slug }}
                    search={{ service: undefined }}
                    className="flex-1 text-center rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-95"
                  >
                    التفاصيل والحجز
                  </Link>
                  {directions && (
                    <a
                      href={directions}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                    >
                      الاتجاهات
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        <SectionCard
          icon={<Building2 className="h-5 w-5" />}
          title="قريباً — توسّع في جازان"
          desc="نعمل على افتتاح فروع جديدة في مدن جازان وأبو عريش وصامطة لخدمتك بشكل أوسع."
        >
          <Link to="/contact" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            اقترح موقعاً جديداً <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </SectionCard>
      </section>
    </>
  );
}
