import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Stethoscope, HeartPulse, Users, CalendarDays, Building2,
  FlaskConical, Radiation, Pill, ClipboardList, Ambulance, CreditCard,
  ShieldCheck, Package, Truck, UserCog, Clock, Wallet, LineChart as LineIcon,
  BarChart3, Bot, Bell, Settings, ChevronsLeft, ChevronsRight, Search,
  Sparkles, TrendingUp, TrendingDown, Video, Zap, Command, X, Send,
  ArrowUpRight, ActivitySquare, CheckCircle2, AlertTriangle, ShieldAlert,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Area, AreaChart, Tooltip, XAxis, BarChart, Bar } from "recharts";
import { getCommandCenterKpis, type CommandCenterKpis } from "@/lib/command-center/kpis.functions";
import { getDashboardUpcoming } from "@/lib/dashboard.functions";
import { SITE } from "@/lib/site";
import { useMyPermissions } from "@/components/rbac/RequirePermission";

/* ============================================================
   Route
   ============================================================ */

const kpisQuery = queryOptions({
  queryKey: ["command-center", "kpis"],
  queryFn: () => getCommandCenterKpis(),
  staleTime: 30_000,
});

const upcomingQuery = queryOptions({
  queryKey: ["command-center", "upcoming"],
  queryFn: () => getDashboardUpcoming({ data: { branchId: null } }),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/command-center")({
  loader: async ({ context }) => {
    context.queryClient.ensureQueryData(kpisQuery);
    context.queryClient.prefetchQuery(upcomingQuery);
  },
  head: () => ({
    meta: [
      { title: "Command Center · مجمع باعشن الطبي" },
      { name: "description", content: "لوحة الإدارة الفاخرة لمجمع باعشن الطبي — مؤشرات، ذكاء اصطناعي، مواعيد." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandCenterPage,
  errorComponent: CenterError,
  notFoundComponent: () => null,
});

function CenterError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="cc-shell grid min-h-screen place-items-center p-8">
      <div className="cc-glass max-w-md p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-[color:var(--cc-warning)]" />
        <h2 className="mb-2 text-lg font-bold">تعذّر تحميل مركز التحكم</h2>
        <p className="mb-6 text-sm text-[color:var(--cc-fg-muted)]">{error.message}</p>
        <button
          onClick={() => { reset(); router.invalidate(); }}
          className="rounded-full bg-[color:var(--cc-primary)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Sidebar navigation config
   ============================================================ */

type NavItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  comingSoon?: boolean;
  /** If set, hide the item when the current user lacks this permission. */
  permission?: string;
};

const NAV: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/_authenticated/command-center" as string },
  { label: "الأطباء", icon: Stethoscope, to: "/_authenticated/doctors-management" as string, permission: "doctors.manage" },
  { label: "الممرضون", icon: HeartPulse, to: "/_authenticated/nurses" as string, permission: "nurses.manage" },
  { label: "المرضى", icon: Users, to: "/_authenticated/patients-management" as string, permission: "patients.view" },
  { label: "المواعيد", icon: CalendarDays, to: "/_authenticated/appointments-queue" as string, permission: "appointments.view" },
  { label: "العيادات", icon: Building2, to: "/_authenticated/clinic-settings" as string, permission: "settings.manage" },
  { label: "المختبر", icon: FlaskConical, comingSoon: true },
  { label: "الأشعة", icon: Radiation, comingSoon: true },
  { label: "الصيدلية", icon: Pill, to: "/_authenticated/pharmacy-management" as string, permission: "pharmacy.view" },
  { label: "السجلات الطبية", icon: ClipboardList, to: "/_authenticated/patients-analytics" as string, permission: "patients.view" },
  { label: "الطوارئ", icon: Ambulance, comingSoon: true },
  { label: "الفوترة", icon: CreditCard, comingSoon: true },
  { label: "التأمين", icon: ShieldCheck, comingSoon: true },
  { label: "المخزون", icon: Package, to: "/_authenticated/inventory-management" as string, permission: "inventory.manage" },
  { label: "المستلزمات", icon: Truck, comingSoon: true },
  { label: "الموظفون", icon: UserCog, to: "/_authenticated/hr-management" as string, permission: "hr.manage" },
  { label: "الحضور", icon: Clock, to: "/_authenticated/hr-management" as string, permission: "hr.manage" },
  { label: "الرواتب", icon: Wallet, to: "/_authenticated/hr-management" as string, permission: "hr.manage" },
  { label: "التقارير", icon: LineIcon, to: "/_authenticated/reports" as string, permission: "reports.view" },
  { label: "التحليلات", icon: BarChart3, to: "/_authenticated/patients-analytics" as string, permission: "reports.view" },
  { label: "مساعد AI", icon: Bot, comingSoon: true },
  { label: "التنبيهات", icon: Bell, to: "/_authenticated/notifications-queue" as string, permission: "notifications.manage" },
  { label: "الصلاحيات", icon: ShieldCheck, to: "/_authenticated/rbac" as string, permission: "rbac.manage" },
  { label: "سجل التدقيق", icon: ClipboardList, to: "/_authenticated/audit-log" as string, permission: "audit.view" },
  { label: "تدقيق الصلاحيات", icon: ShieldAlert, to: "/_authenticated/rbac-audit" as string, permission: "rbac.manage" },
  { label: "الإعدادات", icon: Settings, to: "/_authenticated/clinic-settings" as string, permission: "settings.manage" },
];

/**
 * Filters NAV entries the current user is allowed to see.
 * - Items without a `permission` are always visible.
 * - super_admin sees everything.
 */
function useVisibleNav() {
  const perms = useMyPermissions();
  const allowed = new Set(perms.data?.permissions ?? []);
  const isSuper = !!perms.data?.isSuper;
  const loading = perms.isLoading;
  const items = NAV.filter((item) => {
    if (!item.permission) return true;
    if (isSuper) return true;
    return allowed.has(item.permission);
  });
  return { items, loading };
}

/* ============================================================
   Page
   ============================================================ */

function CommandCenterPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="cc-shell" dir="rtl">
      <div className="flex min-h-screen">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        <div className="flex-1 min-w-0">
          <Topbar onOpenPalette={() => setPaletteOpen(true)} />
          <main className="p-4 md:p-6 lg:p-8 space-y-6">
            <HeaderStrip />
            <KpiGrid />
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                <AiCommandCenter />
                <AppointmentBoard />
              </div>
              <div className="space-y-6">
                <QuickActions />
                <AiRecommendations />
              </div>
            </div>
            <ModuleSummaryCards />
            <footer className="pt-6 pb-2 text-center text-[11px] text-[color:var(--cc-fg-dim)]">
              Command Center · {SITE.nameAr} · بيانات مؤشرة بـ MOCK يتم تحديدها بوضوح ويمكن ربطها لاحقاً
            </footer>
          </main>
        </div>
      </div>
      <FloatingAiAssistant open={aiOpen} onOpenChange={setAiOpen} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/* ============================================================
   Sidebar
   ============================================================ */

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`sticky top-0 h-screen shrink-0 border-l border-[color:var(--cc-border)] bg-[color:var(--cc-bg-1)]/70 backdrop-blur-xl transition-[width] duration-300 ${
        collapsed ? "w-[76px]" : "w-[264px]"
      }`}
    >
      <div className="flex items-center justify-between gap-2 p-4 border-b border-[color:var(--cc-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--cc-gradient-primary)" }}>
            <HeartPulse className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight truncate">{SITE.nameAr}</div>
              <div className="text-[10px] text-[color:var(--cc-fg-dim)] truncate">Command Center</div>
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          aria-label={collapsed ? "توسيع الشريط الجانبي" : "طيّ الشريط الجانبي"}
          className="rounded-lg p-1.5 text-[color:var(--cc-fg-muted)] hover:bg-white/5 hover:text-white"
        >
          {collapsed ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </button>
      </div>
      <NavList collapsed={collapsed} />
    </aside>
  );
}

