import { createFileRoute, Link } from "@tanstack/react-router";
import { Briefcase, Heart, GraduationCap, Users } from "lucide-react";
import { PageHero, SectionCard } from "@/components/PageShell";
import { bmcOgImageMeta } from "@/lib/og-meta";

export const Route = createFileRoute("/careers")({
  head: () => ({
    meta: [
      ...bmcOgImageMeta(),
      { title: "الوظائف الشاغرة — مجمع باعشن الطبي" },
      { name: "description", content: "انضم إلى فريق مجمع باعشن الطبي — فرص وظيفية للأطباء والممرضين والفنيين والإداريين في محافظة صبيا." },
      { property: "og:title", content: "الوظائف — مجمع باعشن الطبي" },
      { property: "og:description", content: "فرص عمل في القطاع الطبي." },
      { property: "og:url", content: "https://bashenmedical.com/careers" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/careers" }],
  }),
  component: CareersPage,
});

const perks = [
  { icon: <Heart className="h-5 w-5" />, title: "تأمين طبي شامل", desc: "لك ولعائلتك بأفضل شركات التأمين." },
  { icon: <GraduationCap className="h-5 w-5" />, title: "تطوير مهني", desc: "دورات وشهادات معتمدة سنوياً." },
  { icon: <Users className="h-5 w-5" />, title: "بيئة عمل داعمة", desc: "فريق ودود وقيادة تُقدّر إسهامك." },
];

const openings = [
  { title: "أخصائي أشعة تشخيصية", type: "دوام كامل", dept: "الأشعة" },
  { title: "ممرض/ة تخدير", type: "دوام كامل", dept: "التمريض" },
  { title: "فني مختبر", type: "دوام كامل", dept: "المختبر" },
  { title: "أخصائي صيدلة سريرية", type: "دوام كامل", dept: "الصيدلية" },
  { title: "استشاري جراحة عامة", type: "زيارات", dept: "الجراحة" },
  { title: "موظف استقبال (لغة إنجليزية)", type: "دوام كامل", dept: "الإدارة" },
];

function CareersPage() {
  return (
    <>
      <PageHero
        eyebrow="انضم إلينا"
        title="ابنِ مسيرتك المهنية معنا"
        subtitle="نبحث دائماً عن كفاءات طبية وإدارية للانضمام إلى فريقنا. أرسل سيرتك الذاتية وسنتواصل عند توفر فرصة تناسبك."
      />
      <section className="container-app py-10">
        <div className="grid gap-5 md:grid-cols-3">
          {perks.map((p) => (
            <SectionCard key={p.title} icon={p.icon} title={p.title} desc={p.desc} />
          ))}
        </div>
      </section>
      <section className="container-app pb-14">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> الشواغر الحالية</h2>
        <div className="rounded-2xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-right">
                <th className="px-4 py-3 font-semibold">الوظيفة</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">القسم</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">النوع</th>
                <th className="px-4 py-3 font-semibold text-end">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {openings.map((o) => (
                <tr key={o.title} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{o.title}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{o.dept}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{o.type}</td>
                  <td className="px-4 py-3 text-end">
                    <Link to="/contact" className="text-primary font-semibold hover:underline">تقدّم →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          لا تجد الوظيفة المناسبة؟ أرسل سيرتك على{" "}
          <a href="mailto:careers@BaeshenMedical.sa" className="text-primary hover:underline font-semibold">careers@BaeshenMedical.sa</a>{" "}
          وسنتواصل عند توفر فرصة مناسبة.
        </p>
      </section>
    </>
  );
}
