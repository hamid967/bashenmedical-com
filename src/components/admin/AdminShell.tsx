import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { AdminNotificationsBell } from "./AdminNotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Stethoscope,
  UserCog,
  ClipboardList,
  ShieldCheck,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  ArchiveRestore,
  MessageSquare,
  Building2,
  Package,
  FileBarChart,
  Gauge,
  Inbox,
} from "lucide-react";

export type AdminRole = "admin" | "super_admin" | "reception" | "doctor" | "nurse" | "hr" | "pharmacy";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AdminRole[]; // undefined = visible to all admin-console roles
  search?: Record<string, unknown>;
};

type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "عام",
    items: [
      { to: "/admin", label: "لوحة القيادة", icon: LayoutDashboard },
    ],
  },
  {
    title: "العمليات",
    items: [
      { to: "/admin/inbox", label: "الصندوق الموحد", icon: Inbox, roles: ["admin", "super_admin", "reception"] },
      { to: "/appointments-queue", label: "طابور المواعيد", icon: CalendarCheck, roles: ["admin", "reception", "doctor"] },
      { to: "/calendar", label: "التقويم", icon: CalendarCheck },
      { to: "/patients-management", label: "المرضى", icon: Users, roles: ["admin", "reception", "doctor", "nurse"] },
      { to: "/orders-unified", label: "الطلبات الموحدة", icon: Package, roles: ["admin", "reception", "pharmacy"] },
      { to: "/complaints-admin", label: "الشكاوى", icon: MessageSquare, roles: ["admin", "reception"] },
      { to: "/admin/service-inquiries", label: "طلبات الواتساب", icon: MessageSquare, roles: ["admin", "reception"] },
    ],
  },
  {
    title: "الطاقم الطبي",
    items: [
      { to: "/doctors-management", label: "الأطباء والتخصصات", icon: Stethoscope, roles: ["admin", "hr"] },
      { to: "/availability-management", label: "جدولة التوفر", icon: ClipboardList, roles: ["admin", "hr"] },
      { to: "/nurses", label: "التمريض", icon: UserCog, roles: ["admin", "hr", "nurse"] },
    ],
  },
  {
    title: "الموارد البشرية",
    items: [
      { to: "/hr-management", label: "الموظفون والحضور", icon: Users, roles: ["admin", "hr"] },
    ],
  },
  {
    title: "المحتوى والتشغيل",
    items: [
      { to: "/inventory-management", label: "المخزون", icon: ArchiveRestore, roles: ["admin", "pharmacy"] },
      { to: "/pharmacy-management", label: "الصيدلية", icon: ArchiveRestore, roles: ["admin", "pharmacy"] },
      { to: "/corporate-admin", label: "الشركات", icon: Building2, roles: ["admin"] },
      { to: "/reports", label: "التقارير", icon: FileBarChart, roles: ["admin"] },
    ],
  },
  {
    title: "الحوكمة",
    items: [
      { to: "/rbac", label: "الأدوار والصلاحيات", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/role-permissions-matrix", label: "مصفوفة الصلاحيات (عرض)", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/super/monitoring", label: "صحة النظام (Super)", icon: Gauge, roles: ["admin"] },
      { to: "/admin/web-vitals", label: "Web Vitals", icon: Gauge, roles: ["admin"] },
      { to: "/admin/reservations-usage", label: "استخدام إدارة الحجوزات", icon: Gauge, roles: ["admin"] },
      { to: "/admin/notification-logs", label: "سجلات الإشعارات", icon: Bell, roles: ["admin"] },
      { to: "/admin/nphies-logs", label: "سجلات التأمين (NPHIES)", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/no-show-risk", label: "توقّع الغياب (Predictive)", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/no-show-stats", label: "إحصاءات عدم الحضور", icon: FileBarChart, roles: ["admin"] },
      { to: "/admin/visual-analytics", label: "لوحة تحليلات بصرية", icon: FileBarChart, roles: ["admin"] },
      { to: "/admin/no-show-detail", label: "المواعيد عالية المخاطرة", icon: FileBarChart, roles: ["admin"] },
      { to: "/admin/super/permissions", label: "مصفوفة الصلاحيات (Super)", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/super/jazan-visual", label: "الهوية البصرية جازان (Super)", icon: Settings, roles: ["admin"] },
      { to: "/audit-log", label: "سجل التدقيق", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/audit-logs", label: "Audit Logs (بحث متقدم)", icon: ShieldCheck, roles: ["admin"] },
      { to: "/clinic-settings", label: "إعدادات المجمع", icon: Settings, roles: ["admin"] },
      { to: "/admin/service-catalog", label: "كتالوج الخدمات", icon: Settings, roles: ["admin"] },
      { to: "/admin/classic", label: "النسخة الكلاسيكية", icon: Settings, roles: ["admin"] },
    ],
  },
];

function filterNav(roles: AdminRole[]): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r))),
  })).filter((g) => g.items.length > 0);
}

export function AdminShell({
  children,
  roles,
  userName,
  unreadCount = 0,
}: {
  children: React.ReactNode;
  roles: AdminRole[];
  userName?: string | null;
  unreadCount?: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const groups = filterNav(roles);

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="admin-console min-h-dvh flex" dir="rtl">
      {/* Sidebar */}
      <aside
        className={[
          "fixed lg:sticky top-0 z-40 h-dvh w-72 shrink-0 border-e",
          "bg-[color:var(--ac-surface)] border-[color:var(--ac-line)]",
          "transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-[color:var(--ac-line)]">
          <Link to="/admin" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl grid place-items-center bg-[color:var(--ac-accent)] text-white font-bold">
              ب
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold">مركز باعشن</div>
              <div className="text-[11px] text-[color:var(--ac-ink-3)]">لوحة الإدارة</div>
            </div>
          </Link>
          <button
            className="lg:hidden p-2 rounded-md hover:bg-[color:var(--ac-subtle)]"
            onClick={() => setMobileOpen(false)}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-3 space-y-5 overflow-y-auto h-[calc(100dvh-4rem)]">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ac-muted)]">
                {g.title}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const active =
                    item.to === "/admin"
                      ? pathname === "/admin"
                      : pathname === item.to || pathname.startsWith(item.to + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className={[
                          "flex items-center gap-3 px-3 h-10 rounded-lg text-sm transition-colors",
                          active
                            ? "bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent-ink)] font-semibold"
                            : "text-[color:var(--ac-ink-2)] hover:bg-[color:var(--ac-subtle)]",
                        ].join(" ")}
                      >
                        <Icon className="h-4 w-4 opacity-80" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 sticky top-0 z-20 bg-[color:var(--ac-surface)]/90 backdrop-blur border-b border-[color:var(--ac-line)] flex items-center gap-3 px-4 lg:px-6">
          <button
            className="lg:hidden p-2 rounded-md hover:bg-[color:var(--ac-subtle)]"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <AdminNotificationsBell />

          <div className="hidden sm:flex items-center gap-2 pe-1 ps-3 border-s border-[color:var(--ac-line)]">
            <div className="text-end leading-tight">
              <div className="text-sm font-semibold">{userName ?? "مستخدم"}</div>
              <div className="text-[11px] text-[color:var(--ac-ink-3)]">{roles.join(" · ") || "بدون دور"}</div>
            </div>
            <div className="h-9 w-9 rounded-full bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent-ink)] grid place-items-center font-bold">
              {(userName ?? "?").slice(0, 1)}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-md hover:bg-[color:var(--ac-subtle)] text-[color:var(--ac-ink-2)]"
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
