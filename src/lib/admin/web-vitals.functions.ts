/**
 * Admin: Web Vitals summary (LCP/INP/CLS) with optional URL filter.
 * Filter matches `url ILIKE %pathContains%` so we can slice by flows like
 * "/book", "/waitlist", "/portal/appointments" (which covers reschedule/cancel).
 * p75 is computed in-process on a capped window (fast enough at expected volumes).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type WebVitalMetric = (typeof METRICS)[number];

export type MetricStats = {
  metric: WebVitalMetric;
  count: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  good: number;
  needs: number;
  poor: number;
};

export type WebVitalsSummary = {
  windowHours: number;
  pathContains: string | null;
  totalSamples: number;
  truncated: boolean;
  stats: MetricStats[];
  topPaths: { path: string; count: number }[];
};

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("مطلوب صلاحية مسؤول");
}

// Thresholds (web.dev "good"/"needs improvement"/"poor")
const THRESHOLDS: Record<WebVitalMetric, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function pathnameOf(u: string): string {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u || "/";
  }
}

const Input = z.object({
  windowHours: z.number().int().min(1).max(24 * 30).default(24),
  pathContains: z.string().trim().min(1).max(200).nullish(),
  limit: z.number().int().min(100).max(10_000).default(5000),
});

export const getWebVitalsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<WebVitalsSummary> => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();

    let q = context.supabase
      .from("web_vitals")
      .select("metric, value, url, ts")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(data.limit);

    if (data.pathContains) {
      // Escape ILIKE wildcards to keep the match literal.
      const safe = data.pathContains.replace(/[\\%_]/g, (m) => `\\${m}`);
      q = q.ilike("url", `%${safe}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ metric: string; value: number; url: string }>;

    // group by metric
    const grouped: Record<string, number[]> = {};
    const pathCounts = new Map<string, number>();
    for (const r of list) {
      const m = String(r.metric).toUpperCase();
      if (!METRICS.includes(m as WebVitalMetric)) continue;
      (grouped[m] ??= []).push(Number(r.value));
      const p = pathnameOf(r.url ?? "");
      pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);
    }

    const stats: MetricStats[] = METRICS.map((metric) => {
      const arr = (grouped[metric] ?? []).slice().sort((a, b) => a - b);
      const [good, poor] = THRESHOLDS[metric];
      let g = 0, n = 0, p = 0;
      for (const v of arr) {
        if (v <= good) g++;
        else if (v <= poor) n++;
        else p++;
      }
      return {
        metric,
        count: arr.length,
        p50: percentile(arr, 50),
        p75: percentile(arr, 75),
        p95: percentile(arr, 95),
        good: g,
        needs: n,
        poor: p,
      };
    });

    const topPaths = Array.from(pathCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      windowHours: data.windowHours,
      pathContains: data.pathContains ?? null,
      totalSamples: list.length,
      truncated: list.length >= data.limit,
      stats,
      topPaths,
    };
  });
