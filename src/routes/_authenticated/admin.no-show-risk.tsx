/**
 * /admin/no-show-risk — Predictive No-Show v1 dashboard.
 * Shows risk buckets, the highest-risk upcoming appointments, and
 * per-slot overbooking suggestions from `suggest_overbooking(...)`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, AlertTriangle, Users, TrendingUp, Sparkles } from "lucide-react";
import { getNoShowRisk } from "@/lib/admin/no-show-risk.functions";

const WINDOWS = [1, 3, 7, 14, 30];

const riskQuery = (windowDays: number) =>
  queryOptions({
    queryKey: ["admin", "no-show-risk", windowDays],
    queryFn: () => getNoShowRisk({ data: { windowDays, limit: 100 } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_authenticated/admin/no-show-risk")({
  head: () => ({
    meta: [
      { title: "توقّع الغياب (Predictive No-Show) | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(riskQuery(14)),
  component: NoShowRiskPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      تعذّر تحميل توقّعات الغياب: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">غير موجود</div>,
});

function riskTone(score: number | null) {
  if (score == null) return "muted";
  if (score >= 60) return "bad";
  if (score >= 35) return "warn";
  return "ok";
}

function NoShowRiskPage() {
  const [windowDays, setWindowDays] = useState(14);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(riskQuery(windowDays));

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">توقّع الغياب (Predictive No-Show v1)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            تقييم مخاطر عدم الحضور واقتراحات Overbooking محسوبة لكل فترة زمنية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {WINDOWS.map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                windowDays === d
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {d} يوم
            </button>
          ))}
          <button
            onClick={() =>
              qc.invalidateQueries({ queryKey: ["admin", "no-show-risk"] })
            }
            className="p-1.5 border rounded-md hover:bg-muted"
            aria-label="تحديث"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="إجمالي المواعيد" value={data.total} icon={Users} tone="muted" />
        <Kpi label="مخاطرة منخفضة" value={data.buckets.low} icon={TrendingUp} tone="ok" />
        <Kpi
          label="مخاطرة متوسطة"
          value={data.buckets.medium}
          icon={AlertTriangle}
          tone="warn"
        />
        <Kpi
          label="مخاطرة عالية"
          value={data.buckets.high}
          icon={AlertTriangle}
          tone={data.buckets.high > 0 ? "bad" : "muted"}
        />
      </section>

      <section className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">اقتراحات Overbooking</h2>
          <span className="text-xs text-muted-foreground">
            (متوسط الحضور المتوقّع أقل من العدد المحجوز بأكثر من 0.5)
          </span>
        </div>
        {data.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا توجد فترات تحتاج overbooking حالياً — التوزيع صحّي.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-right">
                  <th className="p-2 font-medium">التاريخ</th>
                  <th className="p-2 font-medium">الوقت</th>
                  <th className="p-2 font-medium">الطبيب</th>
                  <th className="p-2 font-medium">محجوز</th>
                  <th className="p-2 font-medium">متوسط المخاطرة</th>
                  <th className="p-2 font-medium">الحضور المتوقّع</th>
                  <th className="p-2 font-medium">Overbook مقترح</th>
                </tr>
              </thead>
              <tbody>
                {data.suggestions.map((s, i) => (
                  <tr
                    key={`${s.doctor_id}-${s.appointment_date}-${s.appointment_time}-${i}`}
                    className="border-t border-border"
                  >
                    <td className="p-2 text-xs">{s.appointment_date}</td>
                    <td className="p-2 font-mono text-xs">
                      {s.appointment_time.slice(0, 5)}
                    </td>
                    <td className="p-2">{s.doctor_name_ar ?? "—"}</td>
                    <td className="p-2 font-mono">{s.booked_count}</td>
                    <td className="p-2 font-mono">{s.avg_risk}%</td>
                    <td className="p-2 font-mono">{s.expected_shows}</td>
                    <td className="p-2">
                      <span className="px-2 py-0.5 text-xs rounded bg-primary/10 text-primary font-mono">
                        +{s.suggested_overbook}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border overflow-hidden">
        <div className="p-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold">
            أعلى المواعيد مخاطرة (متوسّط النافذة: {data.avgRisk ?? "—"}%)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20">
              <tr className="text-right">
                <th className="p-2 font-medium">المخاطرة</th>
                <th className="p-2 font-medium">التاريخ</th>
                <th className="p-2 font-medium">الوقت</th>
                <th className="p-2 font-medium">المريض</th>
                <th className="p-2 font-medium">الطبيب</th>
                <th className="p-2 font-medium">الحالة</th>
                <th className="p-2 font-medium">WhatsApp</th>
                <th className="p-2 font-medium">تأمين</th>
              </tr>
            </thead>
            <tbody>
              {data.topRisk.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    لا مواعيد مرشحة ضمن هذه النافذة.
                  </td>
                </tr>
              )}
              {data.topRisk.map((r) => {
                const tone = riskTone(r.no_show_risk);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2">
                      <RiskBadge value={r.no_show_risk} tone={tone} />
                    </td>
                    <td className="p-2 text-xs">{r.appointment_date}</td>
                    <td className="p-2 font-mono text-xs">
                      {r.appointment_time.slice(0, 5)}
                    </td>
                    <td className="p-2">{r.patient_name ?? "—"}</td>
                    <td className="p-2">{r.doctor_name_ar ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.status}</td>
                    <td className="p-2 text-xs">{r.whatsapp_opt_in ? "✓" : "—"}</td>
                    <td className="p-2 text-xs">{r.insurance_status ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

function RiskBadge({
  value,
  tone,
}: {
  value: number | null;
  tone: "ok" | "warn" | "bad" | "muted";
}) {
  const toneCls =
    tone === "bad"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : tone === "ok"
          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-0.5 rounded border text-xs font-mono font-semibold ${toneCls}`}
    >
      {value ?? "—"}%
    </span>
  );
}
