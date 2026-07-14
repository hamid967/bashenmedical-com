import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { buildLocalBusinessSchema, buildBreadcrumbs, CLINIC_ID, SITE_URL } from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";
import { Stethoscope, ArrowLeft, MapPin, Phone } from "lucide-react";
import { bmcOgImageMeta } from "@/lib/og-meta";

type Specialty = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
};

type DoctorLite = {
  id: string;
  slug: string | null;
  name_ar: string;
  name_en: string | null;
  title_ar: string | null;
  title_en: string | null;
};

const specialtyQuery = (slug: string) => ({
  queryKey: ["specialty", slug],
  queryFn: async (): Promise<{ specialty: Specialty; doctors: DoctorLite[] }> => {
    const { data: sp, error } = await supabase
      .from("specialties")
      .select("id, slug, name_ar, name_en, description_ar, description_en")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!sp) throw notFound();
    const { data: docs } = await supabase
      .from("doctors")
      .select("id, slug, name_ar, name_en, title_ar, title_en")
      .eq("specialty_id", sp.id)
      .eq("is_active", true)
      .order("sort_order");
    return { specialty: sp as Specialty, doctors: (docs ?? []) as DoctorLite[] };
  },
});

export const Route = createFileRoute("/specialties/$slug")({
  loader: async ({ params, context }) => {
    const [data, settings] = await Promise.all([
      context.queryClient.ensureQueryData(specialtyQuery(params.slug)),
      context.queryClient.ensureQueryData(clinicSettingsQuery()),
    ]);
    return { ...data, settings };
  },
  head: ({ params, loaderData }) => {
    const ld = loaderData as
      | { specialty: Specialty; doctors: DoctorLite[]; settings: ClinicSettings }
      | undefined;
    if (!ld) {
      return {
        meta: [
      ...bmcOgImageMeta(),{ title: "غير متوفر" }, { name: "robots", content: "noindex" }],
      };
    }
    const { specialty, doctors, settings } = ld;
    const url = `${SITE_URL}/specialties/${params.slug}`;
    const title = `${specialty.name_ar} — مجمع باعشن الطبي بصبيا، جازان`;
    const desc =
      specialty.description_ar?.slice(0, 155) ||
      `احجز موعدك في قسم ${specialty.name_ar} بمجمع باعشن الطبي بصبيا، جازان مع نخبة من الأطباء الاستشاريين.`;

    const specialtyId = `${url}#specialty`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "MedicalSpecialty",
      "@id": specialtyId,
      name: specialty.name_ar,
      alternateName: specialty.name_en ?? undefined,
      description: specialty.description_ar ?? undefined,
      url,
      recognizingAuthority: { "@id": CLINIC_ID },
      relevantSpecialty: doctors.map((d) => ({
        "@type": "Physician",
        name: d.name_ar,
        url: d.slug ? `${SITE_URL}/doctors/${d.slug}` : undefined,
        worksFor: { "@id": CLINIC_ID },
      })),
    };

    const clinic = buildLocalBusinessSchema({ pageUrl: url, settings });
    const breadcrumbs = buildBreadcrumbs([
      { name: "الرئيسية", path: "/" },
      { name: "التخصصات", path: "/specialties" },
      { name: specialty.name_ar, path: `/specialties/${params.slug}` },
    ]);

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:locale", content: "ar_SA" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(clinic) },
        { type: "application/ld+json", children: JSON.stringify(jsonLd) },
        { type: "application/ld+json", children: JSON.stringify(breadcrumbs) },
      ],
    };
  },
  notFoundComponent: SpecialtyNotFound,
  errorComponent: SpecialtyError,
  component: SpecialtyDetail,
});

function SpecialtyNotFound() {
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-3xl font-bold">التخصص غير موجود</h1>
      <Link to="/specialties" className="mt-4 inline-block text-primary hover:underline">
        عرض جميع التخصصات
      </Link>
    </div>
  );
}

function SpecialtyError({ reset }: { reset: () => void }) {
  return (
    <div className="container-app py-20 text-center">
      <h1 className="text-3xl font-bold">حدث خطأ</h1>
      <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground">
        إعادة المحاولة
      </button>
    </div>
  );
}

function SpecialtyDetail() {
  const { slug } = Route.useParams();
  const { lang } = useI18n();
  const { data } = useSuspenseQuery(specialtyQuery(slug));
  const { specialty, doctors } = data;
  const name = lang === "ar" ? specialty.name_ar : specialty.name_en || specialty.name_ar;
  const desc = lang === "ar" ? specialty.description_ar : specialty.description_en;

  return (
    <div>
      <section className="hero-gradient-deep text-white py-14">
        <div className="container-app">
          <nav className="text-xs text-white/80 mb-3">
            <Link to="/" className="hover:underline">الرئيسية</Link>
            <span className="mx-2">/</span>
            <Link to="/specialties" className="hover:underline">التخصصات</Link>
            <span className="mx-2">/</span>
            <span className="text-white">{name}</span>
          </nav>
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white/15 grid place-items-center">
              <Stethoscope className="h-7 w-7" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold">{name}</h1>
          </div>
          {desc && <p className="mt-5 text-white/90 max-w-3xl leading-8">{desc}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/book"
              search={{ specialty: specialty.slug }}
              className="inline-flex items-center gap-2 rounded-lg bg-white text-primary px-5 py-3 text-sm font-bold hover:bg-white/90"
            >
              احجز موعداً في {name} <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
            <a
              href={`tel:${SITE.phone}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 border border-white/25 px-5 py-3 text-sm font-bold hover:bg-white/20"
            >
              <Phone className="h-4 w-4" /> {SITE.phoneDisplay}
            </a>
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="container-app">
          <h2 className="text-2xl font-bold mb-6">
            {lang === "ar" ? `أطباء ${name}` : `${name} doctors`}
          </h2>
          {doctors.length === 0 ? (
            <p className="text-muted-foreground">
              لا يوجد أطباء منشورون حالياً لهذا التخصص. تواصل معنا لحجز موعد.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {doctors.map((d) => (
                <div key={d.id} className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-primary/10 text-primary grid place-items-center text-lg font-bold">
                      {(lang === "ar" ? d.name_ar : d.name_en || d.name_ar).charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold">
                        {lang === "ar" ? d.name_ar : d.name_en || d.name_ar}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {lang === "ar" ? d.title_ar : d.title_en}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2">
                    {d.slug && (
                      <Link
                        to="/doctors/$slug"
                        params={{ slug: d.slug }}
                        className="flex-1 text-center rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                      >
                        الملف الشخصي
                      </Link>
                    )}
                    <Link
                      to="/book"
                      search={{ doctor: d.id }}
                      className="flex-1 text-center rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      احجز
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-10 bg-muted/40 border-t border-border">
        <div className="container-app flex items-center gap-3 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" /> {lang === "ar" ? SITE.addressAr : SITE.addressEn}
        </div>
      </section>
    </div>
  );
}
