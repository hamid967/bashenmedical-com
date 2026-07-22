import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminNotificationsBell } from "@/components/admin/AdminNotificationsBell";
import { CommandPalette } from "./CommandPalette";
import { AIAssistantPanel } from "./AIAssistantPanel";
import { ThemeSwitcher, useAdminTheme } from "./ThemeSwitcher";
import { Breadcrumbs } from "./Breadcrumbs";
import { QuickActions } from "./QuickActions";
import type { AdminRole } from "@/components/admin/AdminShell";
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Stethoscope,
  UserCog,
  ClipboardList,
  ShieldCheck,
  Settings,
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
  Sparkles,
  Search,
  ChevronsRight,
  ChevronsLeft,
  Bell,
  Command as CommandIcon,
  FileText,
  Palette,
  Image as ImageIcon,
  Menu as MenuIcon,
  ScrollText,
  KeyRound,
  Activity,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AdminRole[];
};

type NavGroup = { title: string; items: NavItem[] };

// Unified navigation covering admin console, command-center, and site-builder.
// Roles gate each item; super_admin sees everything including Site Builder.
const NAV: NavGroup[] = [
  {
    title: "عام",
    items: [
      { to: "/admin", label: "لوحة القيادة", icon: LayoutDashboard },
      { to: "/command-center", label: "مركز التحكم الذكي", icon: CommandIcon, roles: ["admin", "super_admin"] },
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
      { to: "/admin/service-inquiries", label: "طلبات واتساب", icon: MessageSquare, roles: ["admin", "reception"] },
    ],
  },
  {
    title: "الطاقم الطبي",
    items: [
      { to: "/doctors-management", label: "الأطباء", icon: Stethoscope, roles: ["admin", "hr"] },
      { to: "/availability-management", label: "جدولة التوفر", icon: ClipboardList, roles: ["admin", "hr"] },
      { to: "/nurses", label: "التمريض", icon: UserCog, roles: ["admin", "hr", "nurse"] },
    ],
  },
  {
    title: "الموارد",
    items: [
      { to: "/hr-management", label: "الموظفون", icon: Users, roles: ["admin", "hr"] },
      { to: "/inventory-management", label: "المخزون", icon: ArchiveRestore, roles: ["admin", "pharmacy"] },
      { to: "/pharmacy-management", label: "الصيدلية", icon: ArchiveRestore, roles: ["admin", "pharmacy"] },
      { to: "/corporate-admin", label: "الشركات", icon: Building2, roles: ["admin"] },
      { to: "/reports", label: "التقارير", icon: FileBarChart, roles: ["admin"] },
    ],
  },
  {
    title: "منشئ الموقع",
    items: [
      { to: "/owner", label: "الرئيسية", icon: LayoutDashboard, roles: ["super_admin"] },
      { to: "/owner/pages", label: "الصفحات", icon: FileText, roles: ["super_admin"] },
      { to: "/owner/content", label: "المحتوى", icon: Palette, roles: ["super_admin"] },
      { to: "/owner/media", label: "الوسائط", icon: ImageIcon, roles: ["super_admin"] },
      { to: "/owner/navigation", label: "القوائم", icon: MenuIcon, roles: ["super_admin"] },
      { to: "/owner/services", label: "الخدمات", icon: Stethoscope, roles: ["super_admin"] },
      { to: "/owner/accounts", label: "الحسابات", icon: Users, roles: ["super_admin"] },
      { to: "/owner/settings", label: "إعدادات الموقع", icon: Settings, roles: ["super_admin"] },
      { to: "/owner/security", label: "الأمان (MFA)", icon: KeyRound, roles: ["super_admin"] },
      { to: "/owner/audit", label: "سجل النشاط", icon: ScrollText, roles: ["super_admin"] },
    ],
  },
  {
    title: "الحوكمة",
    items: [
      { to: "/rbac", label: "الأدوار", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/role-permissions-matrix", label: "مصفوفة الصلاحيات", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/audit-logs", label: "سجل التدقيق", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/web-vitals", label: "Web Vitals", icon: Gauge, roles: ["admin"] },
      { to: "/admin/visual-analytics", label: "تحليلات بصرية", icon: FileBarChart, roles: ["admin"] },
      { to: "/admin/notification-logs", label: "الإشعارات", icon: Bell, roles: ["admin"] },
      { to: "/admin/no-show-risk", label: "توقّع الغياب", icon: ShieldCheck, roles: ["admin"] },
      { to: "/admin/realtime-monitor", label: "مراقبة Realtime", icon: Gauge, roles: ["admin"] },
      { to: "/admin/ai-streaming", label: "AI Streaming", icon: Sparkles, roles: ["admin"] },
      { to: "/admin/ai-usage", label: "استخدام AI", icon: Sparkles, roles: ["admin"] },
      { to: "/admin/super/monitoring", label: "صحة النظام", icon: Gauge, roles: ["admin"] },
      { to: "/admin/services-health", label: "حالة الخدمات", icon: Activity, roles: ["admin"] },
      { to: "/clinic-settings", label: "الإعدادات", icon: Settings, roles: ["admin"] },
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

const SIDEBAR_STATE_KEY = "admin-console-sidebar-collapsed";

export function AdminShellV2({
  children,
  roles,
  userName,
}: {
  children: React.ReactNode;
  roles: AdminRole[];
  userName?: string | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState<string | undefined>(undefined);
  const { theme, toggle: toggleTheme } = useAdminTheme();

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const groups = filterNav(roles);

  // Load persisted sidebar state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
      if (saved) setCollapsed(saved === "1");
    } catch { /* ignore */ }
  }, []);

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_STATE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAiOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function askAI(q: string) {
    setAiPrompt(q);
    setAiOpen(true);
    // Reset the initial prompt shortly after so a re-open doesn't reuse it
    setTimeout(() => setAiPrompt(undefined), 200);
  }

  return (
    <div
      className={[
        "admin-console min-h-dvh flex",
        theme === "dark" ? "theme-dark" : "theme-light",
      ].join(" ")}
      dir="rtl"
    >
      {/* Sidebar */}
      <aside
        className={[
          "fixed lg:sticky top-0 z-40 h-dvh shrink-0 border-e transition-all duration-200 ease-out",
          collapsed ? "w-16" : "w-72",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        ].join(" ")}
        style={{
          background: "var(--ac-surface)",
          borderColor: "var(--ac-line)",
          backdropFilter: theme === "dark" ? "blur(14px) saturate(140%)" : undefined,
        }}
      >
        <div
          className="h-16 flex items-center justify-between px-4 border-b"
          style={{ borderColor: "var(--ac-line)" }}
        >
          <Link to="/admin" className="flex items-center gap-2 min-w-0">
            <div
              className="h-9 w-9 rounded-xl grid place-items-center text-white font-bold shrink-0"
              style={{ background: "var(--ac-accent)" }}
            >
              ب
            </div>
            {!collapsed && (
              <div className="leading-tight min-w-0">
                <div className="text-sm font-bold truncate" style={{ color: "var(--ac-ink)" }}>
                  مركز باعشن
                </div>
                <div className="text-[11px] truncate" style={{ color: "var(--ac-ink-3)" }}>
                  Hamed AI Command
                </div>
              </div>
            )}
          </Link>
          <button
            className="lg:hidden p-2 rounded-md hover:bg-black/5"
            onClick={() => setMobileOpen(false)}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" style={{ color: "var(--ac-ink-2)" }} />
          </button>
        </div>

        <nav
          className="p-2 space-y-4 overflow-y-auto"
          style={{ height: "calc(100dvh - 4rem - 3rem)" }}
        >
          {groups.map((g) => (
            <div key={g.title}>
              {!collapsed && (
                <div
                  className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--ac-muted)" }}
                >
                  {g.title}
                </div>
              )}
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
                        title={collapsed ? item.label : undefined}
                        className={[
                          "flex items-center gap-3 px-3 h-10 rounded-lg text-sm transition-colors",
                          collapsed ? "justify-center" : "",
                        ].join(" ")}
                        style={
                          active
                            ? {
                                background: "var(--ac-accent-soft)",
                                color: "var(--ac-accent-ink)",
                                fontWeight: 600,
                              }
                            : { color: "var(--ac-ink-2)" }
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Sidebar footer: collapse toggle (desktop only) */}
        <div
          className="hidden lg:flex h-12 items-center justify-center border-t"
          style={{ borderColor: "var(--ac-line)" }}
        >
          <button
            onClick={toggleCollapse}
            className="p-2 rounded-md hover:bg-black/5 transition"
            aria-label={collapsed ? "توسيع القائمة" : "طيّ القائمة"}
            title={collapsed ? "توسيع القائمة" : "طيّ القائمة"}
          >
            {collapsed ? (
              <ChevronsLeft className="h-4 w-4" style={{ color: "var(--ac-ink-2)" }} />
            ) : (
              <ChevronsRight className="h-4 w-4" style={{ color: "var(--ac-ink-2)" }} />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="h-16 sticky top-0 z-20 border-b flex items-center gap-2 px-3 lg:px-6"
          style={{
            background: theme === "dark" ? "rgba(10,22,34,0.72)" : "rgba(255,255,255,0.85)",
            borderColor: "var(--ac-line)",
            backdropFilter: "blur(12px) saturate(140%)",
          }}
        >
          <button
            className="lg:hidden p-2 rounded-md hover:bg-black/5"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" style={{ color: "var(--ac-ink-2)" }} />
          </button>

          <Breadcrumbs />

          <div className="flex-1" />

          {/* Search / Command Palette trigger */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-sm min-w-0 max-w-xs sm:max-w-md transition hover:opacity-80"
            style={{
              borderColor: "var(--ac-line-strong)",
              background: "var(--ac-subtle)",
              color: "var(--ac-ink-3)",
            }}
            aria-label="بحث عام"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline truncate">ابحث في كل شيء…</span>
            <kbd
              className="hidden md:inline-flex items-center gap-1 rounded px-1.5 h-5 text-[10px] font-mono border ms-2"
              style={{ borderColor: "var(--ac-line)", color: "var(--ac-muted)" }}
            >
              ⌘K
            </kbd>
          </button>

          {/* AI Assistant trigger */}
          <button
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition hover:opacity-90"
            style={{ background: "var(--ac-accent-soft)", color: "var(--ac-accent-ink)" }}
            aria-label="فتح المساعد الذكي"
            title="المساعد الذكي (⌘J)"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">المساعد</span>
          </button>

          <QuickActions />

          <ThemeSwitcher theme={theme} onToggle={toggleTheme} />

          <AdminNotificationsBell />

          <div
            className="hidden sm:flex items-center gap-2 pe-1 ps-3 border-s"
            style={{ borderColor: "var(--ac-line)" }}
          >
            <div className="text-end leading-tight">
              <div className="text-sm font-semibold" style={{ color: "var(--ac-ink)" }}>
                {userName ?? "مستخدم"}
              </div>
              <div className="text-[11px]" style={{ color: "var(--ac-ink-3)" }}>
                {roles.join(" · ") || "بدون دور"}
              </div>
            </div>
            <div
              className="h-9 w-9 rounded-full grid place-items-center font-bold"
              style={{ background: "var(--ac-accent-soft)", color: "var(--ac-accent-ink)" }}
            >
              {(userName ?? "?").slice(0, 1)}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-md hover:bg-black/5"
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
          >
            <LogOut className="h-5 w-5" style={{ color: "var(--ac-ink-2)" }} />
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1500px] w-full mx-auto">{children}</main>
      </div>

      {/* Overlays */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onAskAI={askAI} />
      <AIAssistantPanel open={aiOpen} onOpenChange={setAiOpen} initialPrompt={aiPrompt} />
    </div>
  );
}
