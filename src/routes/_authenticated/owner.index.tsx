import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  Palette,
  Image as ImageIcon,
  Menu as MenuIcon,
  Stethoscope,
  Inbox,
  Sparkles,
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

const MODULES = [
  {
    to: "/owner/pages",
    icon: FileText,
    title: "إدارة الصفحات",
    desc: "إنشاء وتعديل صفحات ديناميكية برابط مخصص وSEO مستقل.",
    status: "قريباً",
    color: "bg-blue-50 text-blue-600",
  },
  {
    to: "/owner/content",
    icon: Palette,
    title: "محرر المحتوى",
    desc: "تعديل نصوص وصور Hero و About و Services بدون كود.",
    status: "قريباً",
    color: "bg-purple-50 text-purple-600",
  },
  {
    to: "/owner/media",
    icon: ImageIcon,
    title: "مكتبة الوسائط",
    desc: "رفع الصور والملفات وتنظيمها لإعادة الاستخدام.",
    status: "قريباً",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    to: "/owner/navigation",
    icon: MenuIcon,
    title: "القوائم والتذييل",
    desc: "تعديل روابط Navbar و Footer وإعادة ترتيبها.",
    status: "قريباً",
    color: "bg-amber-50 text-amber-600",
  },
  {
    to: "/owner/services",
    icon: Stethoscope,
    title: "الخدمات الطبية",
    desc: "إضافة/تعديل/ترتيب الخدمات والأسعار والأوصاف.",
    status: "قريباً",
    color: "bg-rose-50 text-rose-600",
  },
  {
    to: "/owner/inquiries",
    icon: Inbox,
    title: "طلبات العملاء",
    desc: "متابعة استفسارات الواتساب والاتصالات الواردة.",
    status: "قريباً",
    color: "bg-cyan-50 text-cyan-600",
  },
] as const;

function OwnerHome() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-3 py-1 mb-3">
          <Sparkles className="h-3.5 w-3.5" />
          Site Builder v1
        </div>
        <h1 className="text-3xl font-bold text-slate-900">أهلاً بك في لوحة المالك</h1>
        <p className="mt-2 text-slate-600">
          مركز التحكم الكامل بالموقع — أدر الصفحات والمحتوى والخدمات من مكان واحد.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.to}
              to={m.to}
              className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-400 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`h-12 w-12 rounded-xl grid place-items-center ${m.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 rounded-full px-2 py-1">
                  {m.status}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600">
                {m.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{m.desc}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 bg-gradient-to-l from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
        <h2 className="text-lg font-bold">🚀 المرحلة القادمة</h2>
        <p className="mt-2 text-sm text-blue-100">
          سأبدأ بتنفيذ <strong>إدارة الصفحات</strong> و<strong>إدارة الخدمات</strong> أولاً — أخبرني عندما تكون جاهزاً للبدء.
        </p>
      </div>
    </div>
  );
}