function NavList({ collapsed }: { collapsed: boolean }) {
  const { items, loading } = useVisibleNav();
  if (loading) {
    return (
      <nav className="p-2 space-y-1 overflow-y-auto h-[calc(100vh-72px)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 rounded-xl bg-white/[0.03] animate-pulse" />
        ))}
      </nav>
    );
  }
  return (
    <nav className="p-2 space-y-0.5 overflow-y-auto h-[calc(100vh-72px)]">
      {items.map((item, i) => {
        const Icon = item.icon;
        const active = i === 0;
        const content = (
          <span
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
              active
                ? "text-white cc-ring-glow"
                : "text-[color:var(--cc-fg-muted)] hover:text-white hover:bg-white/5"
            }`}
            style={active ? { background: "linear-gradient(135deg, rgba(15,108,189,0.35), rgba(28,200,238,0.15))" } : undefined}
            title={collapsed ? item.label : undefined}
          >
            <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-[color:var(--cc-cyan)]" : ""}`} />
            {!collapsed && (
              <>
                <span className="flex-1 truncate">{item.label}</span>
                {item.comingSoon && (
                  <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] text-[color:var(--cc-fg-dim)]">قريباً</span>
                )}
              </>
            )}
          </span>
        );
        return item.to && !item.comingSoon ? (
          <Link key={item.label} to={item.to} className="block">{content}</Link>
        ) : (
          <div key={item.label} className={item.comingSoon ? "cursor-not-allowed opacity-70" : ""}>{content}</div>
        );
      })}
      {items.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-[color:var(--cc-border)] bg-white/[0.02] p-4 text-center text-[11px] text-[color:var(--cc-fg-dim)]">
          لا صلاحيات كافية لعرض أي وحدة.
        </div>
      )}
    </nav>
  );
}

