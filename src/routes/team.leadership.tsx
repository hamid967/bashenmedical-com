/**
 * /team/leadership — الأدوار القيادية العامة (بدون أسماء شخصية للخصوصية).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LEADERSHIP_ROLES } from "@/lib/team-roster";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/team/leadership")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الإدارة التنفيذية | فريق العمل — مجمع باعشن الطبي" },
      {
        name: "description",
        content: "الإدارة التنفيذية والقيادات في مجمع باعشن الطبي — الرؤية والحوكمة والجودة.",
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0] ?? "")
      .join("")
      .toUpperCase() || "؟"
  );
}

function LeadershipPage() {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <main className="min-h-dvh bg-muted/30" dir={isAr ? "rtl" : "ltr"}>
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <div className="container-app py-14">
          <nav className="mb-4 text-sm text-muted-foreground">
            <Link to="/team" className="hover:text-primary">
              {isAr ? "فريق العمل" : "Our Team"}
            </Link>
            <span className="mx-2">/</span>
            <span>{isAr ? "الإدارة التنفيذية" : "Leadership"}</span>
          </nav>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Briefcase className="h-3.5 w-3.5" />
            {isAr ? "الحوكمة والتشغيل" : "Governance & operations"}
          </div>
          <h1 className="text-3xl font-bold md:text-4xl">
            {isAr ? "الإدارة التنفيذية" : "Executive Leadership"}
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground leading-7">
            {isAr
              ? "الأدوار القيادية المسؤولة عن الاستراتيجية والجودة والعمليات اليومية وخدمة المريض — تُعرض كمناصب عامة حفاظًا على الخصوصية."
              : "Leadership roles for strategy, quality, operations, and patient experience — shown as public roles for privacy."}
          </p>
        </div>
      </section>

      <div className="container-app py-12">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEADERSHIP_ROLES.map((r) => {
            const name = isAr ? r.ar : r.en;
            const desc = isAr ? r.desc_ar : r.desc_en;
            return (
              <li
                key={r.key}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-2 ring-primary/20">
                  {initials(name)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">{name}</div>
                  <p className="mt-1 text-sm text-muted-foreground leading-6">{desc}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-xs text-muted-foreground">
          {isAr
            ? "الأسماء الشخصية للإدارة تُعرض داخل بوابة الموظفين ولا تُنشر علنًا حفاظًا على الخصوصية."
            : "Individual leadership names are shown inside the staff portal and not published publicly."}
        </p>

        <div className="mt-6">
          <Link to="/team" className="text-sm font-semibold text-primary hover:underline">
            {isAr ? "← العودة لفريق العمل" : "← Back to Our Team"}
          </Link>
        </div>
      </div>
    </main>
  );
}
