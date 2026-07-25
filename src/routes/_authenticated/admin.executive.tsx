/**
 * /admin/executive — Executive KPI dashboard (E3).
 *
 * Reads pre-aggregated rows from `bi_daily_kpis` and renders headline KPI
 * cards with period-over-period deltas plus a daily trend list. Includes a
 * one-click "Refresh now" button that recomputes the rollup on demand
 * (calls `refresh_bi_daily_kpis`).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, RefreshCw, Download, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  getExecutiveSummary,
  refreshBiKpisNow,
  type ExecutiveKpi,
  type ExecutiveSummary,
} from "@/lib/admin/bi.functions";
import { getMyRoles } from "@/lib/admin.functions";

const WINDOWS = [7, 14, 30, 60, 90] as const;

const summaryQuery = (windowDays: number) =>
  queryOptions({
    queryKey: ["admin", "executive", windowDays],
    queryFn: () => getExecutiveSummary({ data: { windowDays } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/_authenticated/admin/executive")({
  head: () => ({
    meta: [{ title: "الملخص التنفيذي | لوحة الإدارة" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: async () => {
    try {
      const { roles } = await getMyRoles();
      const ok = roles.includes("admin") || roles.includes("super_admin");
      if (!ok) throw redirect({ to: "/" });
    } catch {
      throw redirect({ to: "/" });
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(summaryQuery(14)),
  component: ExecutivePage,
});

function fmtNumber(n: number, unit: string): string {
  if (unit === "SAR") return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${unit}`;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[color:var(--ac-ink-3)]">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }
  const up = delta >= 0;
  const cls = up
    ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
    : "text-red-600 bg-red-500/10 border-red-500/20";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

function KpiCard({ kpi }: { kpi: ExecutiveKpi }) {
  return (
    <div className="rounded-2xl border border-[color:var(--ac-border)] bg-[color:var(--ac-bg-2)] p-4">
      <div className="text-xs text-[color:var(--ac-ink-3)]">{kpi.label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{fmtNumber(kpi.value, kpi.unit)}</div>
      <div className="mt-2 flex items-center justify-between">
        <DeltaBadge delta={kpi.delta_pct} />
        <span className="text-[10px] text-[color:var(--ac-ink-3)]">
          سابقًا: {fmtNumber(kpi.previous, kpi.unit)}
        </span>
      </div>
    </div>
  );
}

function TrendTable({ summary }: { summary: ExecutiveSummary }) {
  // Aggregate series by day+metric for a compact table (last 14 rows per metric).
  const byMetric = new Map<string, Array<{ day: string; value: number }>>();
  for (const p of summary.series) {
    const arr = byMetric.get(p.metric) ?? [];
    arr.push({ day: p.day, value: p.value });
    byMetric.set(p.metric, arr);
  }
  return (
    <div className="rounded-2xl border border-[color:var(--ac-border)] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--ac-bg-3)]">
          <tr>
            <th className="text-right p-3 font-medium">المقياس</th>
            <th className="text-right p-3 font-medium">مجموع الفترة</th>
            <th className="text-right p-3 font-medium">أيام مسجلة</th>
            <th className="text-right p-3 font-medium">آخر يوم</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(byMetric.entries()).map(([metric, points]) => {
            const total = points.reduce((s, p) => s + p.value, 0);
            const last = points[points.length - 1];
            return (
              <tr key={metric} className="border-t border-[color:var(--ac-border)]">
                <td className="p-3 font-medium">{metric}</td>
                <td className="p-3">
                  {total.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </td>
                <td className="p-3">{points.length}</td>
                <td className="p-3 text-[color:var(--ac-ink-3)]">
                  {last ? `${last.day} · ${last.value.toLocaleString("en-US")}` : "—"}
                </td>
              </tr>
            );
          })}
          {byMetric.size === 0 ? (
            <tr>
              <td colSpan={4} className="p-6 text-center text-[color:var(--ac-ink-3)]">
                لا توجد بيانات بعد — اضغط "تحديث الآن" لبدء التجميع.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ExecutivePage() {
  const [windowDays, setWindowDays] = useState<number>(14);
  const qc = useQueryClient();
  const refreshFn = useServerFn(refreshBiKpisNow);
  const [busy, setBusy] = useState(false);
  const { data, isFetching } = useSuspenseQuery(summaryQuery(windowDays));

  const onRefresh = async () => {
    setBusy(true);
    try {
      await refreshFn({ data: { daysBack: Math.min(90, windowDays + 1) } });
      await qc.invalidateQueries({ queryKey: ["admin", "executive"] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-console" dir="rtl">
      <div className="p-4 md:p-6 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent)]">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold">الملخص التنفيذي</h1>
              <p className="text-xs text-[color:var(--ac-ink-3)]">
                KPIs مجمّعة يوميًا (Data Warehouse) — يُحدَّث تلقائيًا كل ليلة
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="h-9 rounded-lg border border-[color:var(--ac-border)] bg-[color:var(--ac-bg-2)] px-2 text-sm"
            >
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  آخر {w} يوم
                </option>
              ))}
            </select>
            <button
              onClick={onRefresh}
              disabled={busy || isFetching}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[color:var(--ac-border)] bg-[color:var(--ac-bg-2)] text-sm hover:bg-[color:var(--ac-bg-3)] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
              تحديث الآن
            </button>
            <a
              href="/api/public/warehouse/kpis?format=csv&days=30"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[color:var(--ac-border)] bg-[color:var(--ac-bg-2)] text-sm hover:bg-[color:var(--ac-bg-3)]"
              title="يتطلب Bearer token — للاستخدام من BI tools"
            >
              <Download className="h-4 w-4" />
              تصدير CSV
            </a>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {data.kpis.map((k) => (
            <KpiCard key={k.key} kpi={k} />
          ))}
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">اتجاهات الفترة</h2>
          <TrendTable summary={data} />
        </section>

        <footer className="text-[11px] text-[color:var(--ac-ink-3)]">
          آخر تحديث: {new Date(data.generated_at).toLocaleString("ar-SA")} · نافذة{" "}
          {data.window_days} يوم
        </footer>
      </div>
    </div>
  );
}
