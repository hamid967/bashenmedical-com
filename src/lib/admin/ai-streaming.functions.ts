/**
 * Admin AI-streaming telemetry queries + alert evaluation.
 * Restricted to admin / super_admin roles.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RangeInput = z.object({
  windowMinutes: z.number().int().min(5).max(60 * 24 * 30).default(60),
  surface: z.enum(["public", "portal", "admin", "all"]).default("all"),
});

async function ensureStaff(supabase: {
  rpc: (name: "has_role", args: { _user_id: string; _role: "admin" | "super_admin" }) => {
    single: () => Promise<{ data: boolean | null }>;
  };
}, userId: string) {
  const [a, s] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }).single(),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }).single(),
  ]);
  if (!a.data && !s.data) throw new Error("Forbidden");
}

export type StreamEventRow = {
  id: string;
  surface: "public" | "portal" | "admin";
  model: string | null;
  latency_ms: number;
  ttfb_ms: number | null;
  delta_count: number;
  resume_attempts: number;
  completed: boolean;
  aborted: boolean;
  error_status: number | null;
  error_type: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  created_at: string;
};

export type StreamSummary = {
  windowMinutes: number;
  surface: string;
  total: number;
  completed: number;
  errors: number;
  aborted: number;
  errorRate: number;
  resumeRate: number;
  latency: { p50: number | null; p75: number | null; p95: number | null };
  avgDeltas: number | null;
  byModel: Array<{ model: string; count: number; errors: number }>;
  byErrorType: Array<{ error_type: string; count: number }>;
  buckets: Array<{ t: string; total: number; errors: number }>;
  alert: {
    level: "ok" | "warn" | "critical";
    reason: string | null;
    errorRate: number;
    threshold: { warn: number; critical: number };
    minSamples: number;
  };
};

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? null;
}

export const getStreamSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => RangeInput.parse(input))
  .handler(async ({ data, context }): Promise<StreamSummary> => {
    await ensureStaff(context.supabase, context.userId);

    const since = new Date(Date.now() - data.windowMinutes * 60_000).toISOString();
    let q = context.supabase
      .from("ai_stream_events")
      .select(
        "surface,model,latency_ms,delta_count,resume_attempts,completed,aborted,error_status,error_type,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.surface !== "all") q = q.eq("surface", data.surface);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      surface: string;
      model: string | null;
      latency_ms: number;
      delta_count: number;
      resume_attempts: number;
      completed: boolean;
      aborted: boolean;
      error_status: number | null;
      error_type: string | null;
      created_at: string;
    }>;

    const total = list.length;
    const aborted = list.filter((r) => r.aborted).length;
    const errored = list.filter((r) => !r.aborted && (!r.completed || r.error_status != null));
    const completed = list.filter((r) => r.completed && r.error_status == null).length;
    const resumed = list.filter((r) => r.resume_attempts > 0).length;

    const latencies = list
      .filter((r) => r.completed && !r.aborted)
      .map((r) => r.latency_ms)
      .sort((a, b) => a - b);
    const deltas = list.filter((r) => r.completed).map((r) => r.delta_count);

    const byModelMap = new Map<string, { count: number; errors: number }>();
    for (const r of list) {
      const m = r.model || "unknown";
      const cur = byModelMap.get(m) ?? { count: 0, errors: 0 };
      cur.count++;
      if (!r.aborted && (!r.completed || r.error_status != null)) cur.errors++;
      byModelMap.set(m, cur);
    }
    const byModel = [...byModelMap.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const byErrMap = new Map<string, number>();
    for (const r of errored) {
      const k = r.error_type || (r.error_status ? `HTTP ${r.error_status}` : "unknown");
      byErrMap.set(k, (byErrMap.get(k) ?? 0) + 1);
    }
    const byErrorType = [...byErrMap.entries()]
      .map(([error_type, count]) => ({ error_type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Time buckets — 12 slices across the window
    const bucketCount = 12;
    const bucketMs = (data.windowMinutes * 60_000) / bucketCount;
    const start = Date.now() - data.windowMinutes * 60_000;
    const buckets: Array<{ t: string; total: number; errors: number }> = [];
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({ t: new Date(start + i * bucketMs).toISOString(), total: 0, errors: 0 });
    }
    for (const r of list) {
      const t = new Date(r.created_at).getTime();
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((t - start) / bucketMs)));
      buckets[idx].total++;
      if (!r.aborted && (!r.completed || r.error_status != null)) buckets[idx].errors++;
    }

    const errorRate = total > 0 ? errored.length / total : 0;
    // Alert thresholds — require min samples to avoid noise
    const WARN = 0.05;
    const CRITICAL = 0.15;
    const MIN_SAMPLES = 20;
    let level: "ok" | "warn" | "critical" = "ok";
    let reason: string | null = null;
    if (total >= MIN_SAMPLES) {
      if (errorRate >= CRITICAL) {
        level = "critical";
        reason = `معدل الأخطاء ${(errorRate * 100).toFixed(1)}% تجاوز الحد الحرج ${(CRITICAL * 100).toFixed(0)}%`;
      } else if (errorRate >= WARN) {
        level = "warn";
        reason = `معدل الأخطاء ${(errorRate * 100).toFixed(1)}% تجاوز حد التحذير ${(WARN * 100).toFixed(0)}%`;
      }
    }

    return {
      windowMinutes: data.windowMinutes,
      surface: data.surface,
      total,
      completed,
      errors: errored.length,
      aborted,
      errorRate,
      resumeRate: total > 0 ? resumed / total : 0,
      latency: {
        p50: percentile(latencies, 50),
        p75: percentile(latencies, 75),
        p95: percentile(latencies, 95),
      },
      avgDeltas: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
      byModel,
      byErrorType,
      buckets,
      alert: {
        level,
        reason,
        errorRate,
        threshold: { warn: WARN, critical: CRITICAL },
        minSamples: MIN_SAMPLES,
      },
    };
  });

export const listStreamEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        windowMinutes: z.number().int().min(5).max(60 * 24 * 30).default(60),
        surface: z.enum(["public", "portal", "admin", "all"]).default("all"),
        onlyErrors: z.boolean().default(false),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<StreamEventRow[]> => {
    await ensureStaff(context.supabase, context.userId);
    const since = new Date(Date.now() - data.windowMinutes * 60_000).toISOString();
    let q = context.supabase
      .from("ai_stream_events")
      .select(
        "id,surface,model,latency_ms,ttfb_ms,delta_count,resume_attempts,completed,aborted,error_status,error_type,prompt_tokens,completion_tokens,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.surface !== "all") q = q.eq("surface", data.surface);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let out = (rows ?? []) as StreamEventRow[];
    if (data.onlyErrors) {
      out = out.filter((r) => !r.aborted && (!r.completed || r.error_status != null));
    }
    return out;
  });
