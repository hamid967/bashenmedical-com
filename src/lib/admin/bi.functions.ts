/**
 * E3 — Data Warehouse & BI: admin server functions for the executive
 * dashboard and warehouse export.
 *
 *  - `listBiDailyKpis` returns rolled-up KPI rows from `bi_daily_kpis`.
 *  - `getExecutiveSummary` returns a compact set of KPIs for the last
 *    N days with a period-over-period delta.
 *  - `refreshBiKpisNow` recomputes the rollup on demand (admin button).
 *
 * All handlers require admin/super_admin access via `assertConsoleAccess`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertConsoleAccess } from "./_guard";

export type BiKpiRow = {
  day: string;
  metric: string;
  dimension: string;
  value_numeric: number;
  sample_size: number;
};

const ListInput = z.object({
  metric: z.string().min(1).max(64).optional(),
  daysBack: z.number().int().min(1).max(180).default(30),
  limit: z.number().int().min(1).max(5000).default(1000),
});

export const listBiDailyKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: BiKpiRow[] }> => {
    await assertConsoleAccess(context);
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - data.daysBack);
    const day = from.toISOString().slice(0, 10);
    let q = context.supabase
      .from("bi_daily_kpis")
      .select("day, metric, dimension, value_numeric, sample_size")
      .gte("day", day)
      .order("day", { ascending: false })
      .limit(data.limit);
    if (data.metric) q = q.eq("metric", data.metric);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as BiKpiRow[] };
  });

export type ExecutiveKpi = {
  key: string;
  label: string;
  value: number;
  previous: number;
  delta_pct: number | null;
  unit: string;
};

export type ExecutiveSummary = {
  window_days: number;
  generated_at: string;
  kpis: ExecutiveKpi[];
  series: Array<{ day: string; metric: string; value: number }>;
};

const SummaryInput = z.object({
  windowDays: z.number().int().min(1).max(90).default(14),
});

const HEADLINE_METRICS: Array<{ key: string; label: string; unit: string }> = [
  { key: "appointments_booked", label: "الحجوزات", unit: "حجز" },
  { key: "appointments_completed", label: "المواعيد المكتملة", unit: "موعد" },
  { key: "patients_new", label: "مرضى جدد", unit: "مريض" },
  { key: "revenue_paid", label: "الإيرادات المحصّلة", unit: "SAR" },
  { key: "inquiries_received", label: "استفسارات واردة", unit: "استفسار" },
  { key: "ai_conversations", label: "محادثات AI", unit: "محادثة" },
];

export const getExecutiveSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SummaryInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ExecutiveSummary> => {
    await assertConsoleAccess(context);
    const window = data.windowDays;
    const now = new Date();
    const currentFrom = new Date(now);
    currentFrom.setUTCDate(currentFrom.getUTCDate() - window);
    const previousFrom = new Date(now);
    previousFrom.setUTCDate(previousFrom.getUTCDate() - window * 2);

    const { data: rows, error } = await context.supabase
      .from("bi_daily_kpis")
      .select("day, metric, dimension, value_numeric")
      .gte("day", previousFrom.toISOString().slice(0, 10))
      .in(
        "metric",
        HEADLINE_METRICS.map((m) => m.key),
      )
      .order("day", { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);

    const currentFromStr = currentFrom.toISOString().slice(0, 10);
    const totals = new Map<string, { current: number; previous: number }>();
    for (const r of rows ?? []) {
      const bucket = r.day >= currentFromStr ? "current" : "previous";
      const entry = totals.get(r.metric) ?? { current: 0, previous: 0 };
      entry[bucket] += Number(r.value_numeric) || 0;
      totals.set(r.metric, entry);
    }

    const kpis: ExecutiveKpi[] = HEADLINE_METRICS.map((m) => {
      const t = totals.get(m.key) ?? { current: 0, previous: 0 };
      const delta = t.previous > 0 ? ((t.current - t.previous) / t.previous) * 100 : null;
      return {
        key: m.key,
        label: m.label,
        value: Number(t.current.toFixed(2)),
        previous: Number(t.previous.toFixed(2)),
        delta_pct: delta === null ? null : Number(delta.toFixed(1)),
        unit: m.unit,
      };
    });

    const series = (rows ?? [])
      .filter((r) => r.day >= currentFromStr)
      .map((r) => ({ day: r.day, metric: r.metric, value: Number(r.value_numeric) || 0 }));

    return {
      window_days: window,
      generated_at: new Date().toISOString(),
      kpis,
      series,
    };
  });

export const refreshBiKpisNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ daysBack: z.number().int().min(1).max(90).default(7) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; rows: number }> => {
    await assertConsoleAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("refresh_bi_daily_kpis", {
      _days_back: data.daysBack,
    });
    if (error) throw new Error(error.message);
    return { ok: true, rows: Number(rows ?? 0) };
  });
