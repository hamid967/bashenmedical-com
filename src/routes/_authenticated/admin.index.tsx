import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { getAdminStats, getMyRoles, getAdminTrends } from "@/lib/admin.functions";
import type { AdminRole } from "@/components/admin/AdminShell";
import {
  CalendarCheck,
  Clock,
  Stethoscope,
  Package,
  Users,
  ClipboardList,
  ShieldCheck,
  MessageSquare,
  ArchiveRestore,
  Building2,
  FileBarChart,
  Inbox,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

const statsQuery = queryOptions({
  queryKey: ["admin", "stats"],
  queryFn: () => getAdminStats(),
  staleTime: 30_000,
});
const rolesQuery = queryOptions({
  queryKey: ["admin", "my-roles"],
  queryFn: () => getMyRoles(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(rolesQuery),
      context.queryClient.ensureQueryData(statsQuery).catch(() => null),
    ]);
    return null;
  },
  head: () => ({
    meta: [
      { title: "لوحة القيادة | مركز باعشن" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDashboard,
});

type QuickLink = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AdminRole[];
};

const PRIMARY_LINKS: QuickLink[] = [
  { to: "/appointments-queue", label: "طابور المواعيد", icon: CalendarCheck, roles: ["admin", "reception", "doctor"] },
  { to: "/patients-management", label: "المرضى", icon: Users, roles: ["admin", "reception", "doctor", "nurse"] },
  { to: "/doctors-management", label: "الأطباء", icon: Stethoscope, roles: ["admin", "hr"] },
  { to: "/availability-management", label: "التوفر", icon: ClipboardList, roles: ["admin", "hr"] },
  { to: "/hr-management", label: "الموارد البشرية", icon: Users, roles: ["admin", "hr"] },
  { to: "/orders-unified", label: "الطلبات الموحدة", icon: Package, roles: ["admin", "reception", "pharmacy"] },
];

const SECONDARY_LINKS: QuickLink[] = [
  { to: "/corporate-admin", label: "الشركات", icon: Building2, roles: ["admin"] },
  { to: "/complaints-admin", label: "الشكاوى", icon: MessageSquare, roles: ["admin", "reception"] },
  { to: "/inventory-management", label: "المخزون", icon: ArchiveRestore, roles: ["admin", "pharmacy"] },
  { to: "/reports", label: "التقارير", icon: FileBarChart, roles: ["admin"] },
  { to: "/rbac", label: "الصلاحيات", icon: ShieldCheck, roles: ["admin"] },
];

// Deep Ocean palette (locked)
const OCEAN = {
  bg: "#081628",
  panel: "#0c2340",
  panel2: "#1a4a6e",
  accent: "#2d8a9e",
  glow: "#5cbdb9",
} as const;

const SORA = "'Sora', 'Cairo', system-ui, sans-serif";
const MANROPE = "'Manrope', 'Cairo', system-ui, sans-serif";

function AdminDashboard() {
  const { data: rolesData } = useSuspenseQuery(rolesQuery);
  const { data: stats } = useSuspenseQuery(statsQuery);
  const roles = (rolesData?.roles ?? []) as AdminRole[];

  const primary = PRIMARY_LINKS.filter((l) => !l.roles || l.roles.some((r) => roles.includes(r)));
  const secondary = SECONDARY_LINKS.filter((l) => !l.roles || l.roles.some((r) => roles.includes(r)));

  return (
    <div
      dir="rtl"
      className="-m-4 lg:-m-8 min-h-[calc(100vh-4rem)] p-6 lg:p-10 rounded-none"
      style={{
        background: OCEAN.bg,
        color: "#e0e7ff",
        fontFamily: MANROPE,
      }}
    >
      {/* Header */}
      <header className="mb-10 flex flex-wrap justify-between items-end gap-6">
        <div>
          <div
            className="text-[11px] font-bold tracking-[0.3em] uppercase mb-2"
            style={{ color: OCEAN.glow, opacity: 0.75 }}
          >
            لوحة القيادة
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-1" style={{ fontFamily: SORA }}>
            أهلاً بك في مركز باعشن
          </h1>
          <p style={{ color: OCEAN.glow, opacity: 0.8 }} className="text-sm">
            نظرة سريعة على عمليات اليوم مع اختصارات لأهم أدواتك حسب دورك.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {roles.length === 0 && (
            <span
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}
            >
              لم يتم منح دور بعد
            </span>
          )}
          {roles.map((r) => (
            <span
              key={r}
              className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: `${OCEAN.accent}33`, color: OCEAN.glow, border: `1px solid ${OCEAN.accent}55` }}
            >
              {r}
            </span>
          ))}
        </div>
      </header>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          <KpiCard
            label="طلبات قيد المعالجة"
            value={stats.ordersPending}
            hint={`إجمالي: ${stats.ordersTotal}`}
            icon={Package}
            to="/orders-unified"
            highlight={stats.ordersPending > 0}
          />
          <KpiCard label="أطباء نشطون" value={stats.doctorsActive} icon={Stethoscope} to="/doctors-management" />
          <KpiCard label="بانتظار التأكيد" value={stats.appointmentsPending} icon={Clock} to="/appointments-queue" />
          <KpiCard label="مواعيد اليوم" value={stats.appointmentsToday} icon={CalendarCheck} to="/appointments-queue" filled />
        </div>
      )}

      {/* Magazine grid: Featured Inbox + Primary shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Featured Unified Inbox */}
        <Link
          to="/admin/inbox"
          className="lg:col-span-8 relative overflow-hidden rounded-[2rem] p-8 lg:p-10 group transition-transform hover:-translate-y-0.5"
          style={{
            background: OCEAN.panel,
            border: `1px solid ${OCEAN.panel2}`,
          }}
        >
          <div
            className="absolute top-0 left-0 w-64 h-64 blur-[100px] -ml-32 -mt-32 pointer-events-none"
            style={{ background: `${OCEAN.accent}22` }}
          />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
              <div>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold mb-3"
                  style={{ background: OCEAN.accent, color: "#e0e7ff" }}
                >
                  <Sparkles className="h-3 w-3" /> البريد الموحّد
                </span>
                <h2 className="text-2xl lg:text-3xl font-bold mb-2 text-white" style={{ fontFamily: SORA }}>
                  صندوق الوارد الموحّد اليوم
                </h2>
                <p style={{ color: OCEAN.glow, opacity: 0.8 }} className="text-sm">
                  إدارة كافة المراسلات والطلبات من منصة واحدة
                </p>
              </div>
              <span
                className="px-5 py-2.5 rounded-full font-bold text-sm inline-flex items-center gap-2 group-hover:scale-105 transition-transform"
                style={{ background: "white", color: OCEAN.panel }}
              >
                فتح الصندوق <ArrowLeft className="h-4 w-4" />
              </span>
            </div>

            <div className="space-y-3">
              <InboxRow accent color={OCEAN.glow} label="طلبات مرضى جديدة" hint={`${stats?.appointmentsPending ?? 0} بانتظار التأكيد`} />
              <InboxRow color={OCEAN.accent} label="طلبات صيدلية ومختبر" hint={`${stats?.ordersPending ?? 0} قيد المعالجة`} />
              <InboxRow color={OCEAN.accent} label="شكاوى وطلبات دعم" hint="راجع صفحة الشكاوى" />
            </div>
          </div>
        </Link>

        {/* Primary bento shortcuts */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-4">
          {primary.slice(0, 6).map((l) => (
            <ShortcutTile key={l.to} link={l} />
          ))}
        </div>
      </div>

      {/* Secondary shortcuts row */}
      {secondary.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-4 mt-2">
            <span className="w-1 h-5 rounded-full" style={{ background: OCEAN.glow }} />
            <h3 className="text-lg font-bold text-white" style={{ fontFamily: SORA }}>
              وصول إضافي
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {secondary.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className="p-4 rounded-2xl text-center text-sm font-bold flex flex-col items-center gap-2 transition-all hover:-translate-y-0.5"
                  style={{
                    background: `${OCEAN.panel}80`,
                    border: `1px solid ${OCEAN.panel2}`,
                    color: "#e0e7ff",
                  }}
                >
                  <span style={{ color: OCEAN.glow, display: "inline-flex" }}><Icon className="h-5 w-5" /></span>
                  {l.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  to,
  highlight,
  filled,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  highlight?: boolean;
  filled?: boolean;
}) {
  const style: React.CSSProperties = filled
    ? { background: OCEAN.glow, color: OCEAN.panel, border: `1px solid ${OCEAN.glow}` }
    : {
        background: highlight ? `${OCEAN.accent}22` : `${OCEAN.panel2}66`,
        border: `1px solid ${highlight ? `${OCEAN.accent}66` : `${OCEAN.accent}33`}`,
        color: "#e0e7ff",
      };

  const labelColor = filled ? "rgba(12,35,64,0.75)" : OCEAN.glow;

  const body = (
    <div
      className="p-6 rounded-3xl h-full transition-all hover:-translate-y-0.5"
      style={{ ...style, transition: "border-color 0.2s, transform 0.2s" }}
    >
      <div className="flex justify-between items-center mb-4">
        <div
          className="text-[11px] font-bold uppercase tracking-[0.15em]"
          style={{ color: labelColor }}
        >
          {label}
        </div>
        <span style={{ color: labelColor, opacity: 0.7, display: "inline-flex" }}><Icon className="h-5 w-5" /></span>
      </div>
      <div className="text-4xl font-bold" style={{ fontFamily: SORA }}>
        {value}
      </div>
      {hint && (
        <div className="text-xs mt-2" style={{ color: labelColor, opacity: 0.7 }}>
          {hint}
        </div>
      )}
    </div>
  );

  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function ShortcutTile({ link }: { link: QuickLink }) {
  const Icon = link.icon;
  return (
    <Link
      to={link.to}
      className="rounded-3xl p-5 flex flex-col items-center justify-center text-center gap-3 transition-all hover:-translate-y-0.5 group"
      style={{
        background: `${OCEAN.panel2}33`,
        border: `1px solid ${OCEAN.panel2}`,
        color: "#e0e7ff",
        minHeight: "110px",
      }}
    >
      <span style={{ color: OCEAN.glow, display: "inline-flex" }}>
        <Icon className="h-6 w-6 transition-transform group-hover:scale-110" />
      </span>
      <span className="text-sm font-bold">{link.label}</span>
    </Link>
  );
}

function InboxRow({
  label,
  hint,
  color,
  accent,
}: {
  label: string;
  hint: string;
  color: string;
  accent?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-4 p-4 rounded-2xl"
      style={{
        background: `${OCEAN.panel2}4d`,
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={
          accent
            ? { background: color }
            : { background: "transparent", border: `1px solid ${color}` }
        }
      />
      <div className="flex-1 font-bold text-white text-sm">{label}</div>
      <div className="text-xs" style={{ color: OCEAN.glow, opacity: 0.7 }}>
        {hint}
      </div>
    </div>
  );
}
