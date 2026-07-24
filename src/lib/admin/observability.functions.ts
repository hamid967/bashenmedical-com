/**
 * E1 Observability — admin server functions.
 *
 *  - `getSloSummary` computes a compact SLO snapshot across the four
 *    key signals: latency budget burn (Web Vitals), client error rate,
 *    AI streaming health, and API permission errors.
 *  - `listClientErrors` / `getClientErrorFingerprints` power the
 *    Errors tab in `/admin/observability`.
 *
 * All handlers require console access via `assertConsoleAccess`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertConsoleAccess } from "./_guard";

const WindowInput = z.object({
  windowHours: z.number().int().min(1).max(24 * 30).default(24),
});

export type SloSignal = {
  key: "latency" | "client_errors" | "ai_streaming" | "api_permissions";
  label: string;
  status: "ok" | "warn" | "breach";
  value: number;
  unit: string;
  target: number;
  window_hours: number;
  detail: string;
};

export type SloSummary = {
  window_hours: number;
  generated_at: string;
  signals: SloSignal[];
};

export const getSloSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => WindowInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<SloSummary> => {
    await assertConsoleAccess(context);
    const { supabase } = context;
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();
    const signals: SloSignal[] = [];

    // 1) Latency budget burn (perf_budget_alerts fired within window)
    const { data: budgets } = await supabase
      .from("perf_budgets")
      .select("id")
      .eq("enabled", true);
    const totalBudgets = budgets?.length ?? 0;
    const { data: breaches } = await supabase
      .from("perf_budget_alerts")
      .select("id, path, metric, p75_value, threshold, bucket_at")
      .gte("bucket_at", since);
    const breachCount = breaches?.length ?? 0;
    const burnPct = totalBudgets > 0 ? Math.round((breachCount / (totalBudgets * data.windowHours)) * 100) : 0;
    signals.push({
      key: "latency",
      label: "Latency Budget Burn",
      status: burnPct >= 10 ? "breach" : burnPct >= 3 ? "warn" : "ok",
      value: burnPct,
      unit: "%",
      target: 3,
      window_hours: data.windowHours,
      detail: `${breachCount} breach(es) across ${totalBudgets} budget(s)`,
    });

    // 2) Client errors (table just added; use loose typing until codegen)
    const { count: errCount } = await (supabase as any)
      .from("client_error_events")
      .select("id", { count: "exact", head: true })
      .gte("ts", since)
      .eq("severity", "error");
    signals.push({
      key: "client_errors",
      label: "Client Errors",
      status: (errCount ?? 0) >= 100 ? "breach" : (errCount ?? 0) >= 25 ? "warn" : "ok",
      value: errCount ?? 0,
      unit: "events",
      target: 25,
      window_hours: data.windowHours,
      detail: "window.onerror + unhandledrejection + boundaries",
    });

    // 3) AI streaming health (aborted or error_status set → treated as errored)
    const { data: aiRows } = await supabase
      .from("ai_stream_events")
      .select("aborted, error_status, completed")
      .gte("created_at", since);
    const rowsList = (aiRows ?? []) as Array<{
      aborted: boolean | null;
      error_status: string | null;
      completed: boolean | null;
    }>;
    const total = rowsList.length;
    const errors = rowsList.filter(
      (r) => r.aborted === true || (r.error_status != null && r.error_status !== ""),
    ).length;
    const errRate = total > 0 ? Math.round((errors / total) * 1000) / 10 : 0;
    signals.push({
      key: "ai_streaming",
      label: "AI Streaming Error Rate",
      status: errRate >= 5 ? "breach" : errRate >= 1 ? "warn" : "ok",
      value: errRate,
      unit: "%",
      target: 1,
      window_hours: data.windowHours,
      detail: `${errors} / ${total} stream events`,
    });

    // 4) API permission errors (RLS denials → probable misconfig)
    const { count: permCount } = await supabase
      .from("api_permission_errors")
      .select("id", { count: "exact", head: true })
      .gte("ts", since);
    signals.push({
      key: "api_permissions",
      label: "API Permission Errors",
      status: (permCount ?? 0) >= 50 ? "breach" : (permCount ?? 0) >= 10 ? "warn" : "ok",
      value: permCount ?? 0,
      unit: "events",
      target: 10,
      window_hours: data.windowHours,
      detail: "RLS / PostgREST 401/403 records",
    });

    return {
      window_hours: data.windowHours,
      generated_at: new Date().toISOString(),
      signals,
    };
  });

const ListErrorsInput = z.object({
  windowHours: z.number().int().min(1).max(24 * 30).default(24),
  route: z.string().max(512).optional(),
  mechanism: z
    .enum(["onerror", "unhandledrejection", "react_error_boundary", "manual"])
    .optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export type ClientErrorRow = {
  id: string;
  ts: string;
  route: string;
  message: string;
  mechanism: string;
  severity: string;
  fingerprint: string;
  release: string | null;
  user_agent: string | null;
};

export const listClientErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListErrorsInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ rows: ClientErrorRow[] }> => {
    await assertConsoleAccess(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();
    let q = (context.supabase as any)
      .from("client_error_events")
      .select("id, ts, route, message, mechanism, severity, fingerprint, release, user_agent")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(data.limit);
    if (data.route) q = q.eq("route", data.route);
    if (data.mechanism) q = q.eq("mechanism", data.mechanism);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ClientErrorRow[] };
  });

export type ErrorFingerprintRow = {
  fingerprint: string;
  message: string;
  route: string;
  mechanism: string;
  count: number;
  last_seen: string;
};

export const getClientErrorFingerprints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => WindowInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ groups: ErrorFingerprintRow[] }> => {
    await assertConsoleAccess(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();
    const { data: rows, error } = await (context.supabase as any)
      .from("client_error_events")
      .select("fingerprint, message, route, mechanism, ts")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    const map = new Map<string, ErrorFingerprintRow>();
    for (const r of (rows ?? []) as Array<{
      fingerprint: string;
      message: string;
      route: string;
      mechanism: string;
      ts: string;
    }>) {
      const cur = map.get(r.fingerprint);
      if (cur) {
        cur.count += 1;
        if (r.ts > cur.last_seen) cur.last_seen = r.ts;
      } else {
        map.set(r.fingerprint, {
          fingerprint: r.fingerprint,
          message: r.message,
          route: r.route,
          mechanism: r.mechanism,
          count: 1,
          last_seen: r.ts,
        });
      }
    }
    const groups = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 100);
    return { groups };
  });
