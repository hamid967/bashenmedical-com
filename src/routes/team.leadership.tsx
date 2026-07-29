/**
 * /team/leadership — Sub-route under the team section.
 * Kept intentionally minimal; primarily used to verify header/footer
 * active-state behavior on nested /team paths.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/team/leadership")({
  head: () => ({
    meta: [
      { title: "الإدارة التنفيذية | فريق العمل — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "الإدارة التنفيذية والقيادات في مجمع باعشن الطبي — الرؤية والحوكمة.",
      },
      { property: "og:title", content: "الإدارة التنفيذية | مجمع باعشن الطبي" },
      {
        property: "og:description",
        content: "قيادات مجمع باعشن الطبي وأدوارهم التنفيذية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadershipPage,
});

function LeadershipPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  return (
    <main className="container mx-auto px-4 py-12">
      <nav className="text-sm text-muted-foreground mb-4">
        <Link to="/team" className="hover:text-primary">
          {isAr ? "فريق العمل" : "Our Team"}
        </Link>
        <span className="mx-2">/</span>
        <span>{isAr ? "الإدارة التنفيذية" : "Leadership"}</span>
      </nav>
      <h1 className="text-3xl font-bold text-foreground">
        {isAr ? "الإدارة التنفيذية" : "Executive Leadership"}
      </h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        {isAr
          ? "قيادات مجمع باعشن الطبي المسؤولة عن الحوكمة والاستراتيجية والجودة."
          : "The leadership team responsible for governance, strategy, and quality at Bashen Medical."}
      </p>
    </main>
  );
}
