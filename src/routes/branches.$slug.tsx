import { useState } from "react";
import { createFileRoute, Link, notFound, ErrorComponent, type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock, Siren, Building2, ArrowLeft, CalendarPlus } from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { BranchBookingForm } from "@/components/BranchBookingForm";
import { BranchServicesExplorer } from "@/components/BranchServicesExplorer";
import { getBranchDetail, type PublicBranch } from "@/lib/branches.functions";

const branchQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-branch", slug],
    queryFn: () => getBranchDetail({ data: { slug } }),
  });

export const Route = createFileRoute("/branches/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    service: typeof search.service === "string" && search.service.length > 0 ? search.service : undefined,
  }),
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(branchQuery(params.slug));
    if (!detail) throw notFound();
    return { detail };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return { meta: [{ title: "الفرع غير موجود" }, { name: "robots", content: "noindex" }] };
    }
    const b = loaderData.detail.branch;
    const { centers, specialties } = loaderData.detail;
    const cityPart = b.city_ar ? ` — ${b.city_ar}` : "";
    const title = `${b.name_ar}${cityPart} | مجمع باعشن الطبي`;
    const descRaw = b.description_ar
      ? b.description_ar
      : `${b.name_ar}${b.city_ar ? ` في ${b.city_ar}` : ""}: العنوان، ساعات العمل، التخصصات${
          centers.length ? "، ومراكز التميز" : ""
        }، وحجز المواعيد.`;
    const desc = descRaw.replace(/\s+/g, " ").trim().slice(0, 160);
    const keywords = [
      b.name_ar,
      b.name_en,
      b.city_ar,
      "مجمع باعشن الطبي",
      "حجز موعد",
      ...specialties.slice(0, 8).map((s) => s.name_ar),
      ...centers.slice(0, 4).map((c) => c.name_ar),
    ]
      .filter(Boolean)
      .join("، ");
    const url = `https://bashenmedical.com/branches/${params.slug}`;
    const image = b.hero_image_url ?? undefined;

    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "MedicalClinic",
      name: b.name_ar,
      alternateName: b.name_en || undefined,
      url,
      image: image ? [image] : undefined,
      description: desc,
      telephone: b.phone || undefined,
      address: b.address_ar
        ? {
            "@type": "PostalAddress",
            streetAddress: b.address_ar,
            addressLocality: b.city_ar || undefined,
            addressCountry: "SA",
          }
        : undefined,
      geo:
        b.lat != null && b.lng != null
          ? { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng }
          : undefined,
      availableService: specialties.map((s) => ({
        "@type": "MedicalSpecialty",
        name: s.name_ar,
      })),
    };

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "keywords", content: keywords },
        { property: "og:type", content: "place" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:locale", content: "ar_SA" },
        { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        ...(image ? [{ property: "og:image", content: image }] : []),
        ...(image ? [{ name: "twitter:image", content: image }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(jsonLd),
        },
      ],
    };
  },
  component: BranchDetailPage,
  errorComponent: BranchError,
  notFoundComponent: BranchNotFound,
  pendingComponent: BranchDetailPending,
  pendingMs: 200,
});

function BranchDetailPending() {
  return (
    <div className="container-app py-8 grid gap-6 lg:grid-cols-3" aria-busy="true" aria-label="جاري تحميل بيانات الفرع">
      <aside className="lg:col-span-1 space-y-4">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="aspect-[16/9] bg-muted animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-10 w-full bg-muted rounded animate-pulse mt-2" />
          </div>
        </div>
      </aside>
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="h-5 w-56 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
          </div>
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="p-4 space-y-3 border-b lg:border-b-0 lg:border-l border-border">
              <div className="h-10 w-full bg-muted rounded-lg animate-pulse" />
              <div className="h-8 w-full bg-muted rounded-lg animate-pulse" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 w-full bg-muted/70 rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="min-h-[360px] bg-muted animate-pulse" />
          </div>
        </div>
        <div className="h-40 rounded-2xl bg-muted animate-pulse" />
      </div>
    </div>
  );
}

