/**
 * Performance Budgets panel — shows configured budgets (path × metric ×
 * threshold), current p75 status inferred from the shared Web Vitals
 * summary, recent alerts fired by the sweep, and a "Run now" button.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, PlayCircle, RefreshCw, Target } from "lucide-react";
import {
  listPerfBudgets,
  listPerfBudgetAlerts,
  runPerfBudgetSweepNow,
  updatePerfBudget,
  type PerfBudget,
  type PerfBudgetAlert,
} from "@/lib/admin/perf-budgets.functions";

function formatValue(metric: string, v: number): string {
  if (metric === "CLS") return v.toFixed(3);
  return `${Math.round(v).toLocaleString("ar-EG")} ms`;
}

export function PerfBudgetsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPerfBudgets);
  const alertsFn = useServerFn(listPerfBudgetAlerts);
  const sweepFn = useServerFn(runPerfBudgetSweepNow);
  const updateFn = useServerFn(updatePerfBudget);

  const budgetsQ = useQuery({
    queryKey: ["admin", "perf-budgets"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });
  const alertsQ = useQuery({
    queryKey: ["admin", "perf-budget-alerts"],
    queryFn: () => alertsFn({ data: { windowHours: 24 * 7, limit: 50 } }),
    staleTime: 30_000,
  });

  const [sweepMsg, setSweepMsg] = useState<string | null>(null);
  const sweepMut = useMutation({
    mutationFn: async () => sweepFn(),
    onSuccess: (res: any) => {
      setSweepMsg(
        `تم الفحص: ${res.scanned} سياسة · ${res.breaches} تجاوز · ${res.new_alerts} تنبيه جديد`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "perf-budget-alerts"] });
    },
    onError: (e: any) => setSweepMsg(`تعذّر الفحص: ${e?.message ?? "خطأ"}`),
  });

  const toggleMut = useMutation({
    mutationFn: async (v: { id: string; enabled: boolean }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "perf-budgets"] }),
  });

  const budgets = budgetsQ.data?.budgets ?? [];
  const alerts = alertsQ.data?.alerts ?? [];
  const openAlertsByKey = useMemo(() => {
    const s = new Set<string>();
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const a of alerts) {
      if (new Date(a.created_at).getTime() >= cutoff) s.add(`${a.path}:${a.metric}`);
    }
    return s;
  }, [alerts]);

  return (
    <section className="ac-card p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4" />
          Performance Budget — تنبيهات LCP/INP لمسارات /book و/ و/doctors
        </div>
        <div className="flex items-center gap-2">
          {sweepMsg && <span className="text-[11px] text-[color:var(--ac-ink-3)]">{sweepMsg}</span>}
          <button
            type="button"
            onClick={() => sweepMut.mutate()}
            disabled={sweepMut.isPending}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ac-line)] px-3 h-9 text-sm hover:bg-[color:var(--ac-subtle)] disabled:opacity-50"
          >
            {sweepMut.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            تشغيل الفحص الآن
          </button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-[color:var(--ac-ink-3)] border-b border-[color:var(--ac-line)]">
              <th className="text-start py-2 px-2">المسار</th>
              <th className="text-start py-2 px-2">المقياس</th>
              <th className="text-start py-2 px-2">الحد الأقصى</th>
              <th className="text-start py-2 px-2">النافذة</th>
              <th className="text-start py-2 px-2">الحد الأدنى للعينات</th>
              <th className="text-start py-2 px-2">الحالة</th>
              <th className="text-start py-2 px-2">تفعيل</th>
            </tr>
          </thead>
          <tbody>
            {budgets.map((b: PerfBudget) => {
              const key = `${b.path}:${b.metric}`;
              const breached = openAlertsByKey.has(key);
              return (
                <tr key={b.id} className="border-b border-[color:var(--ac-line)] last:border-0">
                  <td className="py-2 px-2 font-mono text-xs">{b.path}</td>
                  <td className="py-2 px-2">{b.metric}</td>
                  <td className="py-2 px-2 tabular-nums">{formatValue(b.metric, b.threshold)}</td>
                  <td className="py-2 px-2 tabular-nums">{b.window_hours}h</td>
                  <td className="py-2 px-2 tabular-nums">{b.min_samples}</td>
                  <td className="py-2 px-2">
                    {!b.enabled ? (
                      <span className="text-[11px] rounded-full border px-2 py-0.5 bg-slate-50 text-slate-500 border-slate-200">
                        متوقّف
                      </span>
                    ) : breached ? (
                      <span className="text-[11px] rounded-full border px-2 py-0.5 bg-red-50 text-red-700 border-red-200 inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> تجاوز حديث
                      </span>
                    ) : (
                      <span className="text-[11px] rounded-full border px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                        ضمن الميزانية
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={b.enabled}
                        onChange={(e) => toggleMut.mutate({ id: b.id, enabled: e.target.checked })}
                        aria-label={`تفعيل ${b.path} ${b.metric}`}
                      />
                      {b.enabled ? "مفعّل" : "متوقّف"}
                    </label>
                  </td>
                </tr>
              );
            })}
            {budgets.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-[color:var(--ac-ink-3)] text-sm">
                  لا توجد سياسات ميزانية.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-xs font-semibold mb-2">آخر التنبيهات (7 أيام)</div>
        {alerts.length === 0 ? (
          <div className="text-sm text-[color:var(--ac-ink-3)]">
            لا توجد تنبيهات مسجّلة ضمن هذه النافذة.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ac-line)]">
            {alerts.map((a: PerfBudgetAlert) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[11px] rounded-full border px-2 py-0.5 bg-red-50 text-red-700 border-red-200">
                    {a.metric}
                  </span>
                  <span className="font-mono text-xs">{a.path}</span>
                  <span className="tabular-nums text-[color:var(--ac-ink-2)]">
                    p75 {formatValue(a.metric, a.p75_value)} &gt;{" "}
                    {formatValue(a.metric, a.threshold)}
                  </span>
                  <span className="text-[11px] text-[color:var(--ac-ink-3)]">
                    عيّنات: {a.sample_size}
                  </span>
                </div>
                <div className="text-[11px] text-[color:var(--ac-ink-3)] flex items-center gap-3">
                  {a.webhook_status !== null && <span>webhook: {a.webhook_status}</span>}
                  {a.email_status && <span>email: {a.email_status}</span>}
                  <span>{new Date(a.created_at).toLocaleString("ar-SA")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
