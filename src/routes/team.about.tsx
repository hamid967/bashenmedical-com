/**
 * /team/about — رسالة فريق العمل وقيمه.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, HeartPulse, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { TEAM_VALUES } from "@/lib/team-roster";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/team/about")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "عن الفريق | فريق العمل — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "تعرّف على فريق العمل في مجمع باعشن الطبي — الرسالة والقيم والخبرات في صبيا، جازان.",
      },
      { property: "og:title", content: "عن الفريق | مجمع باعشن الطبي" },
      {
        property: "og:description",
        content: "نبذة عن فريق مجمع باعشن الطبي ورسالته وقيمه.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamAboutPage,
});

const ICONS = [ShieldCheck, HeartPulse, Sparkles, Users];

function TeamAboutPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <main className="min-h-dvh bg-muted/30" dir={isAr ? "rtl" : "ltr"}>
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <div className="container-app py-14 md:py-18">
          <nav className="mb-4 text-sm text-muted-foreground">
            <Link to="/team" className="hover:text-primary">
              {isAr ? "فريق العمل" : "Our Team"}
            </Link>
            <span className="mx-2">/</span>
            <span>{isAr ? "عن الفريق" : "About the Team"}</span>
          </nav>
          <h1 className="text-3xl font-bold md:text-4xl">
            {isAr ? "عن فريق العمل" : "About Our Team"}
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground leading-7">
            {isAr
              ? "يجمع مجمع باعشن الطبي استشاريين وإدارة تشغيلية وتقنية في منظومة واحدة — من الحجز الرقمي بعد التسجيل حتى المتابعة السريرية في صبيا، جازان."
              : "Baeshen Medical Complex unites consultants with operations and technology — from digital booking after sign-in to clinical follow-up in Sabya, Jazan."}
          </p>
        </div>
      </section>

      <div className="container-app space-y-12 py-12">
        <section>
          <h2 className="text-xl font-bold">{isAr ? "رسالتنا" : "Our mission"}</h2>
          <p className="mt-3 max-w-3xl text-muted-foreground leading-7">
            {isAr
              ? "تقديم رعاية طبية آمنة ومعتمدة، بتجربة واضحة للمريض وعائلة، وبهوية جازانية دافئة ومعايير وطنية للجودة."
              : "Deliver safe, accredited care with a clear patient journey, warm Jazan character, and national quality standards."}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold">{isAr ? "قيمنا" : "Our values"}</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {TEAM_VALUES.map((v, i) => {
              const Icon = ICONS[i % ICONS.length];
              const c = isAr ? v.ar : v.en;
              return (
                <li key={c.t} className="rounded-2xl border border-border bg-card p-5">
                  <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">{c.t}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-6">{c.d}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/team"
            className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {isAr ? "عرض الفريق الطبي" : "View medical team"}
          </Link>
          <Link
            to="/team/leadership"
            className="inline-flex rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold"
          >
            {isAr ? "الإدارة التنفيذية" : "Leadership"}
          </Link>
        </div>
      </div>
    </main>
  );
}