/* ============================================================
   Topbar
   ============================================================ */

function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--cc-border)] bg-[color:var(--cc-bg-1)]/60 backdrop-blur-xl px-4 md:px-6 py-3">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cc-border)] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[color:var(--cc-fg-muted)] hover:border-[color:var(--cc-border-strong)] hover:text-white"
        title="العودة إلى لوحة الإدارة الموحدة"
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">لوحة الإدارة</span>
      </Link>
      <button
        onClick={onOpenPalette}
        className="group flex flex-1 max-w-xl items-center gap-2 rounded-2xl border border-[color:var(--cc-border)] bg-white/[0.03] px-4 py-2 text-sm text-[color:var(--cc-fg-muted)] hover:border-[color:var(--cc-border-strong)] hover:bg-white/[0.06]"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-right">ابحث عن مريض، طبيب، موعد، أو تقرير…</span>
        <kbd className="hidden md:inline-flex items-center gap-1 rounded-md border border-[color:var(--cc-border)] bg-white/5 px-1.5 py-0.5 text-[10px] font-mono">
          <Command className="h-3 w-3" /> K
        </kbd>
      </button>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 rounded-full border border-[color:var(--cc-danger)]/30 bg-[color:var(--cc-danger)]/10 px-3 py-1.5 text-xs text-[color:var(--cc-danger)]">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>تنبيهات حرجة</span>
          <span className="rounded-full bg-[color:var(--cc-danger)]/30 px-1.5 text-[10px] font-bold">2</span>
        </div>
        <button className="relative rounded-xl p-2 text-[color:var(--cc-fg-muted)] hover:bg-white/5 hover:text-white">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[color:var(--cc-cyan)] cc-pulse-dot" />
        </button>
        <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--cc-border)] bg-white/[0.03] py-1 pr-1 pl-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold leading-tight">مدير النظام</div>
            <div className="text-[10px] text-[color:var(--cc-fg-dim)]">Super Admin</div>
          </div>
          <div className="grid h-8 w-8 place-items-center rounded-xl text-white text-xs font-bold" style={{ background: "var(--cc-gradient-primary)" }}>
            م.س
          </div>
        </div>
      </div>
    </header>
  );
}

