/**
 * Admin — Integrations module.
 *
 * Read-only surface over `integration_logs` for the /admin/integrations
 * console: aggregate health per integration_key, paginated raw logs, and
 * single-log drill-down. All handlers are `admin`-guarded.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const WINDOW_HOURS = [1, 6, 24, 72, 168] as const;

const overviewSchema = z.object({
  since_hours: z
    .number()
    .int()
    .refine((v) => (WINDOW_HOURS as readonly number[]).includes(v), "invalid window")
    .default(24),
});

export type IntegrationHealth = {
  integration_key: string;
  total: number;
  success: number;
  errors: number;
  mock: number;
  error_rate: number;
  avg_duration_ms: number | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  status_class: "healthy" | "degraded" | "failing" | "idle";
};

const SUCCESS_STATUSES = new Set(["ok", "success", "succeeded", "200", "201"]);
const isSuccess = (s: string | null | undefined) => !!s && SUCCESS_STATUSES.has(s.toLowerCase());

/**
 * Overview: aggregate every integration_key seen in the last window.
 * We paginate defensively so a chatty integration cannot starve the query.
 */
export const listIntegrationsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => overviewSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    const since = new Date(Date.now() - data.since_hours * 3600 * 1000).toISOString();

    // Pull up to 5000 recent log rows in windows; sufficient for aggregation UI.
    const PAGE = 1000;
    const MAX = 5000;
    let acc: Array<{
      integration_key: string;
      status: string;
      is_mock: boolean;
      duration_ms: number | null;
      error_message: string | null;
      created_at: string;
    }> = [];
    for (let offset = 0; offset < MAX; offset += PAGE) {
      const { data: page, error } = await sb
        .from("integration_logs")
        .select("integration_key, status, is_mock, duration_ms, error_message, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (page ?? []) as typeof acc;
      acc = acc.concat(rows);
      if (rows.length < PAGE) break;
    }

    const groups = new Map<string, IntegrationHealth>();
    for (const row of acc) {
      const key = row.integration_key;
      let g = groups.get(key);
      if (!g) {
        g = {
          integration_key: key,
          total: 0,
          success: 0,
          errors: 0,
          mock: 0,
          error_rate: 0,
          avg_duration_ms: null,
          last_run_at: null,
          last_status: null,
          last_error_at: null,
          last_error_message: null,
          status_class: "idle",
        };
        groups.set(key, g);
      }
      g.total++;
      if (isSuccess(row.status)) g.success++;
      else g.errors++;
      if (row.is_mock) g.mock++;
      if (row.duration_ms != null) {
        g.avg_duration_ms = ((g.avg_duration_ms ?? 0) * (g.total - 1) + row.duration_ms) / g.total;
      }
      if (!g.last_run_at || row.created_at > g.last_run_at) {
        g.last_run_at = row.created_at;
        g.last_status = row.status;
      }
      if (!isSuccess(row.status)) {
        if (!g.last_error_at || row.created_at > g.last_error_at) {
          g.last_error_at = row.created_at;
          g.last_error_message = row.error_message;
        }
      }
    }

    const out = Array.from(groups.values()).map((g) => {
      g.error_rate = g.total === 0 ? 0 : g.errors / g.total;
      g.status_class =
        g.total === 0
          ? "idle"
          : g.error_rate >= 0.5
            ? "failing"
            : g.error_rate >= 0.1
              ? "degraded"
              : "healthy";
      if (g.avg_duration_ms != null) g.avg_duration_ms = Math.round(g.avg_duration_ms);
      return g;
    });

    out.sort((a, b) => b.errors - a.errors || b.total - a.total);

    const totals = out.reduce(
      (t, g) => {
        t.total += g.total;
        t.success += g.success;
        t.errors += g.errors;
        return t;
      },
      { total: 0, success: 0, errors: 0 },
    );

    return {
      window_hours: data.since_hours,
      totals,
      integrations: out,
      truncated: acc.length >= MAX,
    };
  });

const logsSchema = z.object({
  integration_key: z.string().min(1).max(120).optional(),
  status: z.enum(["all", "success", "error"]).default("all"),
  since_hours: z
    .number()
    .int()
    .refine((v) => (WINDOW_HOURS as readonly number[]).includes(v), "invalid window")
    .default(24),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const listIntegrationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => logsSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;
    const since = new Date(Date.now() - data.since_hours * 3600 * 1000).toISOString();

    let q = sb
      .from("integration_logs")
      .select(
        "id, integration_key, operation, status, is_mock, duration_ms, error_message, created_at",
        { count: "exact" },
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.integration_key) q = q.eq("integration_key", data.integration_key);
    if (data.status === "error") {
      q = q.not("status", "in", "(ok,success,succeeded,200,201,OK,Success)");
    } else if (data.status === "success") {
      q = q.in("status", ["ok", "success", "succeeded", "200", "201"]);
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

const logDetailSchema = z.object({ id: z.string().uuid() });

export const getIntegrationLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => logDetailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data: row, error } = await context.supabase
      .from("integration_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("سجل التكامل غير موجود");
    return row;
  });
