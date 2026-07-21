import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { getMyOwnerStatus } from "@/lib/owner.functions";
import {
  LayoutDashboard,
  FileText,
  Palette,
  Image as ImageIcon,
  Menu as MenuIcon,
  Stethoscope,
  Inbox,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/owner")({
  beforeLoad: async () => {
    try {
      const status = await getMyOwnerStatus();
      if (!status.hasAccess) throw redirect({ to: "/portal" });
      return { ownerStatus: status };
    } catch (e) {
      if ((e as any)?.isRedirect) throw e;
      throw redirect({ to: "/portal" });
    }
  },
  loader: ({ context }) => ({ ownerStatus: (context as any).ownerStatus }),
  head: () => ({
    meta: [
      { title: "Site Builder | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OwnerLayout,
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-6 bg-slate-50" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl shadow p-8 text-center">
        <h2 className="text-xl font-bold text-red-600">تعذّر تحميل لوحة المالك</h2>
        <p className="mt-2 text-sm text-slate-600">{error?.message ?? "خطأ غير معروف"}</p>
        <Link to="/portal" className="mt-6 inline-block text-sm text-slate-700 underline">
          العودة إلى البوابة
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-center text-slate-600" dir="rtl">الصفحة غير موجودة</div>
  ),
});

const NAV: ReadonlyArray<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}> = [
  { to: "/owner", label: "الرئيسية", icon: LayoutDashboard, exact: true },
  { to: "/owner/pages", label: "الصفحات", icon: FileText },
  { to: "/owner/content", label: "المحتوى", icon: Palette },
  { to: "/owner/media", label: "الوسائط", icon: ImageIcon },
  { to: "/owner/navigation", label: "القوائم", icon: MenuIcon },
  { to: "/owner/services", label: "الخدمات", icon: Stethoscope },
  { to: "/owner/inquiries", label: "الطلبات", icon: Inbox },
];

function OwnerLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { ownerStatus } = Route.useLoaderData();
  const isEditor = ownerStatus?.level === "editor";

  return (
    <div className="min-h-dvh bg-slate-50 flex" dir="rtl">
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="p-5 border-b border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400">Site Builder</div>
          <div className="text-lg font-bold mt-1">
            {isEditor ? "محرر المحتوى" : "لوحة المالك"}
          </div>
          <div
            className={`mt-2 inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
              isEditor
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
            }`}
          >
            {isEditor ? "صلاحية تعديل فقط" : "صلاحية كاملة"}
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            العودة إلى الموقع
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
