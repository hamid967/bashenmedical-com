/**
 * Admin server functions for the Performance Budgets feature.
 * All handlers require an admin or super_admin role via `assertConsoleAccess`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertConsoleAccess as assertAdmin } from "./_guard";

export type PerfBudget = {
  id: string;
  path: string;
  metric: "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
  threshold: number;
  window_hours: number;
  min_samples: number;
  enabled: boolean;
  updated_at: string;
};

export type PerfBudgetAlert = {
  id: string;
  path: string;
  metric: string;
  threshold: number;
  p75_value: number;
  sample_size: number;
  window_hours: number;
  bucket_at: string;
  webhook_status: number | null;
  email_status: string | null;
  created_at: string;
};

export const listPerfBudgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ budgets: PerfBudget[] }> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("perf_budgets")
      .select("id, path, metric, threshold, window_hours, min_samples, enabled, updated_at")
      .order("path", { ascending: true })
      .order("metric", { ascending: true });
    if (error) throw new Error(error.message);
    return { budgets: (data ?? []) as PerfBudget[] };
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  threshold: z.number().positive().max(600_000).optional(),
  window_hours: z.number().int().min(1).max(720).optional(),
  min_samples: z.number().int().min(1).max(10_000).optional(),
  enabled: z.boolean().optional(),
});

export const updatePerfBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpdateInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.threshold !== undefined) patch.threshold = data.threshold;
    if (data.window_hours !== undefined) patch.window_hours = data.window_hours;
    if (data.min_samples !== undefined) patch.min_samples = data.min_samples;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    const { error } = await (context.supabase.from("perf_budgets") as any)
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ListAlertsInput = z.object({
  windowHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24 * 7),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listPerfBudgetAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListAlertsInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ alerts: PerfBudgetAlert[] }> => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("perf_budget_alerts")
      .select(
        "id, path, metric, threshold, p75_value, sample_size, window_hours, bucket_at, webhook_status, email_status, created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { alerts: (rows ?? []) as PerfBudgetAlert[] };
  });

export const runPerfBudgetSweepNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runPerfBudgetSweep } = await import("./perf-budgets.server");
    return runPerfBudgetSweep();
  });