function HeaderStrip() {
  return (
    <div className="cc-rise flex flex-col md:flex-row md:items-end md:justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs text-[color:var(--cc-fg-dim)]">
          <span>الرئيسية</span> <span>›</span> <span>Command Center</span>
        </div>
        <h1 className="mt-1 text-2xl md:text-3xl font-bold">
          مركز التحكم <span className="cc-gradient-text">الذكي</span>
        </h1>
        <p className="text-sm text-[color:var(--cc-fg-muted)] mt-1">نظرة شاملة على أداء المجمع اليوم — محدّث لحظياً.</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--cc-success)]/30 bg-[color:var(--cc-success)]/10 px-3 py-1 text-[11px] text-[color:var(--cc-success)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--cc-success)] cc-pulse-dot" />
          كل الأنظمة تعمل
        </span>
        <button className="rounded-full border border-[color:var(--cc-border-strong)] bg-white/[0.04] px-4 py-1.5 text-xs font-semibold hover:bg-white/[0.08]">
          تصدير تقرير اليوم
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   KPI Grid
   ============================================================ */

type KpiDef = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: (k: CommandCenterKpis) => string;
  hint?: (k: CommandCenterKpis) => string;
  delta: number;
  accent: "primary" | "cyan" | "success" | "warning" | "danger";
  mock?: (k: CommandCenterKpis) => boolean;
};

const KPIS: KpiDef[] = [
  { key: "patients", label: "مرضى اليوم", icon: Users, value: (k) => String(k.today_patients), delta: 8.2, accent: "primary" },
  { key: "doctors", label: "أطباء نشطون", icon: Stethoscope, value: (k) => String(k.active_doctors), delta: 0, accent: "cyan" },
  { key: "appts", label: "مواعيد اليوم", icon: CalendarDays, value: (k) => String(k.appointments_today), delta: 3.5, accent: "cyan" },
  { key: "revenue", label: "إيرادات اليوم", icon: CreditCard, value: (k) => `${k.revenue_today_sar.toLocaleString()} ر.س`, delta: 3.5, accent: "success", mock: (k) => k.mock_flags.revenue },
  { key: "emergency", label: "حالات طوارئ", icon: Ambulance, value: (k) => String(k.emergency_cases), delta: -1.2, accent: "danger", mock: (k) => k.mock_flags.emergency },
  { key: "surgeries", label: "عمليات جراحية", icon: Zap, value: (k) => String(k.surgeries_today), delta: 0, accent: "warning", mock: (k) => k.mock_flags.surgeries },
  { key: "occupancy", label: "نسبة الإشغال", icon: ActivitySquare, value: (k) => `${k.occupancy_pct}%`, delta: 2.1, accent: "cyan" },
  { key: "wait", label: "متوسط الانتظار", icon: Clock, value: (k) => `${k.avg_wait_minutes} د`, delta: -4.3, accent: "success", mock: (k) => k.mock_flags.wait },
  { key: "online", label: "حجوزات أونلاين", icon: Video, value: (k) => String(k.online_bookings_today), delta: 12.4, accent: "primary" },
  { key: "sat", label: "رضا المرضى", icon: CheckCircle2, value: (k) => `${k.satisfaction_pct}%`, delta: 1.1, accent: "success", mock: (k) => k.mock_flags.satisfaction },
  { key: "ins", label: "مطالبات تأمين", icon: ShieldCheck, value: (k) => String(k.insurance_claims_open), delta: -0.5, accent: "warning", mock: (k) => k.mock_flags.insurance },
  { key: "ai", label: "توقعات AI", icon: Sparkles, value: (k) => String(k.ai_predictions), delta: 5.6, accent: "cyan", mock: (k) => k.mock_flags.ai },
];

