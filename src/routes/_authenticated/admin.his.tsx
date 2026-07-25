import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical, Pill, Scan, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/his")({
  head: () => ({
    meta: [
      { title: "منظومة HIS | لوحة الإدارة" },
      { name: "description", content: "لوحة منظومة معلومات المستشفى: صيدلية، مختبر، أشعة." },
      { property: "og:title", content: "منظومة HIS | لوحة الإدارة" },
      { property: "og:description", content: "روابط سريعة لوحدات HIS الأساسية." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HISHub,
});

const MODULES = [
  {
    to: "/pharmacy-management",
    title: "الصيدلية",
    desc: "المخزون، حركات المخزون، مراجعة وصرف الوصفات",
    Icon: Pill,
    accent: "from-emerald-500/20 to-emerald-500/5",
  },
  {
    to: "/admin/lab",
    title: "المختبر",
    desc: "إدخال نتائج التحاليل وإطلاقها للمرضى",
    Icon: FlaskConical,
    accent: "from-sky-500/20 to-sky-500/5",
  },
  {
    to: "/admin/radiology",
    title: "الأشعة",
    desc: "رفع تقارير الأشعة وإدارة إطلاقها",
    Icon: Scan,
    accent: "from-fuchsia-500/20 to-fuchsia-500/5",
  },
] as const;

function HISHub() {
  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">منظومة HIS</h1>
          <p className="text-sm text-muted-foreground">وحدات الصيدلية والمختبر والأشعة</p>
        </div>
        <Link to="/admin" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> الرجوع للوحة
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map(({ to, title, desc, Icon, accent }) => (
          <Link
            key={to}
            to={to}
            className={`glass-card rounded-2xl p-5 bg-gradient-to-br ${accent} hover:shadow-lg transition-all`}
          >
            <div className="flex items-start justify-between">
              <Icon className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mt-3 text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
