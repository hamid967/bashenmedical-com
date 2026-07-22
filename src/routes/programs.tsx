import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  HeartPulse,
  Building2,
  Home,
  Baby,
  Plane,
  Video,
  Activity,
  ShieldPlus,
  Users,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { PageHero } from "@/components/PageShell";
import { bmcOgImageMeta } from "@/lib/og-meta";
import i18n from "@/lib/i18n/config";

const SITE_URL = "https://bashenmedical.com";
const PAGE_URL = `${SITE_URL}/programs`;

type ApplyTo =
  | "/book"
  | "/corporate"
  | "/home-care"
  | "/second-opinion"
  | "/telemedicine"
  | "/international-patients"
  | "/packages"
  | "/emergency";

type SecondaryTo = "/contact" | "/faq" | "/packages" | "/specialties";

type ProgramMeta = {
  id: string;
  Icon: React.ComponentType<{ className?: string }>;
  applyTo: ApplyTo;
  secondaryTo?: SecondaryTo;
};

// Only structural/link/icon data lives in code. All copy lives in
// src/locales/{ar,en,ur}/programs.json under `items.<id>`.
const PROGRAMS: ProgramMeta[] = [
  { id: "executive-health", Icon: HeartPulse, applyTo: "/packages", secondaryTo: "/specialties" },
  { id: "corporate-wellness", Icon: Building2, applyTo: "/corporate", secondaryTo: "/contact" },
  { id: "home-care", Icon: Home, applyTo: "/home-care", secondaryTo: "/faq" },
  { id: "maternal-child", Icon: Baby, applyTo: "/book", secondaryTo: "/specialties" },
  { id: "chronic-care", Icon: Activity, applyTo: "/book", secondaryTo: "/packages" },
  { id: "second-opinion", Icon: ShieldPlus, applyTo: "/second-opinion", secondaryTo: "/faq" },
  { id: "telemedicine", Icon: Video, applyTo: "/telemedicine", secondaryTo: "/specialties" },
  { id: "international", Icon: Plane, applyTo: "/international-patients", secondaryTo: "/contact" },
];

export const Route = createFileRoute("/programs")({
  head: () => {
    // Head runs outside React; read translations directly from the i18n
    // instance using the current language so meta reflects the active locale.
    const t = i18n.getFixedT(i18n.language || "ar", "programs");
    const TITLE = t("seo.title");
    const DESC = t("seo.description");
    return {
      meta: [
        ...bmcOgImageMeta(),
        { title: TITLE },
        { name: "description", content: DESC },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESC },
        { property: "og:type", content: "website" },
        { property: "og:url", content: PAGE_URL },
        { property: "og:locale", content: i18n.language === "en" ? "en_US" : "ar_SA" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: TITLE },
        { name: "twitter:description", content: DESC },
      ],
      links: [{ rel: "canonical", href: PAGE_URL }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            itemListElement: PROGRAMS.map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: t(`items.${p.id}.title`),
              url: `${PAGE_URL}#${p.id}`,
            })),
          }),
        },
      ],
    };
  },
  component: ProgramsPage,
});

function ProgramsPage() {
  const { t } = useTranslation("programs");

  return (
    <div>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        subtitle={t("hero.subtitle")}
      />

      {/* Quick nav */}
      <section className="container-app -mt-6 mb-10">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {PROGRAMS.map((p) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary"
              >
                <p.Icon className="h-3.5 w-3.5" />
                {t(`items.${p.id}.title`)}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Programs */}
      <section className="container-app space-y-6 pb-16">
        {PROGRAMS.map((p, idx) => {
          const benefits = t(`items.${p.id}.benefits`, { returnObjects: true }) as string[];
          const services = t(`items.${p.id}.services`, { returnObjects: true }) as string[];
          return (
            <article
              key={p.id}
              id={p.id}
              className="scroll-mt-24 rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm"
            >
              <div className="grid gap-6 md:grid-cols-[auto,1fr] md:items-start">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <p.Icon className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span>{t("labels.programNumber", { n: String(idx + 1).padStart(2, "0") })}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {t(`items.${p.id}.audience`)}
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold leading-tight">
                    {t(`items.${p.id}.title`)}
                  </h2>
                  <p className="mt-2 text-muted-foreground leading-7">
                    {t(`items.${p.id}.tagline`)}
                  </p>

                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold mb-2">{t("labels.benefitsTitle")}</h3>
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        {benefits.map((b) => (
                          <li key={b} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary flex-shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold mb-2">{t("labels.servicesTitle")}</h3>
                      <div className="flex flex-wrap gap-2">
                        {services.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium text-foreground/80"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      to={p.applyTo}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      {t(`items.${p.id}.applyLabel`)}
                      <ArrowLeft className="h-4 w-4" />
                    </Link>
                    {p.secondaryTo && (
                      <Link
                        to={p.secondaryTo}
                        className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted"
                      >
                        {t(`items.${p.id}.secondaryLabel`)}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* CTA */}
      <section className="container-app pb-16">
        <div className="rounded-3xl bg-gradient-to-br from-primary to-accent p-8 md:p-10 text-primary-foreground text-center">
          <h2 className="text-2xl md:text-3xl font-bold">{t("cta.title")}</h2>
          <p className="mt-2 text-primary-foreground/90 max-w-2xl mx-auto">
            {t("cta.subtitle")}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center rounded-lg bg-background text-foreground px-5 py-2.5 text-sm font-semibold hover:bg-background/90"
            >
              {t("cta.contact")}
            </Link>
            <Link
              to="/book"
              className="inline-flex items-center rounded-lg border border-primary-foreground/40 px-5 py-2.5 text-sm font-semibold hover:bg-primary-foreground/10"
            >
              {t("cta.book")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
