/**
 * /admin/web-vitals — Web Vitals dashboard (LCP/INP/CLS + FCP/TTFB)
 * with per-flow path filtering (booking / reschedule-cancel / waitlist / custom).
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, Filter, Gauge, RefreshCw } from "lucide-react";
import {
  getWebVitalsSummary,
  type MetricStats,
  type WebVitalMetric,
  type WebVitalsSummary,
} from "@/lib/admin/web-vitals.functions";

type Preset = { id: string; label: string; path: string | null };

const PRESETS: Preset[] = [
  { id: "all", label: "الكل", path: null },
  { id: "booking", label: "الحجز /book", path: "/book" },
  { id: "portal-appts", label: "المواعيد (إعادة/إلغاء) /portal/appointments", path: "/portal/appointments" },
  { id: "waitlist", label: "قائمة الانتظار /waitlist", path: "/waitlist" },
  { id: "portal", label: "بوابة المريض /portal", path: "/portal" },
];

const WINDOWS = [1, 6, 24, 24 * 7, 24 * 30];

type Filters = { windowHours: number; pathContains: string | null };

const summaryQuery = (f: Filters) =>
  queryOptions({
    queryKey: ["admin", "web-vitals", f],
    queryFn: () =>
      getWebVitalsSummary({
        data: { windowHours: f.windowHours, pathContains: f.pathContains ?? undefined },
      }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_authenticated/admin/web-vitals")({
  head: () => ({
    meta: [
      { title: "Web Vitals | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(summaryQuery({ windowHours: 24, pathContains: null })),
  component: WebVitalsPage,
});

function WebVitalsPage() {
  const [presetId, setPresetId] = useState<string>("all");
  const [customPath, setCustomPath] = useState<string>("");
  const [windowHours, setWindowHours] = useState<number>(24);
  const qc = useQueryClient();

  const filters: Filters = useMemo(() => {
    const preset = PRESETS.find((p) => p.id === presetId);
    const trimmed = customPath.trim();
    return {
      windowHours,
      pathContains: trimmed ? trimmed : preset?.path ?? null,
    };
  }, [presetId, customPath, windowHours]);

  const { data, isFetching } = useSuspenseQuery(summaryQuery(filters));

  return (
    <div className="admin-console" dir="rtl">
      <div className="p-4 md:p-6 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent)]">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold">Web Vitals</h1>
              <p className="text-xs text-[color:var(--ac-ink-3)]">
                LCP / INP / CLS (+ FCP / TTFB) — قياسات فعلية من متصفحات المستخدمين
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "web-vitals"] })}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ac-line)] px-3 h-9 text-sm hover:bg-[color:var(--ac-subtle)]"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </header>

        {/* Filters */}
        <section className="ac-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4" /> فلاتر
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = presetId === p.id && !customPath.trim();
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPresetId(p.id);
                    setCustomPath("");
                  }}
                  className={[
                    "rounded-full px-3 h-8 text-xs border transition-colors",
                    active
                      ? "bg-[color:var(--ac-accent)] text-white border-transparent"
                      : "border-[color:var(--ac-line)] hover:bg-[color:var(--ac-subtle)]",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-[color:var(--ac-ink-2)]">مسار مخصص (ILIKE contains)</span>
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="/book أو /portal/appointments"
                className="h-9 rounded-lg border border-[color:var(--ac-line)] px-3 text-sm bg-white"
                aria-label="مسار مخصص"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-[color:var(--ac-ink-2)]">النافذة الزمنية</span>
              <select
                value={windowHours}
                onChange={(e) => setWindowHours(Number(e.target.value))}
                className="h-9 rounded-lg border border-[color:var(--ac-line)] px-3 text-sm bg-white"
                aria-label="النافذة الزمنية"
              >
                {WINDOWS.map((h) => (
                  <option key={h} value={h}>
                    {h < 24 ? `آخر ${h} ساعة` : `آخر ${h / 24} يوم`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="text-[11px] text-[color:var(--ac-ink-3)]">
            العينات: {data.totalSamples.toLocaleString("ar-EG")}
            {data.truncated ? " (مقتطعة — قلّل النافذة الزمنية لرؤية الأحدث)" : ""}
            {data.pathContains ? ` · المسار: ${data.pathContains}` : ""}
          </div>
        </section>

        {/* Metrics grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(["LCP", "INP", "CLS"] as WebVitalMetric[]).map((m) => (
            <MetricCard key={m} stats={data.stats.find((s) => s.metric === m)!} />
          ))}
        </section>
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(["FCP", "TTFB"] as WebVitalMetric[]).map((m) => (
            <MetricCard key={m} stats={data.stats.find((s) => s.metric === m)!} />
          ))}
        </section>

        {/* Top paths */}
        <section className="ac-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Activity className="h-4 w-4" /> أكثر المسارات نشاطًا (ضمن الفلتر)
          </div>
          {data.topPaths.length === 0 ? (
            <div className="text-sm text-[color:var(--ac-ink-3)]">لا توجد بيانات.</div>
          ) : (
            <ul className="divide-y divide-[color:var(--ac-line)]">
              {data.topPaths.map((p) => (
                <li key={p.path} className="flex items-center justify-between py-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setCustomPath(p.path)}
                    className="font-mono text-xs text-[color:var(--ac-accent)] hover:underline text-start"
                    title="اضبط الفلتر على هذا المسار"
                  >
                    {p.path}
                  </button>
                  <span className="text-[color:var(--ac-ink-3)] tabular-nums">
                    {p.count.toLocaleString("ar-EG")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function formatMetric(metric: WebVitalMetric, v: number | null): string {
  if (v === null) return "—";
  if (metric === "CLS") return v.toFixed(3);
  return `${Math.round(v).toLocaleString("ar-EG")} ms`;
}

function ratingOf(metric: WebVitalMetric, v: number | null): "good" | "needs" | "poor" | "none" {
  if (v === null) return "none";
  const t = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800] }[metric];
  if (v <= t[0]) return "good";
  if (v <= t[1]) return "needs";
  return "poor";
}

const RATING_STYLES: Record<"good" | "needs" | "poor" | "none", string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  needs: "bg-amber-50 text-amber-700 border-amber-200",
  poor: "bg-red-50 text-red-700 border-red-200",
  none: "bg-slate-50 text-slate-500 border-slate-200",
};

function MetricCard({ stats }: { stats: MetricStats }) {
  const rating = ratingOf(stats.metric, stats.p75);
  const total = Math.max(1, stats.good + stats.needs + stats.poor);
  return (
    <div className="ac-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-[color:var(--ac-ink-3)]">{stats.metric}</div>
          <div className="text-2xl font-bold tabular-nums mt-1">
            {formatMetric(stats.metric, stats.p75)}
          </div>
          <div className="text-[11px] text-[color:var(--ac-ink-3)] mt-0.5">
            p75 · عيّنات: {stats.count.toLocaleString("ar-EG")}
          </div>
        </div>
        <span
          className={`text-[10px] rounded-full border px-2 py-0.5 ${RATING_STYLES[rating]}`}
          aria-label={`تقييم ${rating}`}
        >
          {rating === "good" ? "جيد" : rating === "needs" ? "بحاجة تحسين" : rating === "poor" ? "ضعيف" : "لا بيانات"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] text-[color:var(--ac-ink-3)]">
        <div>p50: <span className="font-semibold text-[color:var(--ac-ink-1)]">{formatMetric(stats.metric, stats.p50)}</span></div>
        <div>p75: <span className="font-semibold text-[color:var(--ac-ink-1)]">{formatMetric(stats.metric, stats.p75)}</span></div>
        <div>p95: <span className="font-semibold text-[color:var(--ac-ink-1)]">{formatMetric(stats.metric, stats.p95)}</span></div>
      </div>
      <div className="mt-3 h-2 w-full rounded-full overflow-hidden flex bg-slate-100" aria-hidden="true">
        <div className="bg-emerald-400" style={{ width: `${(stats.good / total) * 100}%` }} />
        <div className="bg-amber-400" style={{ width: `${(stats.needs / total) * 100}%` }} />
        <div className="bg-red-400" style={{ width: `${(stats.poor / total) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[color:var(--ac-ink-3)] tabular-nums">
        <span>جيد {stats.good}</span>
        <span>بحاجة {stats.needs}</span>
        <span>ضعيف {stats.poor}</span>
      </div>
    </div>
  );
}
