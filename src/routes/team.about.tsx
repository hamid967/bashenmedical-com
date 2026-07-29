/**
 * /team/about — Sub-route under the team section.
 * Minimal page used to verify header/footer active-state behavior
 * on nested /team paths (prefix match).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/team/about")({
  head: () => ({
    meta: [
      { title: "عن الفريق | فريق العمل — مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "تعرّف على فريق العمل في مجمع باعشن الطبي — الرسالة والقيم والخبرات.",
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

function TeamAboutPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  return (
    <main className="container mx-auto px-4 py-12">
      <nav className="text-sm text-muted-foreground mb-4">
        <Link to="/team" className="hover:text-primary">
          {isAr ? "فريق العمل" : "Our Team"}
        </Link>
        <span className="mx-2">/</span>
        <span>{isAr ? "عن الفريق" : "About the Team"}</span>
      </nav>
      <h1 className="text-3xl font-bold text-foreground">
        {isAr ? "عن فريق العمل" : "About Our Team"}
      </h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        {isAr
          ? "نبذة عن فريق مجمع باعشن الطبي، رسالته وقيمه وخبراته المتنوعة."
          : "About the Bashen Medical team — our mission, values, and expertise."}
      </p>
    </main>
  );
}
