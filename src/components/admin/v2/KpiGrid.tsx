/**
 * KpiGrid — Overview KPIs section with range switcher, loading/error
 * states and role-scoped rendering. Fetches getAdminKpis and maps each
 * KPI onto <KpiCard> with an icon + drill-down link.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CalendarCheck,
  Clock,
  Package,
  Users,
  MessageSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { getAdminKpis, type AdminKpi, type AdminKpiKey } from "@/lib/admin.functions";
import { KpiCard, KpiCardError, KpiCardSkeleton } from "./KpiCard";
import { ExportMenu } from "./ExportMenu";
import type { Column } from "@/lib/export-utils";

const OCEAN = {
  bg: "#081628",
  panel: "#0c2340",
  panel2: "#1a4a6e",
  accent: "#2d8a9e",
  glow: "#5cbdb9",
};

const ICONS: Record<AdminKpiKey, LucideIcon> = {
  appointments: CalendarCheck,
  appointments_today: Clock,
  orders: Package,
  patients_new: Users,
  inquiries: Sparkles,
  complaints: MessageSquare,
};

type Range = "7d" | "30d" | "90d";
const RANGE_LABELS: Record<Range, string> = {
  "7d": "٧ أيام",
  "30d": "٣٠ يوم",
  "90d": "٩٠ يوم",
};

const KPI_EXPORT_COLS: Column<AdminKpi>[] = [
  { header: "المؤشر", accessor: (k) => k.label },
  { header: "القيمة الحالية", accessor: (k) => k.current },
  { header: "القيمة السابقة", accessor: (k) => k.previous },
  { header: "الفرق", accessor: (k) => k.deltaAbs },
  { header: "النسبة %", accessor: (k) => (k.deltaPct == null ? "" : `${k.deltaPct.toFixed(1)}%`) },
];

export function KpiGrid() {
  const [range, setRange] = useState<Range>("7d");
  const fetchKpis = useServerFn(getAdminKpis);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin", "kpis", range],
    queryFn: () => fetchKpis({ data: { range } }),
    staleTime: 60_000,
  });

  return (
    <section className="mb-6 sm:mb-10" aria-labelledby="kpi-heading">
      <div className="flex items-center justify-between mb-3 sm:mb-4 gap-3 flex-wrap">
        <div>
          <h2
            id="kpi-heading"
            className="text-base sm:text-lg font-bold text-white"
            style={{ fontFamily: "'Sora', 'Cairo', system-ui, sans-serif" }}
          >
            المؤشرات الرئيسية
          </h2>
          <p className="text-[11px] sm:text-xs" style={{ color: OCEAN.glow, opacity: 0.7 }}>
            مقارنة بالفترة السابقة المكافئة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            allowed
            disabled={isLoading || isError}
            filename={`kpis-${range}`}
            title={`المؤشرات الرئيسية (${RANGE_LABELS[range]})`}
            subtitle="مقارنة بالفترة السابقة المكافئة"
            columns={KPI_EXPORT_COLS}
            rows={data?.kpis ?? []}
          />
          <div
            className="inline-flex rounded-full p-1"
            style={{ background: OCEAN.bg, border: `1px solid ${OCEAN.panel2}` }}
          >
            {(Object.keys(RANGE_LABELS) as Range[]).map((r) => {
              const active = r === range;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className="px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold transition-colors"
                  style={
                    active
                      ? { background: OCEAN.glow, color: OCEAN.panel }
                      : { color: OCEAN.glow, opacity: 0.7 }
                  }
                >
                  {RANGE_LABELS[r]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} colors={OCEAN} />)
        ) : isError ? (
          <div className="col-span-2 lg:col-span-4">
            <KpiCardError onRetry={() => refetch()} colors={OCEAN} />
          </div>
        ) : !data || data.kpis.length === 0 ? (
          <div
            className="col-span-2 lg:col-span-4 rounded-2xl p-6 text-center text-sm"
            style={{
              background: OCEAN.panel,
              border: `1px solid ${OCEAN.panel2}`,
              color: OCEAN.glow,
            }}
          >
            لا توجد مؤشرات مرئية لدورك الحالي.
          </div>
        ) : (
          data.kpis.map((k: AdminKpi) => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={k.current}
              previous={k.previous}
              deltaPct={k.deltaPct}
              deltaAbs={k.deltaAbs}
              positiveIsGood={k.positiveIsGood}
              sparkline={k.sparkline}
              icon={ICONS[k.key]}
              drillTo={k.drillTo}
              hint={
                k.key === "appointments_today"
                  ? "مواعيد مجدولة اليوم"
                  : k.previous > 0
                    ? `السابق: ${new Intl.NumberFormat("ar-EG").format(k.previous)}`
                    : "لا توجد بيانات سابقة"
              }
              colors={OCEAN}
            />
          ))
        )}
      </div>

      {isFetching && !isLoading && (
        <p className="mt-2 text-[10px]" style={{ color: OCEAN.glow, opacity: 0.6 }}>
          جاري التحديث…
        </p>
      )}
    </section>
  );
}
