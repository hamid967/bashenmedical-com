/**
 * Per-user AI usage history. Data source is `public.ai_stream_events`
 * (one row per completed/aborted stream). Costs are computed from the
 * shared pricing table for display; the raw table stores only tokens.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { estimateCredits } from "@/lib/ai/pricing";

export type UsageRow = {
  id: string;
  created_at: string;
  surface: "public" | "portal" | "admin";
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  completed: boolean;
  aborted: boolean;
  error_type: string | null;
  credits: number;
};

export type UsageSummary = {
  totalMessages: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCredits: number;
  avgLatencyMs: number | null;
  byModel: Array<{ model: string; count: number; tokens: number; credits: number }>;
  bySurface: Array<{ surface: string; count: number; credits: number }>;
};

export type UsageResponse = {
  rows: UsageRow[];
  summary: UsageSummary;
  hasMore: boolean;
};

type RawRow = {
  id: string;
  created_at: string;
  surface: "public" | "portal" | "admin";
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  completed: boolean | null;
  aborted: boolean | null;
  error_type: string | null;
};

function shape(rows: RawRow[]): UsageResponse {
  const mapped: UsageRow[] = rows.map((r) => {
    const pt = r.prompt_tokens ?? 0;
    const ct = r.completion_tokens ?? 0;
    return {
      id: r.id,
      created_at: r.created_at,
      surface: r.surface,
      model: r.model,
      prompt_tokens: pt,
      completion_tokens: ct,
      total_tokens: pt + ct,
      latency_ms: r.latency_ms ?? 0,
      completed: !!r.completed,
      aborted: !!r.aborted,
      error_type: r.error_type,
      credits: estimateCredits(pt, ct, r.model ?? undefined),
    };
  });

  const byModelMap = new Map<string, { count: number; tokens: number; credits: number }>();
  const bySurfaceMap = new Map<string, { count: number; credits: number }>();
  let totalPrompt = 0,
    totalCompletion = 0,
    totalCredits = 0,
    totalLat = 0,
    latSamples = 0;

  for (const r of mapped) {
    totalPrompt += r.prompt_tokens;
    totalCompletion += r.completion_tokens;
    totalCredits += r.credits;
    if (r.latency_ms > 0) {
      totalLat += r.latency_ms;
      latSamples++;
    }
    const m = r.model ?? "unknown";
    const bm = byModelMap.get(m) ?? { count: 0, tokens: 0, credits: 0 };
    bm.count++;
    bm.tokens += r.total_tokens;
    bm.credits += r.credits;
    byModelMap.set(m, bm);

    const bs = bySurfaceMap.get(r.surface) ?? { count: 0, credits: 0 };
    bs.count++;
    bs.credits += r.credits;
    bySurfaceMap.set(r.surface, bs);
  }

  return {
    rows: mapped,
    hasMore: false,
    summary: {
      totalMessages: mapped.length,
      totalPromptTokens: totalPrompt,
      totalCompletionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
      totalCredits,
      avgLatencyMs: latSamples ? Math.round(totalLat / latSamples) : null,
      byModel: Array.from(byModelMap.entries())
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.credits - a.credits),
      bySurface: Array.from(bySurfaceMap.entries())
        .map(([surface, v]) => ({ surface, ...v }))
        .sort((a, b) => b.credits - a.credits),
    },
  };
}

const MyInput = z.object({
  windowDays: z.number().int().min(1).max(365).default(30),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listMyAiUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => MyInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<UsageResponse> => {
    const since = new Date(Date.now() - data.windowDays * 86400 * 1000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("ai_stream_events")
      .select(
        "id, created_at, surface, model, prompt_tokens, completion_tokens, latency_ms, completed, aborted, error_type",
      )
      .eq("user_id", context.userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit + 1);
    if (error) throw new Error(error.message);
    const all = (rows ?? []) as RawRow[];
    const hasMore = all.length > data.limit;
    const trimmed = hasMore ? all.slice(0, data.limit) : all;
    const out = shape(trimmed);
    out.hasMore = hasMore;
    return out;
  });

const AdminInput = z.object({
  windowDays: z.number().int().min(1).max(365).default(30),
  surface: z.enum(["all", "public", "portal", "admin"]).default("all"),
  userId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(1000).default(300),
});

async function ensureStaff(supabase: any, userId: string): Promise<void> {
  for (const role of ["admin", "super_admin"] as const) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden");
}

export type AdminUsageRow = UsageRow & { user_id: string | null };
export type AdminUsageResponse = {
  rows: AdminUsageRow[];
  summary: UsageSummary;
  byUser: Array<{ user_id: string; count: number; tokens: number; credits: number }>;
  hasMore: boolean;
};

export const listAllAiUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => AdminInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<AdminUsageResponse> => {
    await ensureStaff(context.supabase, context.userId);
    const since = new Date(Date.now() - data.windowDays * 86400 * 1000).toISOString();
    let q = context.supabase
      .from("ai_stream_events")
      .select(
        "id, created_at, surface, model, prompt_tokens, completion_tokens, latency_ms, completed, aborted, error_type, user_id",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit + 1);
    if (data.surface !== "all") q = q.eq("surface", data.surface);
    if (data.userId) q = q.eq("user_id", data.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const all = (rows ?? []) as Array<RawRow & { user_id: string | null }>;
    const hasMore = all.length > data.limit;
    const trimmed = hasMore ? all.slice(0, data.limit) : all;
    const base = shape(trimmed);

    const byUserMap = new Map<string, { count: number; tokens: number; credits: number }>();
    const enriched: AdminUsageRow[] = base.rows.map((r, i) => {
      const uid = trimmed[i]?.user_id ?? null;
      if (uid) {
        const b = byUserMap.get(uid) ?? { count: 0, tokens: 0, credits: 0 };
        b.count++;
        b.tokens += r.total_tokens;
        b.credits += r.credits;
        byUserMap.set(uid, b);
      }
      return { ...r, user_id: uid };
    });

    return {
      rows: enriched,
      summary: base.summary,
      hasMore,
      byUser: Array.from(byUserMap.entries())
        .map(([user_id, v]) => ({ user_id, ...v }))
        .sort((a, b) => b.credits - a.credits)
        .slice(0, 25),
    };
  });
