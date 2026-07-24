import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { listBranchesLite } from "@/lib/admin/no-show-stats.functions";
import { useServerFn } from "@tanstack/react-start";
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
import { KpiGrid } from "@/components/admin/v2/KpiGrid";
import { CommandCenterKpiGridV2 } from "@/components/admin/v2/CommandCenterKpiGridV2";
import type { AdminRole } from "@/components/admin/types";
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
  Palette,
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

const adminSearchSchema = z.object({
  range: fallback(z.string(), "today").default("today"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  branch: fallback(z.string(), "").default(""),
});

function resolveRange(range: string, from: string, to: string): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const back = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  if (range === "custom" && from && to) return { from, to };
  if (range === "yesterday") {
    const y = back(1);
    return { from: iso(y), to: iso(y) };
  }
  if (range === "7d") return { from: iso(back(6)), to: iso(today) };
  if (range === "30d") return { from: iso(back(29)), to: iso(today) };
  return { from: iso(today), to: iso(today) };
}

export const Route = createFileRoute("/_authenticated/admin/")({
  validateSearch: zodValidator(adminSearchSchema),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(rolesQuery),
      context.queryClient.ensureQueryData(statsQuery).catch(() => null),
    ]);
    return null;
  },
  head: () => ({
    meta: [{ title: "لوحة القيادة | مركز باعشن" }, { name: "robots", content: "noindex" }],
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
  {
    to: "/appointments-queue",
    label: "طابور المواعيد",
    icon: CalendarCheck,
    roles: ["admin", "reception", "doctor"],
  },

  {
    to: "/patients-management",
    label: "المرضى",
    icon: Users,
    roles: ["admin", "reception", "doctor", "nurse"],
  },
  { to: "/doctors-management", label: "الأطباء", icon: Stethoscope, roles: ["admin", "hr"] },
  { to: "/availability-management", label: "التوفر", icon: ClipboardList, roles: ["admin", "hr"] },
  { to: "/hr-management", label: "الموارد البشرية", icon: Users, roles: ["admin", "hr"] },
  {
    to: "/orders-unified",
    label: "الطلبات الموحدة",
    icon: Package,
    roles: ["admin", "reception", "pharmacy"],
  },
];

const SECONDARY_LINKS: QuickLink[] = [
  { to: "/owner", label: "منشئ الموقع", icon: Palette, roles: ["super_admin"] },
  { to: "/corporate-admin", label: "الشركات", icon: Building2, roles: ["admin"] },
  { to: "/complaints-admin", label: "الشكاوى", icon: MessageSquare, roles: ["admin", "reception"] },
  {
    to: "/inventory-management",
    label: "المخزون",
    icon: ArchiveRestore,
    roles: ["admin", "pharmacy"],
  },
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
  const secondary = SECONDARY_LINKS.filter(
    (l) => !l.roles || l.roles.some((r) => roles.includes(r)),
  );

  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { from: fromDate, to: toDate } = resolveRange(search.range, search.from, search.to);
  const branchId = search.branch || null;
  const fetchBranches = useServerFn(listBranchesLite);
  const branchesQ = useQuery({
    queryKey: ["admin", "branches-lite"],
    queryFn: () => fetchBranches(),
    staleTime: 5 * 60_000,
  });


  return (
    <div
      dir="rtl"
      className="-m-4 lg:-m-8 min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-10 rounded-none"
      style={{
        background: OCEAN.bg,
        color: "#e0e7ff",
        fontFamily: MANROPE,
      }}
    >
      {/* Header */}
      <header className="mb-6 sm:mb-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between sm:items-end sm:gap-6">
        <div className="min-w-0">
          <div
            className="text-[10px] sm:text-[11px] font-bold tracking-[0.25em] sm:tracking-[0.3em] uppercase mb-2"
            style={{ color: OCEAN.glow, opacity: 0.75 }}
          >
            لوحة القيادة
          </div>
          <h1
            className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-1 leading-tight"
            style={{ fontFamily: SORA }}
          >
            أهلاً بك في مركز باعشن
          </h1>
          <p style={{ color: OCEAN.glow, opacity: 0.8 }} className="text-xs sm:text-sm">
            نظرة سريعة على عمليات اليوم مع اختصارات لأهم أدواتك حسب دورك.
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end shrink-0 max-w-[45%] sm:max-w-none">
          {roles.length === 0 && (
            <span
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap"
              style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}
            >
              لم يتم منح دور بعد
            </span>
          )}
          {roles.map((r) => (
            <span
              key={r}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap"
              style={{
                background: `${OCEAN.accent}33`,
                color: OCEAN.glow,
                border: `1px solid ${OCEAN.accent}55`,
              }}
            >
              {r}
            </span>
          ))}
        </div>
      </header>

      {/* Global drill-down filters — time range + branch segment. */}
      <div
        className="mb-4 sm:mb-6 rounded-2xl p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-3"
        style={{ background: OCEAN.panel, border: `1px solid ${OCEAN.panel2}` }}
        aria-label="نطاق زمني وقطاع"
      >
        <span className="text-[11px] font-bold" style={{ color: OCEAN.glow }}>
          النطاق:
        </span>
        {[
          { id: "today", label: "اليوم" },
          { id: "yesterday", label: "أمس" },
          { id: "7d", label: "٧ أيام" },
          { id: "30d", label: "٣٠ يوم" },
        ].map((r) => {
          const active = search.range === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() =>
                navigate({
                  search: (prev: Record<string, string>) => ({ ...prev, range: r.id, from: "", to: "" }),
                  replace: true,
                })
              }
              className="text-[11px] font-bold rounded-full px-3 h-8"
              style={{
                background: active ? OCEAN.glow : OCEAN.bg,
                color: active ? OCEAN.panel : OCEAN.glow,
                border: `1px solid ${OCEAN.panel2}`,
              }}
              aria-pressed={active}
            >
              {r.label}
            </button>
          );
        })}

        <span className="mx-2 h-5 w-px" style={{ background: OCEAN.panel2 }} aria-hidden />

        <span className="text-[11px] font-bold" style={{ color: OCEAN.glow }}>
          الفرع:
        </span>
        <select
          value={search.branch}
          onChange={(e) =>
            navigate({
              search: (prev: Record<string, string>) => ({ ...prev, branch: e.target.value }),
              replace: true,
            })
          }
          className="text-[11px] font-bold rounded-full px-3 h-8 outline-none"
          style={{
            background: OCEAN.bg,
            color: OCEAN.glow,
            border: `1px solid ${OCEAN.panel2}`,
          }}
          aria-label="اختيار الفرع"
        >
          <option value="">كل الفروع</option>
          {(branchesQ.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name_ar}
            </option>
          ))}
        </select>

        <span className="ms-auto text-[10px]" style={{ color: OCEAN.glow, opacity: 0.7 }}>
          {fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`}
          {branchId ? " · مخصص" : " · كل الفروع"}
        </span>
      </div>

      {/* Phase 7 — Enterprise Command Center KPIs (real data, 14 tiles) */}
      <CommandCenterKpiGridV2 filters={{ from: fromDate, to: toDate, branchId }} />


      {/* Legacy KPI strip (role-scoped period-over-period + sparklines) */}
      <KpiGrid />


      {/* Trends section — daily/weekly stats for developers */}
      <TrendsSection />

      {/* Magazine grid: Featured Inbox + Primary shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {/* Featured Unified Inbox */}
        <Link
          to="/admin/inbox"
          className="lg:col-span-8 relative overflow-hidden rounded-3xl sm:rounded-[2rem] p-5 sm:p-8 lg:p-10 group transition-transform hover:-translate-y-0.5"
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
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-5 sm:mb-6 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold mb-2 sm:mb-3"
                  style={{ background: OCEAN.accent, color: "#e0e7ff" }}
                >
                  <Sparkles className="h-3 w-3" /> البريد الموحّد
                </span>
                <h2
                  className="text-lg sm:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2 text-white leading-tight"
                  style={{ fontFamily: SORA }}
                >
                  صندوق الوارد الموحّد اليوم
                </h2>
                <p style={{ color: OCEAN.glow, opacity: 0.8 }} className="text-xs sm:text-sm">
                  إدارة كافة المراسلات والطلبات من منصة واحدة
                </p>
              </div>
              <span
                className="px-3 sm:px-5 py-2 sm:py-2.5 rounded-full font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 sm:gap-2 shrink-0 group-hover:scale-105 transition-transform whitespace-nowrap"
                style={{ background: "white", color: OCEAN.panel }}
              >
                <span className="hidden sm:inline">فتح الصندوق</span>
                <span className="sm:hidden">فتح</span>
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              <InboxRow
                accent
                color={OCEAN.glow}
                label="طلبات مرضى جديدة"
                hint={`${stats?.appointmentsPending ?? 0} بانتظار التأكيد`}
              />
              <InboxRow
                color={OCEAN.accent}
                label="طلبات صيدلية ومختبر"
                hint={`${stats?.ordersPending ?? 0} قيد المعالجة`}
              />
              <InboxRow color={OCEAN.accent} label="شكاوى وطلبات دعم" hint="راجع صفحة الشكاوى" />
            </div>
          </div>
        </Link>

        {/* Primary bento shortcuts */}
        <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 sm:gap-4">
          {primary.slice(0, 6).map((l) => (
            <ShortcutTile key={l.to} link={l} />
          ))}
        </div>
      </div>

      {/* Secondary shortcuts row */}
      {secondary.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-3 sm:mb-4 mt-2">
            <span className="w-1 h-5 rounded-full" style={{ background: OCEAN.glow }} />
            <h3 className="text-base sm:text-lg font-bold text-white" style={{ fontFamily: SORA }}>
              وصول إضافي
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {secondary.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className="p-3 sm:p-4 rounded-2xl text-center text-xs sm:text-sm font-bold flex flex-col items-center gap-1.5 sm:gap-2 transition-all hover:-translate-y-0.5"
                  style={{
                    background: `${OCEAN.panel}80`,
                    border: `1px solid ${OCEAN.panel2}`,
                    color: "#e0e7ff",
                  }}
                >
                  <span style={{ color: OCEAN.glow, display: "inline-flex" }}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <span className="truncate max-w-full">{l.label}</span>
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
      className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl h-full transition-all hover:-translate-y-0.5"
      style={{ ...style, transition: "border-color 0.2s, transform 0.2s" }}
    >
      <div className="flex justify-between items-center mb-3 sm:mb-4 gap-2">
        <div
          className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.12em] sm:tracking-[0.15em] min-w-0 truncate"
          style={{ color: labelColor }}
        >
          {label}
        </div>
        <span
          style={{ color: labelColor, opacity: 0.7, display: "inline-flex" }}
          className="shrink-0"
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      </div>
      <div className="text-2xl sm:text-3xl lg:text-4xl font-bold" style={{ fontFamily: SORA }}>
        {value}
      </div>
      {hint && (
        <div
          className="text-[11px] sm:text-xs mt-1.5 sm:mt-2 truncate"
          style={{ color: labelColor, opacity: 0.7 }}
        >
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
      className="rounded-2xl sm:rounded-3xl p-3 sm:p-5 flex flex-col items-center justify-center text-center gap-2 sm:gap-3 transition-all hover:-translate-y-0.5 group min-h-[92px] sm:min-h-[110px]"
      style={{
        background: `${OCEAN.panel2}33`,
        border: `1px solid ${OCEAN.panel2}`,
        color: "#e0e7ff",
      }}
    >
      <span style={{ color: OCEAN.glow, display: "inline-flex" }}>
        <Icon className="h-5 w-5 sm:h-6 sm:w-6 transition-transform group-hover:scale-110" />
      </span>
      <span className="text-xs sm:text-sm font-bold truncate max-w-full">{link.label}</span>
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
      className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl"
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
      <div className="flex-1 min-w-0 font-bold text-white text-xs sm:text-sm truncate">{label}</div>
      <div
        className="text-[11px] sm:text-xs shrink-0 text-end"
        style={{ color: OCEAN.glow, opacity: 0.7 }}
      >
        {hint}
      </div>
    </div>
  );
}

// ============================================================
// Trends section — real data, developer-focused daily/weekly
// ============================================================

const trendsQuery = (range: "week" | "month") =>
  queryOptions({
    queryKey: ["admin", "trends", range],
    queryFn: () => getAdminTrends({ data: { range } }),
    staleTime: 60_000,
  });

const SERIES_META = [
  { key: "appointments", label: "المواعيد", color: "#5cbdb9" },
  { key: "orders", label: "الطلبات", color: "#2d8a9e" },
  { key: "inquiries", label: "الاستفسارات", color: "#fbbf24" },
  { key: "patients", label: "مرضى جدد", color: "#a78bfa" },
  { key: "complaints", label: "الشكاوى", color: "#f87171" },
] as const;

function TrendsSection() {
  const [range, setRange] = useState<"week" | "month">("week");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(trendsQuery(range));

  const chartData =
    data?.series.appointments.map((row, i) => ({
      day: row.day.slice(5), // MM-DD
      appointments: row.count,
      orders: data.series.orders[i]?.count ?? 0,
      inquiries: data.series.inquiries[i]?.count ?? 0,
      patients: data.series.patients[i]?.count ?? 0,
      complaints: data.series.complaints[i]?.count ?? 0,
    })) ?? [];

  return (
    <section
      className="rounded-3xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8"
      style={{ background: OCEAN.panel, border: `1px solid ${OCEAN.panel2}` }}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-5 sm:mb-6 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div
            className="text-[10px] sm:text-[11px] font-bold tracking-[0.25em] sm:tracking-[0.3em] uppercase mb-1.5"
            style={{ color: OCEAN.glow, opacity: 0.75 }}
          >
            إحصائيات المطوّرين
          </div>
          <h2
            className="text-base sm:text-xl lg:text-2xl font-bold text-white leading-tight"
            style={{ fontFamily: SORA }}
          >
            الاتجاهات {range === "week" ? "اليومية (٧ أيام)" : "الأسبوعية (٣٠ يومًا)"}
          </h2>
        </div>
        <div
          className="inline-flex rounded-full p-1 shrink-0"
          style={{ background: `${OCEAN.bg}`, border: `1px solid ${OCEAN.panel2}` }}
        >
          {(["week", "month"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-colors"
              style={
                range === r
                  ? { background: OCEAN.glow, color: OCEAN.panel }
                  : { background: "transparent", color: OCEAN.glow, opacity: 0.7 }
              }
            >
              {r === "week" ? "أسبوع" : "شهر"}
            </button>
          ))}
        </div>
      </header>

      {isError && (
        <div
          className="p-3 sm:p-4 rounded-2xl text-xs sm:text-sm mb-4 flex justify-between items-center gap-3"
          style={{
            background: "rgba(248,113,113,0.1)",
            color: "#fca5a5",
            border: "1px solid rgba(248,113,113,0.3)",
          }}
        >
          <span className="min-w-0 truncate">
            تعذّر تحميل الإحصائيات: {(error as Error)?.message ?? "خطأ غير معروف"}
          </span>
          <button onClick={() => refetch()} className="underline text-xs font-bold shrink-0">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Totals + growth badges */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 mb-5 sm:mb-6">
          {SERIES_META.map((s) => {
            const total = data.totals[s.key];
            const growth = data.growth[s.key];
            const up = growth >= 0;
            return (
              <div
                key={s.key}
                className="p-3 sm:p-4 rounded-2xl"
                style={{
                  background: `${OCEAN.panel2}4d`,
                  border: `1px solid ${OCEAN.panel2}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5 sm:mb-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span
                    className="text-[11px] sm:text-xs font-bold truncate"
                    style={{ color: OCEAN.glow, opacity: 0.85 }}
                  >
                    {s.label}
                  </span>
                </div>
                <div
                  className="text-xl sm:text-2xl font-bold text-white"
                  style={{ fontFamily: SORA }}
                >
                  {total.toLocaleString("ar-EG")}
                </div>
                <div
                  className="text-[10px] sm:text-[11px] font-bold mt-1"
                  style={{ color: up ? "#5cbdb9" : "#fca5a5" }}
                >
                  {up ? "▲" : "▼"} {Math.abs(growth)}٪ vs السابق
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <div
        className="rounded-2xl p-3 sm:p-4 h-[240px] sm:h-[320px]"
        style={{ background: `${OCEAN.bg}80`, border: `1px solid ${OCEAN.panel2}` }}
      >
        {isLoading || isFetching ? (
          <div className="h-full grid place-items-center text-sm" style={{ color: OCEAN.glow }}>
            جارٍ التحميل…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                {SERIES_META.map((s) => (
                  <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={OCEAN.panel2} opacity={0.5} />
              <XAxis dataKey="day" stroke={OCEAN.glow} tick={{ fontSize: 11 }} />
              <YAxis stroke={OCEAN.glow} tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: OCEAN.panel,
                  border: `1px solid ${OCEAN.panel2}`,
                  borderRadius: 12,
                  color: "#e0e7ff",
                }}
                labelStyle={{ color: OCEAN.glow, fontWeight: 700 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {SERIES_META.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#g-${s.key})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