function BranchError({ error, reset }: ErrorComponentProps) {
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

function BranchNotFound() {
  return (
    <div className="container-app py-16 text-center">
      <h1 className="text-2xl font-bold">هذا الفرع غير موجود</h1>
      <Link to="/branches" className="mt-4 inline-flex items-center gap-2 text-primary hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> العودة إلى قائمة الفروع
      </Link>
    </div>
  );
}

const DAY_LABELS: Record<string, string> = {
  sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء",
  wed: "الأربعاء", thu: "الخميس", fri: "الجمعة",
};

function formatHours(hours: PublicBranch["working_hours"]) {
  if (!hours || typeof hours !== "object") return [];
  return Object.entries(hours).map(([k, v]) => ({
    day: DAY_LABELS[k.toLowerCase()] ?? k,
    time: String(v),
  }));
}

function BranchDetailPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(branchQuery(slug));
  const [preselectedSpecialtyId, setPreselectedSpecialtyId] = useState<string | null>(null);
  const [preselectToken, setPreselectToken] = useState(0);
  if (!data) return null;
  const { branch: b, centers, specialties } = data;
  const hours = formatHours(b.working_hours);
  const directions =
    b.lat != null && b.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`
      : null;

  const handleBookService = (payload: { specialtyId: string | null; label: string }) => {
    if (!payload.specialtyId) return;
    setPreselectedSpecialtyId(payload.specialtyId);
    setPreselectToken((n: number) => n + 1);
  };



  return (
    <>
      <PageHero
        eyebrow={b.city_ar ?? "فرع"}
        title={b.name_ar}
        subtitle={b.description_ar ?? "معلومات كاملة عن الفرع والخدمات المتوفرة."}
      />

      <section className="container-app py-8 grid gap-6 lg:grid-cols-3">
        {/* Sidebar: contact + actions */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="aspect-[16/9] bg-gradient-to-br from-primary/20 to-accent/20">
              {b.hero_image_url ? (
                <img src={b.hero_image_url} alt={b.name_ar} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center">
                  <Building2 className="h-14 w-14 text-primary/60" />
                </div>
              )}
            </div>
            <div className="p-4 space-y-3 text-sm">
              {b.address_ar && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{b.address_ar}</span>
                </div>
              )}
              {b.phone && (
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <a href={`tel:${b.phone}`} className="hover:text-primary" dir="ltr">{b.phone}</a>
                </div>
              )}
              {b.emergency_phone && (
                <div className="flex items-start gap-2">
                  <Siren className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  <a href={`tel:${b.emergency_phone}`} className="text-destructive font-semibold" dir="ltr">
                    طوارئ: {b.emergency_phone}
                  </a>
                </div>
              )}
            </div>

            <div className="p-4 pt-0 flex flex-col gap-2">
              <a
                href="#book"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-95"
              >
                <CalendarPlus className="h-4 w-4" /> احجز في هذا الفرع
              </a>
              {b.phone && (
                <a
                  href={`tel:${b.phone}`}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-primary text-primary px-4 py-2.5 text-sm font-semibold hover:bg-primary/5"
                >
                  <Phone className="h-4 w-4" /> اتصل بالفرع
                </a>
              )}
              {directions && (
                <a
                  href={directions}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm hover:bg-muted"
                >
                  <MapPin className="h-4 w-4" /> الاتجاهات على الخريطة
                </a>
              )}
            </div>
          </div>

          {hours.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold mb-3">
                <Clock className="h-4 w-4 text-primary" /> ساعات العمل
              </h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {hours.map((h) => (
                  <div key={h.day} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{h.day}</dt>
                    <dd dir="ltr">{h.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>

        {/* Main: services explorer with filter + map */}
        <div className="lg:col-span-2 space-y-6">
          {specialties.length === 0 && centers.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
              لم يتم إضافة خدمات أو مراكز تميز لهذا الفرع بعد.
            </div>
          ) : (
            <BranchServicesExplorer
              branch={b}
              specialties={specialties}
              centers={centers}
              onBookService={handleBookService}
            />
          )}


          <section id="book">
            <BranchBookingForm
              branchId={b.id}
              branchNameAr={b.name_ar}
              specialties={specialties}
              preselectedSpecialtyId={preselectedSpecialtyId}
              preselectToken={preselectToken}
            />
          </section>

          <div>
            <Link to="/branches" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> جميع الفروع
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