function KpiGrid() {
  const { data: k } = useSuspenseQuery(kpisQuery);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
      {KPIS.map((def, i) => (
        <KpiCard key={def.key} def={def} k={k} index={i} />
      ))}
    </div>
  );
}

function KpiCard({ def, k, index }: { def: KpiDef; k: CommandCenterKpis; index: number }) {
  const Icon = def.icon;
  const isMock = def.mock?.(k) ?? false;
  const positive = def.delta >= 0;
  const spark = k.daily_flow.length ? k.daily_flow : Array.from({ length: 7 }, (_, i) => ({ day: String(i), total: 3 + i, confirmed: 2 + i }));
  const accentColor = {
    primary: "var(--cc-primary)", cyan: "var(--cc-cyan)", success: "var(--cc-success)",
    warning: "var(--cc-warning)", danger: "var(--cc-danger)",
  }[def.accent];

  return (
    <div
      className="cc-glass cc-rise group relative overflow-hidden p-4 hover:cc-glass-strong transition"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="absolute -top-8 -left-8 h-24 w-24 rounded-full opacity-25 blur-2xl transition group-hover:opacity-40" style={{ background: accentColor }} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${accentColor} 22%, transparent)`, color: accentColor }}>
          <Icon className="h-4 w-4" />
        </div>
        {isMock ? (
          <span className="rounded-md border border-[color:var(--cc-border)] bg-white/5 px-1.5 py-0.5 text-[9px] font-mono uppercase text-[color:var(--cc-fg-dim)]">
            mock
          </span>
        ) : def.delta !== 0 ? (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${positive ? "text-[color:var(--cc-success)]" : "text-[color:var(--cc-danger)]"}`}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(def.delta).toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div className="relative mt-3">
        <div className="text-[11px] text-[color:var(--cc-fg-muted)]">{def.label}</div>
        <div className="mt-1 text-xl md:text-2xl font-bold tracking-tight">{def.value(k)}</div>
      </div>
      <div className="relative -mx-2 mt-2 h-8 opacity-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spark}>
            <Line type="monotone" dataKey="total" stroke={accentColor} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============================================================
   AI Command Center panel
   ============================================================ */

