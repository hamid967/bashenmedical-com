import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  Image as ImageIcon,
  Stethoscope,
  Sparkles,
  Layers,
  Gauge,
  Inbox,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/owner/")({
  head: () => ({
    meta: [
      { title: "لوحة المالك | Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OwnerHome,
});

type Mod = {
  to: string;
  ready: boolean;
  icon: typeof FileText;
  title: string;
  desc: string;
  color: string;
};

const MODULES: ReadonlyArray<Mod> = [
  {
    to: "/owner/control",
    ready: true,
    icon: Gauge,
    title: "مركز التحكم",
    desc: "لوحة شاملة بكل مؤشرات الخدمات والتخصصات ومراكز التميز.",
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    to: "/owner/services",
    ready: true,
    icon: Stethoscope,
    title: "الخدمات الإلكترونية",
    desc: "إدارة بوابة /services: الروابط، التصنيفات، التفعيل والترتيب.",
    color: "bg-rose-50 text-rose-600",
  },
  {
    to: "/owner/specialties",
    ready: true,
    icon: Layers,
    title: "التخصصات الطبية",
    desc: "إضافة وتعديل التخصصات الظاهرة في الحجز والدليل.",
    color: "bg-sky-50 text-sky-600",
  },
  {
    to: "/owner/excellence",
    ready: true,
    icon: Sparkles,
    title: "مراكز التميز",
    desc: "إدارة مراكز التميز والصور والأوصاف على الموقع.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    to: "/owner/pages",
    ready: true,
    icon: FileText,
    title: "إدارة الصفحات",
    desc: "إنشاء وتعديل صفحات ديناميكية برابط مخصص وSEO مستقل.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    to: "/owner/media",
    ready: true,
    icon: ImageIcon,
    title: "مكتبة الوسائط",
    desc: "رفع الصور والملفات وتنظيمها لإعادة الاستخدام.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    to: "/admin/service-inquiries",
    ready: true,
    icon: Inbox,
    title: "طلبات العملاء",
    desc: "متابعة استفسارات الواتساب الواردة من كتالوج الخدمات.",
    color: "bg-cyan-50 text-cyan-600",
  },
];

function OwnerHome() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-3 py-1 mb-3">
          <Sparkles className="h-3.5 w-3.5" />
          Site Builder
        </div>
        <h1 className="text-3xl font-bold text-slate-900">أهلاً بك في لوحة المالك</h1>
        <p className="mt-2 text-slate-600">
          مركز التحكم الكامل بالموقع — أدر الخدمات والتخصصات ومراكز التميز والصفحات من مكان واحد.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const body = (
            <>
              <div className="flex items-start justify-between mb-4">
                <div className={`h-12 w-12 rounded-xl grid place-items-center ${m.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-1 ${m.ready ? "text-emerald-700 bg-emerald-50" : "text-slate-400 bg-slate-100"}`}
                >
                  {m.ready ? "جاهز" : "قريباً"}
                </span>
              </div>
              <h3
                className={`text-lg font-bold ${m.ready ? "text-slate-900 group-hover:text-blue-600" : "text-slate-500"}`}
              >
                {m.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{m.desc}</p>
            </>
          );
          const cls = `group bg-white rounded-2xl border p-6 transition ${m.ready ? "border-slate-200 hover:border-blue-400 hover:shadow-lg" : "border-slate-100 opacity-60 cursor-not-allowed"}`;
          return m.ready ? (
            <Link key={m.to} to={m.to} className={cls}>
              {body}
            </Link>
          ) : (
            <div key={m.to} className={cls}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
