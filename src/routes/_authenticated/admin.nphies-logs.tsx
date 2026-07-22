/**
 * /admin/nphies-logs — لوحة تدقيق طلبات NPHIES/التأمين.
 * تعرض ملخّصات (إجمالي، مؤهل/غير مؤهل، متوسط الاستجابة، أسباب) وجدولًا
 * بآخر الطلبات مع مصدر البيانات (mock/sandbox/live) وحصة المريض.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, ShieldCheck, ShieldAlert, Timer, AlertTriangle } from "lucide-react";
import { getNphiesLogs } from "@/lib/admin/nphies.functions";

const WINDOWS = [1, 6, 24, 24 * 7, 24 * 30];

const logsQuery = (windowHours: number) =>
  queryOptions({
    queryKey: ["admin", "nphies-logs", windowHours],
    queryFn: () => getNphiesLogs({ data: { windowHours, limit: 200 } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_authenticated/admin/nphies-logs")({
  head: () => ({
    meta: [
      { title: "سجلات التأمين (NPHIES) | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(logsQuery(24)),
  component: NphiesLogsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">تعذّر تحميل سجلات التأمين: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">غير موجود</div>,
});

function NphiesLogsPage() {
  const [windowHours, setWindowHours] = useState(24);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(logsQuery(windowHours));

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">سجلات التأمين (NPHIES)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تدقيق مركزي لكل طلبات التحقق من الأهلية، مع مصدر البيانات (mock/sandbox/live).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {WINDOWS.map((h) => (
            <button
              key={h}
              onClick={() => setWindowHours(h)}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                windowHours === h
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {h < 24 ? `${h} ساعة` : `${Math.round(h / 24)} يوم`}
            </button>
          ))}
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "nphies-logs"] })}
            className="p-1.5 border rounded-md hover:bg-muted"
            aria-label="تحديث"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="إجمالي الطلبات" value={data.total} icon={Timer} />
        <Kpi label="مؤهل" value={data.eligibleCount} icon={ShieldCheck} tone="ok" />
        <Kpi label="غير مؤهل" value={data.ineligibleCount} icon={ShieldAlert} tone="warn" />
        <Kpi
          label="أخطاء"
          value={data.errorCount}
          icon={AlertTriangle}
          tone={data.errorCount > 0 ? "bad" : "muted"}
        />
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold mb-2">أداء</h2>
          <div className="text-sm text-muted-foreground">
            متوسط زمن الاستجابة:{" "}
            <span className="font-mono font-semibold text-foreground">
              {data.avgLatencyMs != null ? `${data.avgLatencyMs} ms` : "—"}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold mb-2">أسباب الاستجابة</h2>
          <ul className="text-sm space-y-1">
            {data.byReason.length === 0 && <li className="text-muted-foreground">لا بيانات</li>}
            {data.byReason.map((r) => (
              <li key={r.reason} className="flex items-center justify-between">
                <span>{r.reason}</span>
                <span className="font-mono text-muted-foreground">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-2 font-medium">التاريخ</th>
              <th className="p-2 font-medium">المصدر</th>
              <th className="p-2 font-medium">الطبيب</th>
              <th className="p-2 font-medium">جهة التأمين</th>
              <th className="p-2 font-medium">الأهلية</th>
              <th className="p-2 font-medium">السبب</th>
              <th className="p-2 font-medium">التغطية</th>
              <th className="p-2 font-medium">حصة المريض</th>
              <th className="p-2 font-medium">زمن</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  لا توجد طلبات ضمن هذه النافذة الزمنية.
                </td>
              </tr>
            )}
            {data.rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ar-SA")}
                </td>
                <td className="p-2">
                  <span
                    className={`px-1.5 py-0.5 text-xs rounded ${
                      r.mode === "live"
                        ? "bg-emerald-100 text-emerald-900"
                        : r.mode === "sandbox"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.mode}
                  </span>
                </td>
                <td className="p-2">{r.doctor_name_ar ?? "—"}</td>
                <td className="p-2">{r.provider_name_ar ?? "—"}</td>
                <td className="p-2">
                  {r.eligible === true ? (
                    <span className="text-emerald-700">مؤهل</span>
                  ) : r.eligible === false ? (
                    <span className="text-amber-700">غير مؤهل</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-2 text-xs">{r.reason ?? "—"}</td>
                <td className="p-2 font-mono text-xs">
                  {r.coverage_percent != null ? `${r.coverage_percent}%` : "—"}
                </td>
                <td className="p-2 font-mono text-xs">
                  {r.patient_share != null ? `${r.patient_share} SAR` : "—"}
                </td>
                <td className="p-2 font-mono text-xs text-muted-foreground">
                  {r.latency_ms != null ? `${r.latency_ms} ms` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone = "muted",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "ok" | "warn" | "bad" | "muted";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : tone === "warn"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : tone === "bad"
          ? "text-destructive bg-destructive/10 border-destructive/30"
          : "text-foreground bg-background border-border";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <Icon className="h-4 w-4 opacity-70" />
      </div>
      <div className="text-2xl font-bold font-mono mt-2">{value}</div>
    </div>
  );
}
