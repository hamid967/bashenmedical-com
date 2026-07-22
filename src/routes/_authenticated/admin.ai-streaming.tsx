/**
 * /admin/ai-streaming — Monitoring for AI streaming interface.
 * Shows latency percentiles, delta counts, resume attempts, and error rate
 * with a real-time alert banner when the error rate exceeds thresholds.
 * Restricted to admin / super_admin.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { getMyRoles } from "@/lib/admin.functions";
import {
  getStreamSummary,
  listStreamEvents,
  type StreamSummary,
  type StreamEventRow,
} from "@/lib/admin/ai-streaming.functions";

type Surface = "all" | "public" | "portal" | "admin";

const WINDOWS: Array<{ label: string; minutes: number }> = [
  { label: "15د", minutes: 15 },
  { label: "1س", minutes: 60 },
  { label: "6س", minutes: 6 * 60 },
  { label: "24س", minutes: 24 * 60 },
  { label: "7 أيام", minutes: 7 * 24 * 60 },
];

const summaryQuery = (windowMinutes: number, surface: Surface) =>
  queryOptions({
    queryKey: ["admin", "ai-streaming", "summary", windowMinutes, surface],
    queryFn: () => getStreamSummary({ data: { windowMinutes, surface } }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

const eventsQuery = (windowMinutes: number, surface: Surface, onlyErrors: boolean) =>
  queryOptions({
    queryKey: ["admin", "ai-streaming", "events", windowMinutes, surface, onlyErrors],
    queryFn: () => listStreamEvents({ data: { windowMinutes, surface, onlyErrors, limit: 100 } }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

export const Route = createFileRoute("/_authenticated/admin/ai-streaming")({
  head: () => ({
    meta: [
      { title: "AI Streaming Monitor | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    try {
      const { roles } = await getMyRoles();
      const isStaff = roles.includes("admin") || roles.includes("super_admin");
      if (!isStaff) throw redirect({ to: "/" });
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/auth" });
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(summaryQuery(60, "all")),
  component: AiStreamingMonitor,
});

function AiStreamingMonitor() {
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [surface, setSurface] = useState<Surface>("all");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const qc = useQueryClient();

  const { data: summary } = useSuspenseQuery(summaryQuery(windowMinutes, surface));
  const { data: events } = useSuspenseQuery(eventsQuery(windowMinutes, surface, onlyErrors));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "ai-streaming"] });
  };

  return (
    <div className="admin-console" dir="rtl">
      <div className="p-4 md:p-6 space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl grid place-items-center"
              style={{ background: "var(--ac-accent-soft)", color: "var(--ac-accent)" }}
            >
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold">مراقبة الـAI Streaming</h1>
              <p className="text-xs" style={{ color: "var(--ac-ink-3)" }}>
                زمن الاستجابة، عدد الـdeltas، محاولات الاستئناف، ومعدل الأخطاء عبر الأسطح الثلاثة
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SurfaceTabs value={surface} onChange={setSurface} />
            <WindowTabs value={windowMinutes} onChange={setWindowMinutes} />
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
              style={{ borderColor: "var(--ac-border)" }}
            >
              <RefreshCw className="h-3 w-3" /> تحديث
            </button>
          </div>
        </header>

        <AlertBanner alert={summary.alert} />

        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Kpi label="إجمالي الطلبات" value={summary.total.toLocaleString("ar-EG")} />
          <Kpi label="مكتملة" value={summary.completed.toLocaleString("ar-EG")} tone="ok" />
          <Kpi
            label="أخطاء"
            value={summary.errors.toLocaleString("ar-EG")}
            tone={summary.errors ? "warn" : "ok"}
          />
          <Kpi label="إلغاءات المستخدم" value={summary.aborted.toLocaleString("ar-EG")} />
          <Kpi
            label="معدل الأخطاء"
            value={`${(summary.errorRate * 100).toFixed(1)}%`}
            tone={summary.alert.level}
          />
          <Kpi
            label="معدل الاستئناف"
            value={`${(summary.resumeRate * 100).toFixed(1)}%`}
            tone={summary.resumeRate > 0.15 ? "warn" : "ok"}
          />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <LatencyCard summary={summary} />
          <DeltaCard summary={summary} />
          <BucketsCard summary={summary} />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ModelBreakdown summary={summary} />
          <ErrorBreakdown summary={summary} />
        </section>

        <section
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface)" }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between border-b"
            style={{ borderColor: "var(--ac-border)" }}
          >
            <h2 className="font-semibold text-sm">آخر الأحداث</h2>
            <label className="inline-flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(e) => setOnlyErrors(e.target.checked)}
              />
              الأخطاء فقط
            </label>
          </div>
          <EventsTable rows={events} />
        </section>
      </div>
    </div>
  );
}

function SurfaceTabs({ value, onChange }: { value: Surface; onChange: (v: Surface) => void }) {
  const opts: Array<{ v: Surface; label: string }> = [
    { v: "all", label: "الكل" },
    { v: "public", label: "عام" },
    { v: "portal", label: "بوابة" },
    { v: "admin", label: "إدارة" },
  ];
  return (
    <div
      className="inline-flex rounded-md border overflow-hidden"
      style={{ borderColor: "var(--ac-border)" }}
    >
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className="px-2 py-1 text-xs"
          style={{
            background: o.v === value ? "var(--ac-accent-soft)" : "transparent",
            color: o.v === value ? "var(--ac-accent)" : "var(--ac-ink-2)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function WindowTabs({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div
      className="inline-flex rounded-md border overflow-hidden"
      style={{ borderColor: "var(--ac-border)" }}
    >
      {WINDOWS.map((w) => (
        <button
          key={w.minutes}
          type="button"
          onClick={() => onChange(w.minutes)}
          className="px-2 py-1 text-xs"
          style={{
            background: w.minutes === value ? "var(--ac-accent-soft)" : "transparent",
            color: w.minutes === value ? "var(--ac-accent)" : "var(--ac-ink-2)",
          }}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

function AlertBanner({ alert }: { alert: StreamSummary["alert"] }) {
  if (alert.level === "ok") {
    return (
      <div
        className="rounded-lg border px-3 py-2 flex items-center gap-2 text-sm"
        style={{
          borderColor: "var(--ac-border)",
          background: "var(--ac-surface)",
          color: "var(--ac-ink-2)",
        }}
        role="status"
      >
        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--ac-success, #16a34a)" }} />
        الأنظمة تعمل ضمن الحدود الطبيعية. عتبة التحذير {(alert.threshold.warn * 100).toFixed(0)}% —
        الحد الحرج {(alert.threshold.critical * 100).toFixed(0)}% (بعد {alert.minSamples}+ طلبات).
      </div>
    );
  }
  const isCritical = alert.level === "critical";
  return (
    <div
      className="rounded-lg border px-3 py-3 flex items-start gap-2 text-sm"
      role="alert"
      aria-live="assertive"
      style={{
        borderColor: isCritical ? "var(--ac-danger, #dc2626)" : "var(--ac-warning, #d97706)",
        background: isCritical ? "rgba(220,38,38,0.08)" : "rgba(217,119,6,0.08)",
        color: isCritical ? "var(--ac-danger, #dc2626)" : "var(--ac-warning, #d97706)",
      }}
    >
      {isCritical ? (
        <ShieldAlert className="h-5 w-5 shrink-0" />
      ) : (
        <TriangleAlert className="h-5 w-5 shrink-0" />
      )}
      <div>
        <div className="font-semibold">
          {isCritical
            ? "تنبيه حرج: ارتفاع أخطاء الـAI Streaming"
            : "تحذير: ارتفاع أخطاء الـAI Streaming"}
        </div>
        <div className="text-xs mt-1 opacity-90">{alert.reason}</div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "critical";
}) {
  const color =
    tone === "ok"
      ? "var(--ac-success, #16a34a)"
      : tone === "warn"
        ? "var(--ac-warning, #d97706)"
        : tone === "critical"
          ? "var(--ac-danger, #dc2626)"
          : "var(--ac-ink-1)";
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface)" }}
    >
      <div className="text-[11px]" style={{ color: "var(--ac-ink-3)" }}>
        {label}
      </div>
      <div className="mt-1 text-lg font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function LatencyCard({ summary }: { summary: StreamSummary }) {
  const fmt = (v: number | null) => (v == null ? "—" : `${(v / 1000).toFixed(2)} ث`);
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-4 w-4" style={{ color: "var(--ac-accent)" }} />
        <h3 className="text-sm font-semibold">زمن الاستجابة الكامل</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[11px]" style={{ color: "var(--ac-ink-3)" }}>
            p50
          </div>
          <div className="font-bold">{fmt(summary.latency.p50)}</div>
        </div>
        <div>
          <div className="text-[11px]" style={{ color: "var(--ac-ink-3)" }}>
            p75
          </div>
          <div className="font-bold">{fmt(summary.latency.p75)}</div>
        </div>
        <div>
          <div className="text-[11px]" style={{ color: "var(--ac-ink-3)" }}>
            p95
          </div>
          <div className="font-bold">{fmt(summary.latency.p95)}</div>
        </div>
      </div>
    </div>
  );
}

function DeltaCard({ summary }: { summary: StreamSummary }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface)" }}
    >
      <h3 className="text-sm font-semibold mb-2">تدفق الـDeltas</h3>
      <div className="text-3xl font-bold">
        {summary.avgDeltas == null ? "—" : summary.avgDeltas.toFixed(0)}
      </div>
      <div className="text-[11px]" style={{ color: "var(--ac-ink-3)" }}>
        متوسط عدد الأجزاء لكل رد مكتمل
      </div>
    </div>
  );
}

function BucketsCard({ summary }: { summary: StreamSummary }) {
  const maxTotal = Math.max(1, ...summary.buckets.map((b) => b.total));
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface)" }}
    >
      <h3 className="text-sm font-semibold mb-3">الحركة عبر الوقت</h3>
      <div className="flex items-end gap-1 h-24">
        {summary.buckets.map((b, i) => {
          const total = (b.total / maxTotal) * 100;
          const errors = b.total ? (b.errors / b.total) * total : 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end"
              title={`${b.total} طلب — ${b.errors} خطأ`}
            >
              <div
                className="w-full rounded-t"
                style={{ height: `${Math.max(2, total)}%`, background: "var(--ac-accent-soft)" }}
              >
                {b.errors > 0 && (
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${(errors / total) * 100}%`,
                      background: "var(--ac-danger, #dc2626)",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelBreakdown({ summary }: { summary: StreamSummary }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface)" }}
    >
      <div
        className="px-4 py-2 border-b text-sm font-semibold"
        style={{ borderColor: "var(--ac-border)" }}
      >
        حسب الطراز
      </div>
      <div className="p-2">
        {summary.byModel.length === 0 ? (
          <div className="p-3 text-xs" style={{ color: "var(--ac-ink-3)" }}>
            لا توجد بيانات.
          </div>
        ) : (
          <ul className="text-xs divide-y" style={{ borderColor: "var(--ac-border)" }}>
            {summary.byModel.map((m) => (
              <li key={m.model} className="flex items-center justify-between py-2 px-1">
                <span className="truncate">{m.model}</span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span>{m.count}</span>
                  {m.errors > 0 && (
                    <span style={{ color: "var(--ac-danger, #dc2626)" }}>{m.errors} خطأ</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ErrorBreakdown({ summary }: { summary: StreamSummary }) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--ac-border)", background: "var(--ac-surface)" }}
    >
      <div
        className="px-4 py-2 border-b text-sm font-semibold flex items-center gap-2"
        style={{ borderColor: "var(--ac-border)" }}
      >
        <AlertTriangle className="h-4 w-4" style={{ color: "var(--ac-warning, #d97706)" }} /> أنواع
        الأخطاء
      </div>
      <div className="p-2">
        {summary.byErrorType.length === 0 ? (
          <div className="p-3 text-xs" style={{ color: "var(--ac-ink-3)" }}>
            لا توجد أخطاء في هذه النافذة.
          </div>
        ) : (
          <ul className="text-xs divide-y" style={{ borderColor: "var(--ac-border)" }}>
            {summary.byErrorType.map((e) => (
              <li key={e.error_type} className="flex items-center justify-between py-2 px-1">
                <span className="truncate">{e.error_type}</span>
                <span className="tabular-nums" style={{ color: "var(--ac-danger, #dc2626)" }}>
                  {e.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EventsTable({ rows }: { rows: StreamEventRow[] }) {
  if (!rows.length) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--ac-ink-3)" }}>
        لا توجد أحداث.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead style={{ background: "var(--ac-bg)" }}>
          <tr className="text-right" style={{ color: "var(--ac-ink-3)" }}>
            <th className="px-3 py-2 font-medium">الوقت</th>
            <th className="px-3 py-2 font-medium">السطح</th>
            <th className="px-3 py-2 font-medium">الطراز</th>
            <th className="px-3 py-2 font-medium">الحالة</th>
            <th className="px-3 py-2 font-medium tabular-nums">الزمن (م.ث)</th>
            <th className="px-3 py-2 font-medium tabular-nums">Deltas</th>
            <th className="px-3 py-2 font-medium tabular-nums">استئناف</th>
            <th className="px-3 py-2 font-medium">الخطأ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isErr = !r.aborted && (!r.completed || r.error_status != null);
            return (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--ac-border)" }}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString("ar-SA")}
                </td>
                <td className="px-3 py-2">{r.surface}</td>
                <td className="px-3 py-2 truncate max-w-[220px]">{r.model ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.aborted ? (
                    <span style={{ color: "var(--ac-ink-3)" }}>ملغى</span>
                  ) : isErr ? (
                    <span style={{ color: "var(--ac-danger, #dc2626)" }}>خطأ</span>
                  ) : (
                    <span style={{ color: "var(--ac-success, #16a34a)" }}>مكتمل</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.latency_ms}</td>
                <td className="px-3 py-2 tabular-nums">{r.delta_count}</td>
                <td className="px-3 py-2 tabular-nums">{r.resume_attempts}</td>
                <td className="px-3 py-2">
                  {r.error_status || r.error_type ? (
                    <span style={{ color: "var(--ac-danger, #dc2626)" }}>
                      {r.error_status ? `${r.error_status} ` : ""}
                      {r.error_type ?? ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
