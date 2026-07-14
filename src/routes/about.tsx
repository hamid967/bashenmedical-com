import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { ShieldCheck, MapPin, Users, Award } from "lucide-react";
import { PageHero } from "@/components/PageShell";

const SITE_URL = "https://happy-hugger-fluff.lovable.app";
const PAGE_URL = `${SITE_URL}/about`;
const PAGE_TITLE_AR = "من نحن — مجمع باعشن الطبي في صبيا، جازان";
const PAGE_DESC_AR =
  "تعرّف على مجمع باعشن الطبي في صبيا بمنطقة جازان: منشأة صحية معتمدة من CBAHI تقدم خدمات طبية عامة وتخصصية وصيدلية داخلية، مع فريق من الاستشاريين والأخصائيين.";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE_AR },
      { name: "description", content: PAGE_DESC_AR },
      { property: "og:title", content: PAGE_TITLE_AR },
      { property: "og:description", content: PAGE_DESC_AR },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:locale", content: "ar_SA" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: PAGE_TITLE_AR },
      { name: "twitter:description", content: PAGE_DESC_AR },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "MedicalOrganization",
          name: SITE.nameAr,
          alternateName: SITE.nameEn,
          url: SITE_URL,
          telephone: SITE.phone,
          email: SITE.email,
          address: {
            "@type": "PostalAddress",
            streetAddress: SITE.addressAr,
            addressLocality: "صبيا",
            addressRegion: "جازان",
            postalCode: SITE.postalCode,
            addressCountry: "SA",
          },
          geo: {
            "@type": "GeoCoordinates",
            latitude: SITE.lat,
            longitude: SITE.lng,
          },
          sameAs: [SITE.instagram, SITE.x, SITE.tiktok],
        }),
      },
    ],
  }),
  component: AboutPage,
});

type AboutSection = {
  id: string;
  section_key: string;
  title_ar: string | null;
  title_en: string | null;
  body_ar: string | null;
  body_en: string | null;
  sort_order: number;
};

function AboutPage() {
  const { t, lang } = useI18n();
  const { data: sections } = useQuery({
    queryKey: ["about_sections"],
    queryFn: async (): Promise<AboutSection[]> => {
      const { data, error } = await supabase
        .from("about_sections")
        .select("id, section_key, title_ar, title_en, body_ar, body_en, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const heroSub = sections?.find((s) => s.section_key === "hero_subtitle");
  const paragraphs = (sections ?? []).filter((s) => s.section_key !== "hero_subtitle");

  return (
    <div>
      <section className="hero-gradient text-white py-16">
        <div className="container-app">
          <h1 className="text-4xl md:text-5xl font-extrabold">{t("about_title")}</h1>
          <p className="mt-3 max-w-2xl text-white/90">
            {(lang === "ar" ? heroSub?.body_ar : heroSub?.body_en) ??
              (lang === "ar"
                ? "منشأة صحية خاصة معتمدة من هيئة CBAHI."
                : "A CBAHI-accredited private healthcare facility.")}
          </p>
        </div>
      </section>

      <section className="container-app py-16 grid gap-10 md:grid-cols-2 items-start">
        <div className="space-y-6 text-sm leading-7 text-foreground/90">
          {paragraphs.map((p) => {
            const title = lang === "ar" ? p.title_ar : p.title_en;
            const body = lang === "ar" ? p.body_ar : p.body_en;
            if (!body) return null;
            return (
              <div key={p.id}>
                {title && <h2 className="text-base font-semibold mb-2">{title}</h2>}
                <p>{body}</p>
              </div>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {[
            { icon: ShieldCheck, l: lang === "ar" ? "اعتماد CBAHI" : "CBAHI Accreditation" },
            { icon: Users, l: lang === "ar" ? "فريق تخصصي" : "Specialist team" },
            { icon: Award, l: lang === "ar" ? "جودة عالية" : "Quality-first" },
            { icon: MapPin, l: lang === "ar" ? SITE.addressAr : SITE.addressEn },
          ].map((f) => (
            <div key={f.l} className="rounded-2xl border border-border bg-card p-5">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="mt-3 font-semibold text-sm">{f.l}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
