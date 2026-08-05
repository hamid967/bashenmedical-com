import { useState } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  ErrorComponent,
  type ErrorComponentProps,
  useRouter,
} from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { BranchBookingForm } from "@/components/BranchBookingForm";
import { BranchPageHero } from "@/components/branch/BranchPageHero";
import { BranchQuickBar } from "@/components/branch/BranchQuickBar";
import { BranchServicesGrid } from "@/components/branch/BranchServicesGrid";
import { BranchDoctorsStrip } from "@/components/branch/BranchDoctorsStrip";
import { BranchVisitInfo } from "@/components/branch/BranchVisitInfo";
import { EServicesQuickAccess } from "@/components/home/EServicesQuickAccess";
import { getBranchDetail } from "@/lib/branches.functions";

const branchQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-branch", slug],
    queryFn: () => getBranchDetail({ data: { slug } }),
  });

export const Route = createFileRoute("/branches/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    service:
      typeof search.service === "string" && search.service.length > 0 ? search.service : undefined,
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
      "خدمات طبية",
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
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "الرئيسية",
                item: "https://bashenmedical.com/",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: "الفروع",
                item: "https://bashenmedical.com/branches",
              },
              { "@type": "ListItem", position: 3, name: b.name_ar, item: url },
            ],
          }),
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
    <div aria-busy="true" aria-label="جاري تحميل بيانات الفرع">
      <div className="min-h-[min(78vh,640px)] animate-pulse bg-muted" />
      <div className="container-app space-y-8 py-10">
        <div className="h-10 w-full max-w-xl animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
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
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        onClick={() => {
          reset();
          router.invalidate();
        }}
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
      <Link
        to="/branches"
        className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> العودة إلى قائمة الفروع
      </Link>
    </div>
  );
}

function BranchDetailPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(branchQuery(slug));
  const [preselectedSpecialtyId, setPreselectedSpecialtyId] = useState<string | null>(null);
  const [preselectToken, setPreselectToken] = useState(0);
  if (!data) return null;

  const { branch: b, centers, specialties, doctors } = data;
  const directions =
    b.lat != null && b.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`
      : null;

  const handleBookSpecialty = (specialtyId: string) => {
    setPreselectedSpecialtyId(specialtyId);
    setPreselectToken((n) => n + 1);
    if (typeof document !== "undefined") {
      document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      <BranchPageHero
        branch={b}
        specialtyCount={specialties.length}
        doctorCount={doctors.length}
        directionsUrl={directions}
      />
      <BranchQuickBar branch={b} directionsUrl={directions} />

      {/* Patient e-services strip — same pattern as hospital hubs */}
      <div className="border-b border-border bg-[color:var(--brand-mint)]/40 py-8">
        <EServicesQuickAccess className="container-app" />
      </div>

      <div className="container-app space-y-16 py-12 md:space-y-20 md:py-16">
        <BranchServicesGrid
          branchId={b.id}
          specialties={specialties}
          centers={centers}
          onBookSpecialty={handleBookSpecialty}
        />

        <BranchDoctorsStrip branchId={b.id} doctors={doctors} />

        <BranchVisitInfo branch={b} directionsUrl={directions} />

        <section id="book" className="scroll-mt-24">
          <header className="mb-6 max-w-2xl">
            <p className="text-xs font-bold tracking-wide text-[color:var(--brand-gold)]">الحجز</p>
            <h2 className="mt-2 text-2xl font-bold text-[color:var(--brand-deep)] md:text-3xl">
              احجز موعدك في {b.name_ar}
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground md:text-base">
              أكمل بيانات الموعد خلال دقائق — الفرع محدد مسبقًا.
            </p>
          </header>
          <BranchBookingForm
            branchId={b.id}
            branchNameAr={b.name_ar}
            specialties={specialties}
            preselectedSpecialtyId={preselectedSpecialtyId}
            preselectToken={preselectToken}
          />
        </section>

        <div>
          <Link
            to="/branches"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> جميع الفروع
          </Link>
        </div>
      </div>
    </>
  );
}
