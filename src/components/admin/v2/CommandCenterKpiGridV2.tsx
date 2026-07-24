/**
 * Phase 7 — Real-data KPI grid for the Enterprise Admin Command Center.
 *
 * Renders 14 KPIs returned by `getCommandCenterKpisV2`. Each card supports
 * four states independently:
 *   - Loading   → skeleton
 *   - Error     → per-KPI error chip with retry
 *   - Empty     → subdued "0" with a hint
 *   - Loaded    → value + drill-down Link
 *
 * The grid itself also has a top-level error state (auth/RPC failed).
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCommandCenterKpisV2,
  type CommandCenterKpiV2,
} from "@/lib/admin/command-center-kpis-v2.functions";
import {
  CalendarCheck,
  BadgeCheck,
  Inbox,
  XCircle,
  UserX,
  Gauge,
  CalendarClock,
  UserPlus,
  ClipboardList,
  ShieldCheck,
  Receipt,
  MessageCircle,
  LifeBuoy,
  PlugZap,
  RefreshCw,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

const OCEAN = {
  bg: "#081628",
  panel: "#0c2340",
  panel2: "#1a4a6e",
  glow: "#5cbdb9",
  danger: "#ef4444",
  ok: "#10b981",
};

const ICONS: Record<CommandCenterKpiV2["key"], LucideIcon> = {
  appointments_today: CalendarCheck,
  appointments_confirmed: BadgeCheck,
  pending_requests: Inbox,
  cancellations_today: XCircle,
  no_show_rate: UserX,
  occupancy: Gauge,
  available_slots: CalendarClock,
  new_patients_today: UserPlus,
  pending_reports: ClipboardList,
  insurance_pending: ShieldCheck,
  invoices_unpaid: Receipt,
  whatsapp_requests: MessageCircle,
  support_open: LifeBuoy,
  integration_failures: PlugZap,
};

function formatValue(k: CommandCenterKpiV2): string {
  if (k.value == null) return "—";
  if (k.isPercent) return `${k.value}%`;
  return new Intl.NumberFormat("ar-EG").format(k.value);
}

function KpiSkeleton() {
  return (
    <div
      className="rounded-2xl p-4 sm:p-5 h-[132px] animate-pulse"
      style={{ background: OCEAN.panel, border: `1px solid ${OCEAN.panel2}` }}
      aria-hidden="true"
    >
      <div className="h-4 w-24 rounded" style={{ background: OCEAN.panel2 }} />
      <div className="h-9 w-20 mt-4 rounded" style={{ background: OCEAN.panel2 }} />
      <div className="h-3 w-32 mt-3 rounded" style={{ background: OCEAN.panel2 }} />
    </div>
  );
}

function appendDrillFilters(
  to: string,
  filters: { from: string; to: string; branchId: string | null },
): string {
  const [pathAndSearch, hash] = to.split("#");
  const [path, existing] = pathAndSearch.split("?");
  const sp = new URLSearchParams(existing ?? "");
  // Only set if not already present so KPI-specific filters (e.g. status=confirmed) win
  if (!sp.has("from")) sp.set("from", filters.from);
  if (!sp.has("to")) sp.set("to", filters.to);
  if (filters.branchId && !sp.has("branch")) sp.set("branch", filters.branchId);
  const qs = sp.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

function KpiTile({
  k,
  filters,
}: {
  k: CommandCenterKpiV2;
  filters: { from: string; to: string; branchId: string | null };
}) {
  const Icon = ICONS[k.key];
  const unavailable = k.unavailable;
  const empty = k.empty && !unavailable;
  const href = appendDrillFilters(k.drillTo, filters);

  const body = (
    <div
      className="group rounded-2xl p-4 sm:p-5 h-full transition-all hover:-translate-y-0.5"
      style={{
        background: OCEAN.panel,
        border: `1px solid ${unavailable ? OCEAN.danger : OCEAN.panel2}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="text-[11px] sm:text-xs font-bold truncate"
            style={{ color: OCEAN.glow }}
          >
            {k.label}
          </div>
          {k.hint && (
            <div
              className="text-[10px] mt-0.5 truncate"
              style={{ color: OCEAN.glow, opacity: 0.6 }}
            >
              {k.hint}
            </div>
          )}
        </div>
        <div
          className="shrink-0 grid place-items-center h-8 w-8 rounded-xl"
          style={{ background: OCEAN.bg, color: OCEAN.glow }}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3">
        {unavailable ? (
          <div
            className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: OCEAN.danger }}
            role="alert"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            غير متاح
          </div>
        ) : (
          <div
            className="text-2xl sm:text-3xl font-black text-white"
            style={{ fontFamily: "'Sora', 'Cairo', system-ui, sans-serif" }}
          >
            {formatValue(k)}
          </div>
        )}
        {empty && !unavailable && (
          <div className="text-[10px] mt-1" style={{ color: OCEAN.glow, opacity: 0.65 }}>
            لا توجد بيانات حتى الآن
          </div>
        )}
        {unavailable && k.errorMessage && (
          <div
            className="text-[10px] mt-1 truncate"
            title={k.errorMessage}
            style={{ color: OCEAN.danger, opacity: 0.85 }}
          >
            {k.errorMessage}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Link
      to={href}
      preload="intent"
      aria-label={`فتح تفاصيل ${k.label}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-2xl"
    >
      {body}
    </Link>
  );
}

export function CommandCenterKpiGridV2() {
  const fetchKpis = useServerFn(getCommandCenterKpisV2);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin", "command-center-kpis-v2"],
    queryFn: () => fetchKpis(),
    staleTime: 30_000,
  });

  return (
    <section className="mb-6 sm:mb-10" aria-labelledby="cc-kpi-heading">
      <div className="flex items-center justify-between mb-3 sm:mb-4 gap-3 flex-wrap">
        <div>
          <h2
            id="cc-kpi-heading"
            className="text-base sm:text-lg font-bold text-white"
            style={{ fontFamily: "'Sora', 'Cairo', system-ui, sans-serif" }}
          >
            مؤشرات مركز التحكم
          </h2>
          <p className="text-[11px] sm:text-xs" style={{ color: OCEAN.glow, opacity: 0.7 }}>
            بيانات حية — كل بطاقة قابلة للنقر للانتقال إلى التفاصيل
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold rounded-full px-3 h-8"
          style={{
            background: OCEAN.bg,
            color: OCEAN.glow,
            border: `1px solid ${OCEAN.panel2}`,
            opacity: isFetching ? 0.6 : 1,
          }}
          aria-label="تحديث المؤشرات"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {isError ? (
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: OCEAN.panel,
            border: `1px solid ${OCEAN.danger}`,
            color: OCEAN.glow,
          }}
          role="alert"
        >
          <AlertTriangle
            className="h-6 w-6 mx-auto mb-2"
            style={{ color: OCEAN.danger }}
            aria-hidden="true"
          />
          <div className="text-sm font-bold text-white mb-1">تعذّر تحميل المؤشرات</div>
          <div className="text-xs mb-3" style={{ opacity: 0.7 }}>
            تحقق من الاتصال أو صلاحيتك ثم أعد المحاولة
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-4 h-9"
            style={{ background: OCEAN.glow, color: OCEAN.panel }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3 sm:gap-4">
          {isLoading
            ? Array.from({ length: 14 }).map((_, i) => <KpiSkeleton key={i} />)
            : (data?.kpis ?? []).map((k) => <KpiTile key={k.key} k={k} />)}
        </div>
      )}
    </section>
  );
}