function AiCommandCenter() {
  const { data: k } = useSuspenseQuery(kpisQuery);
  const data = k.daily_flow.length
    ? k.daily_flow
    : Array.from({ length: 7 }, (_, i) => ({ day: `يوم ${i + 1}`, total: 40 + Math.round(Math.sin(i) * 15) + i * 3, confirmed: 30 + i * 2 }));

  return (
    <section className="cc-glass-strong overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-6 pb-2">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl cc-sheen" style={{ background: "var(--cc-gradient-primary)" }}>
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-bold">مركز الذكاء الاصطناعي</h3>
            <p className="text-xs text-[color:var(--cc-fg-muted)]">توقع تدفق المرضى وتحسين استخدام العيادات في الـ 24 ساعة القادمة</p>
          </div>
        </div>
        <button className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[color:var(--cc-border-strong)] bg-white/[0.04] px-3 py-1 text-xs text-[color:var(--cc-fg-muted)] hover:text-white">
          عرض التفاصيل <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 md:p-6 pt-0">
        <div className="rounded-2xl border border-[color:var(--cc-border)] bg-white/[0.02] p-4">
          <div className="text-xs text-[color:var(--cc-fg-muted)] mb-2">تدفق المرضى — آخر 7 أيام</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="cc-flow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1cc8ee" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#0f6cbd" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" hide />
                <Tooltip
                  cursor={{ stroke: "rgba(255,255,255,0.15)" }}
                  contentStyle={{ background: "#0f1a2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "#e6edf7" }}
                />
                <Area type="monotone" dataKey="total" stroke="#1cc8ee" strokeWidth={2} fill="url(#cc-flow)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--cc-border)] bg-white/[0.02] p-4">
          <div className="text-xs text-[color:var(--cc-fg-muted)] mb-2">توزيع عبء الأطباء (MOCK)</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <XAxis dataKey="day" hide />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#0f1a2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="confirmed" fill="#0f6cbd" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Appointment board
   ============================================================ */

function AppointmentBoard() {
  const { data: upcoming = [] } = useQuery(upcomingQuery);
  const items = upcoming.slice(0, 6);
  const days = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

  return (
    <section className="cc-glass p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base md:text-lg font-bold">إدارة المواعيد</h3>
          <p className="text-xs text-[color:var(--cc-fg-muted)]">التقويم التفاعلي — توفر الأطباء لهذا الأسبوع</p>
        </div>
        <span className="text-xs text-[color:var(--cc-fg-dim)]">Real-time Availability</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[180px_repeat(7,_minmax(80px,1fr))] gap-1 border-b border-[color:var(--cc-border)] pb-2 mb-2 text-[11px] text-[color:var(--cc-fg-dim)]">
            <div>الطبيب</div>
            {days.map((d) => (<div key={d} className="text-center">{d}</div>))}
          </div>
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--cc-border)] bg-white/[0.02] p-8 text-center text-sm text-[color:var(--cc-fg-muted)]">
              لا توجد مواعيد قادمة لعرضها.
            </div>
          ) : (
            items.map((appt, idx) => (
              <div key={appt.id} className="grid grid-cols-[180px_repeat(7,_minmax(80px,1fr))] gap-1 items-center py-2 border-b border-[color:var(--cc-border)]/50">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--cc-gradient-primary)" }}>
                    {(appt.doctor_name_ar ?? "د").slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{appt.doctor_name_ar ?? "الطبيب"}</div>
                    <div className="text-[10px] text-[color:var(--cc-fg-dim)] truncate">{appt.specialty_name_ar ?? "—"}</div>
                  </div>
                </div>
                {days.map((_, di) => {
                  const active = ((idx + di) % 3 === 0);
                  return (
                    <div key={di} className="px-1">
                      {active ? (
                        <div className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[color:var(--cc-cyan)]/30 bg-[color:var(--cc-cyan)]/10 px-2 py-1 text-[10px] text-[color:var(--cc-cyan)]">
                          <Video className="h-3 w-3" /> Booked
                        </div>
                      ) : (
                        <div className="h-6 rounded-lg border border-dashed border-[color:var(--cc-border)] bg-white/[0.01]" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Quick actions & AI recommendations
   ============================================================ */

function QuickActions() {
  const perms = useMyPermissions();
  const allowed = new Set(perms.data?.permissions ?? []);
  const isSuper = !!perms.data?.isSuper;
  const has = (p?: string) => !p || isSuper || allowed.has(p);
  const all = [
    { label: "حجز موعد جديد", icon: CalendarDays, to: "/_authenticated/quick-add" as string, permission: "appointments.manage" },
    { label: "بحث عن مريض", icon: Search, to: "/_authenticated/patients-management" as string, permission: "patients.view" },
    { label: "إدارة الأطباء", icon: Stethoscope, to: "/_authenticated/doctors-management" as string, permission: "doctors.manage" },
    { label: "قائمة الانتظار", icon: Clock, to: "/_authenticated/appointments-queue" as string, permission: "appointments.view" },
  ];
  const actions = all.filter((a) => has(a.permission));
  return (
    <section className="cc-glass p-5">
      <h3 className="text-sm font-bold mb-3">إجراءات سريعة</h3>
      {actions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--cc-border)] bg-white/[0.02] p-4 text-center text-[11px] text-[color:var(--cc-fg-dim)]">
          لا توجد إجراءات متاحة لصلاحياتك.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.label} to={a.to} className="group flex flex-col items-start gap-2 rounded-2xl border border-[color:var(--cc-border)] bg-white/[0.02] p-3 hover:border-[color:var(--cc-cyan)]/40 hover:bg-white/[0.05] transition">
                <div className="grid h-8 w-8 place-items-center rounded-lg text-[color:var(--cc-cyan)]" style={{ background: "color-mix(in oklab, var(--cc-cyan) 18%, transparent)" }}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-xs font-semibold">{a.label}</div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AiRecommendations() {
  const recs = [
    { icon: Zap, tone: "cyan", title: "زيادة أطباء طب الأسرة يوم الأحد", body: "التوقع يشير إلى ارتفاع 22% في الطلب." },
    { icon: AlertTriangle, tone: "warning", title: "3 عيادات قرب سعتها القصوى", body: "أعد توزيع 5 مواعيد إلى الفترة المسائية." },
    { icon: CheckCircle2, tone: "success", title: "انخفاض نسبة عدم الحضور 4%", body: "استمرار في تفعيل تذكير واتساب قبل 24 ساعة." },
  ] as const;
  const toneColor = { cyan: "var(--cc-cyan)", warning: "var(--cc-warning)", success: "var(--cc-success)" } as const;
  return (
    <section className="cc-glass p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">توصيات المساعد الذكي</h3>
        <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-mono uppercase text-[color:var(--cc-fg-dim)]">mock</span>
      </div>
      <ul className="space-y-2">
        {recs.map((r, i) => {
          const Icon = r.icon;
          const c = toneColor[r.tone];
          return (
            <li key={i} className="flex items-start gap-3 rounded-2xl border border-[color:var(--cc-border)] bg-white/[0.02] p-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${c} 20%, transparent)`, color: c }}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold">{r.title}</div>
                <div className="mt-0.5 text-[11px] text-[color:var(--cc-fg-muted)]">{r.body}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ============================================================
   Module summaries: Lab / Radiology / Pharmacy / Billing
   ============================================================ */

function ModuleSummaryCards() {
  const mods = [
    {
      title: "المختبر", icon: FlaskConical, accent: "var(--cc-cyan)",
      rows: [
        { l: "فحوصات معلّقة", v: "12", tone: "warning" },
        { l: "فحوصات مكتملة", v: "38", tone: "success" },
        { l: "نتائج عاجلة", v: "3", tone: "danger" },
      ],
    },
    {
      title: "الأشعة", icon: Radiation, accent: "var(--cc-primary)",
      rows: [
        { l: "MRI", v: "متاح", tone: "success" },
        { l: "CT Scan", v: "قيد الاستخدام", tone: "warning" },
        { l: "X-Ray", v: "متاح", tone: "success" },
      ],
    },
    {
      title: "الصيدلية", icon: Pill, accent: "var(--cc-success)",
      rows: [
        { l: "المخزون", v: "15%", tone: "danger" },
        { l: "بعض الأدوية", v: "20%", tone: "warning" },
        { l: "تنبيه انتهاء", v: "تحذير", tone: "warning" },
      ],
    },
    {
      title: "الفوترة والتأمين", icon: CreditCard, accent: "var(--cc-warning)",
      rows: [
        { l: "مطالبات تأمين", v: "قيد المعالجة", tone: "warning" },
        { l: "مطالبات مقبولة", v: "قيد المعالجة", tone: "warning" },
        { l: "إيرادات", v: "20.00 USD", tone: "success" },
      ],
    },
  ] as const;
  const toneColor = { success: "var(--cc-success)", warning: "var(--cc-warning)", danger: "var(--cc-danger)" } as const;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {mods.map((m) => {
        const Icon = m.icon;
        return (
          <section key={m.title} className="cc-glass p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${m.accent} 20%, transparent)`, color: m.accent }}>
                  <Icon className="h-4 w-4" />
                </div>
                <h4 className="text-sm font-bold">{m.title}</h4>
              </div>
              <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-mono uppercase text-[color:var(--cc-fg-dim)]">mock</span>
            </div>
            <ul className="space-y-1.5 text-xs">
              {m.rows.map((r, i) => (
                <li key={i} className="flex items-center justify-between border-b border-[color:var(--cc-border)]/60 py-1.5 last:border-0">
                  <span className="text-[color:var(--cc-fg-muted)]">{r.l}</span>
                  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: toneColor[r.tone] }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor[r.tone] }} />
                    {r.v}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ============================================================
   Floating AI assistant
   ============================================================ */

function FloatingAiAssistant({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [msg, setMsg] = useState("");
  return (
    <>
      {!open && (
        <button
          onClick={() => onOpenChange(true)}
          aria-label="افتح المساعد الطبي الذكي"
          className="fixed bottom-6 end-6 z-40 grid h-14 w-14 place-items-center rounded-full text-white shadow-2xl hover:scale-105 transition cc-sheen"
          style={{ background: "var(--cc-gradient-primary)" }}
        >
          <Bot className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 end-6 z-40 w-[min(360px,calc(100vw-2rem))] cc-glass-strong overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b border-[color:var(--cc-border)] p-3">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "var(--cc-gradient-primary)" }}>
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-xs font-bold">AI Medical Assistant</div>
                <div className="text-[10px] text-[color:var(--cc-fg-dim)]">Voice and text chat · MOCK</div>
              </div>
            </div>
            <button onClick={() => onOpenChange(false)} aria-label="إغلاق" className="rounded-lg p-1 hover:bg-white/5">
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="p-3 max-h-72 overflow-y-auto space-y-2 text-xs">
            <div className="rounded-2xl bg-white/[0.04] p-2.5 max-w-[80%]">مرحباً، كيف يمكنني مساعدتك؟</div>
            <div className="text-[10px] text-[color:var(--cc-fg-dim)] px-1">اقتراحات:</div>
            {["توقّع عدد المرضى غداً", "حلّل أداء العيادات هذا الأسبوع", "اقترح جدولة إضافية"].map((s) => (
              <button key={s} onClick={() => setMsg(s)} className="block w-full text-right rounded-xl border border-[color:var(--cc-border)] bg-white/[0.02] px-3 py-1.5 text-[11px] hover:bg-white/[0.06]">
                {s}
              </button>
            ))}
          </div>
          <div className="border-t border-[color:var(--cc-border)] p-2 flex items-center gap-2">
            <input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="اكتب رسالة…"
              className="flex-1 rounded-xl border border-[color:var(--cc-border)] bg-white/[0.03] px-3 py-2 text-xs outline-none focus:border-[color:var(--cc-cyan)]/50"
            />
            <button className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "var(--cc-gradient-primary)" }}>
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Command palette (⌘K)
   ============================================================ */

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const { items: visibleNav } = useVisibleNav();
  const filtered = useMemo(() => {
    const t = q.trim();
    if (!t) return visibleNav.slice(0, 8);
    return visibleNav.filter((n) => n.label.toLowerCase().includes(t.toLowerCase())).slice(0, 8);
  }, [q, visibleNav]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-24" onClick={onClose}>
      <div className="w-full max-w-lg cc-glass-strong overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[color:var(--cc-border)] px-4 py-3">
          <Search className="h-4 w-4 text-[color:var(--cc-fg-muted)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن أي قسم…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--cc-fg-dim)]"
          />
          <kbd className="rounded-md border border-[color:var(--cc-border)] bg-white/5 px-1.5 py-0.5 text-[10px]">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.map((n) => {
            const Icon = n.icon;
            const inner = (
              <span className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[color:var(--cc-fg-muted)] hover:bg-white/[0.05] hover:text-white">
                <Icon className="h-4 w-4" /> {n.label}
                {n.comingSoon && <span className="ms-auto text-[10px] text-[color:var(--cc-fg-dim)]">قريباً</span>}
              </span>
            );
            return (
              <li key={n.label}>
                {n.to && !n.comingSoon ? (
                  <Link to={n.to} onClick={onClose}>{inner}</Link>
                ) : (
                  <div>{inner}</div>
                )}
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="p-4 text-center text-xs text-[color:var(--cc-fg-dim)]">لا نتائج</li>
          )}
        </ul>
      </div>
    </div>
  );
}
