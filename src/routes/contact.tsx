import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { SITE, whatsappUrl } from "@/lib/site";
import { Phone, Mail, MapPin, MessageCircle } from "lucide-react";
import {
  buildLocalBusinessSchema,
  buildBreadcrumbs,
  SITE_URL,
} from "@/lib/localBusinessSchema";
import { clinicSettingsQuery, type ClinicSettings } from "@/lib/clinicSettings";
import { PageHero } from "@/components/PageShell";

const CONTACT_URL = `${SITE_URL}/contact`;

export const Route = createFileRoute("/contact")({
  loader: ({ context }) => context.queryClient.ensureQueryData(clinicSettingsQuery()),
  head: ({ loaderData }) => ({
    meta: [
      { title: "تواصل معنا | مجمع باعشن الطبي — صبيا، جازان" },
      {
        name: "description",
        content:
          "أرقام التواصل، البريد الإلكتروني، والموقع على الخريطة لمجمع باعشن الطبي في صبيا، جازان. متاحون 7 أيام أسبوعياً.",
      },
      { property: "og:title", content: "تواصل معنا — مجمع باعشن الطبي" },
      {
        property: "og:description",
        content: "اتصل بنا أو راسلنا واتساب — مجمع باعشن الطبي بصبيا، جازان.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CONTACT_URL },
      { property: "og:locale", content: "ar_SA" },
    ],
    links: [{ rel: "canonical", href: CONTACT_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildLocalBusinessSchema({
            pageUrl: CONTACT_URL,
            settings: loaderData as ClinicSettings | undefined,
          }),
        ),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(
          buildBreadcrumbs([
            { name: "الرئيسية", path: "/" },
            { name: "تواصل معنا", path: "/contact" },
          ]),
        ),
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { t, lang } = useI18n();
  return (
    <div className="container-app py-12">
      <h1 className="text-4xl font-bold">{t("contact_title")}</h1>
      <p className="mt-2 text-muted-foreground">
        {lang === "ar" ? "نحن هنا للإجابة على استفساراتك." : "We're here to answer your questions."}
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {[
          {
            icon: Phone,
            l: SITE.phoneDisplay,
            href: `tel:${SITE.phone}`,
            sub: lang === "ar" ? "هاتف الاستقبال" : "Reception",
          },
          {
            icon: MessageCircle,
            l: "WhatsApp",
            href: whatsappUrl(lang === "ar" ? `مرحبًا ${SITE.nameAr}، أرغب في الاستفسار عن خدماتكم.` : `Hello ${SITE.nameEn}, I'd like to inquire about your services.`),
            sub: SITE.mobileDisplay,
          },
          {
            icon: Mail,
            l: SITE.email,
            href: `mailto:${SITE.email}`,
            sub: lang === "ar" ? "البريد الإلكتروني" : "Email",
          },
        ].map((c) => (
          <a
            key={c.l}
            href={c.href}
            className="rounded-2xl border border-border bg-card p-6 hover:border-primary transition"
          >
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary grid place-items-center">
              <c.icon className="h-6 w-6" />
            </div>
            <div className="mt-4 font-bold">{c.l}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.sub}</div>
          </a>
        ))}
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2 items-start">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-primary mt-1" />
            <div>
              <div className="font-bold">{lang === "ar" ? "العنوان" : "Address"}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {lang === "ar" ? SITE.addressAr : SITE.addressEn}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {lang === "ar" ? `الرمز البريدي ${SITE.postalCode}` : `Postal ${SITE.postalCode}`}
              </p>
              <a
                href={SITE.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                {lang === "ar" ? "فتح الخريطة" : "Open in Maps"}
              </a>
            </div>
          </div>
        </div>
        <div className="aspect-video rounded-2xl overflow-hidden border border-border">
          <iframe
            title="map"
            className="w-full h-full"
            loading="lazy"
            src={`https://maps.google.com/maps?q=${SITE.lat},${SITE.lng}&z=15&output=embed`}
          />
        </div>
      </div>
    </div>
  );
}
