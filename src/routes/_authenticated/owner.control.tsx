import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOwnerOverview } from "@/lib/owner/overview.functions";
import {
  LayoutDashboard,
  Stethoscope,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Layers,
  Inbox,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/owner/control")({
  head: () => ({
    meta: [
      { title: "مركز التحكم · Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OwnerControlHub,
});

type HubLink = {
  to: string;
  title: string;
  desc: string;
  icon: typeof Stethoscope;
  kpi?: (k: Awaited<ReturnType<typeof getOwnerOverview>>) => string;
  color: string;
};

const LINKS: ReadonlyArray<HubLink> = [
  {
    to: "/owner/services",
    title: "الخدمات الإلكترونية",
    desc: "كتالوج بوابة /services والاستفسارات — تفعيل، ترتيب، روابط.",
    icon: Stethoscope,
    kpi: (k) => `${k.services_portal} في البوابة · ${k.services_active} نشِط`,
    color: "bg-rose-50 text-rose-600",
  },
  {
    to: "/owner/specialties",
    title: "التخصصات الطبية",
    desc: "إضافة وتعديل التخصصات الظاهرة في الحجز والدليل.",
    icon: Layers,
    kpi: (k) => `${k.specialties_active} نشِط من ${k.specialties_total}`,
    color: "bg-sky-50 text-sky-600",
  },
  {
    to: "/owner/excellence",
    title: "مراكز التميز",
    desc: "إدارة مراكز التميز والصور والأوصاف على الصفحة الرئيسية.",
    icon: Sparkles,
    kpi: (k) => `${k.excellence_active} نشِط من ${k.excellence_total}`,
    color: "bg-amber-50 text-amber-600",
  },
  {
    to: "/owner/pages",
    title: "الصفحات",
    desc: "صفحات ديناميكية بروابط وSEO مستقل.",
    icon: FileText,
    kpi: (k) => `${k.pages_published} منشور · ${k.pages_total} إجمالي`,
    color: "bg-blue-50 text-blue-600",
  },
  {
    to: "/owner/media",
    title: "مكتبة الوسائط",
    desc: "رفع وتنظيم الصور لاستخدامها في الصفحات والخدمات.",
    icon: ImageIcon,
    kpi: (k) => `${k.media_total} ملف`,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    to: "/admin/service-inquiries",
    title: "طلبات العملاء",
    desc: "استفسارات واتساب الواردة من كتالوج الخدمات.",
    icon: Inbox,
    color: "bg-cyan-50 text-cyan-600",
  },
];

function OwnerControlHub() {
  const fn = useServerFn(getOwnerOverview);
  const q = useQuery({ queryKey: ["owner", "overview"], queryFn: () => fn() });

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto" dir="rtl">
      <header className="mb-8">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-3 py-1 mb-3">
          <LayoutDashboard className="h-3.5 w-3.5" />
          مركز التحكم الكامل
        </div>
        <h1 className="text-3xl font-bold text-slate-900">تحكم بخدمات الموقع</h1>
        <p className="mt-2 text-slate-600 max-w-2xl">
          من هنا تدير كل ما يظهر للزائر: الخدمات الإلكترونية، التخصصات، مراكز التميز، الصفحات،
          والوسائط — دون تعديل الكود.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi label="خدمات البوابة" value={q.data?.services_portal} loading={q.isLoading} />
        <Kpi label="تخصصات نشِطة" value={q.data?.specialties_active} loading={q.isLoading} />
        <Kpi label="مراكز تميز" value={q.data?.excellence_active} loading={q.isLoading} />
        <Kpi label="صفحات منشورة" value={q.data?.pages_published} loading={q.isLoading} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {LINKS.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.to}
              to={m.to}
              className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-400 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`h-12 w-12 rounded-xl grid place-items-center ${m.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <ArrowLeft className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900 group-hover:text-blue-600">
                {m.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{m.desc}</p>
              {m.kpi && q.data ? (
                <p className="mt-3 text-xs font-semibold text-slate-500">{m.kpi(q.data)}</p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
}: {
  label: string;
  value?: number;
  loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
        {loading ? "…" : (value ?? "—")}
      </div>
    </div>
  );
}
