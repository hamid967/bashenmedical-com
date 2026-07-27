/**
 * Admin-only server fns for the NPHIES eligibility audit trail and
 * runtime config health (Batch B2 — mock/sandbox/live separation).
 * Reads use RLS-protected `nphies_requests`, which only admins can select.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: isAdmin }, { data: isSuper }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

export type NphiesLogRow = {
  id: string;
  created_at: string;
  mode: string;
  provider_id: string | null;
  doctor_id: string | null;
  eligible: boolean | null;
  reason: string | null;
  coverage_percent: number | null;
  consultation_fee: number | null;
  covered_amount: number | null;
  patient_share: number | null;
  latency_ms: number | null;
  http_status: number | null;
  error_message: string | null;
  provider_name_ar: string | null;
  doctor_name_ar: string | null;
};

export type NphiesLogSummary = {
  total: number;
  eligibleCount: number;
  ineligibleCount: number;
  errorCount: number;
  avgLatencyMs: number | null;
  byReason: Array<{ reason: string; count: number }>;
  byMode: Array<{ mode: string; count: number }>;
  rows: NphiesLogRow[];
};

export const getNphiesLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { windowHours?: number; limit?: number; mode?: string }) =>
    z
      .object({
        windowHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 90)
          .default(24),
        limit: z.number().int().min(1).max(500).default(100),
        mode: z.enum(["mock", "sandbox", "live", "all"]).default("all"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<NphiesLogSummary> => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();

    let q = context.supabase
      .from("nphies_requests")
      .select(
        "id, created_at, mode, provider_id, doctor_id, eligible, reason, coverage_percent, consultation_fee, covered_amount, patient_share, latency_ms, http_status, error_message",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.mode !== "all") q = q.eq("mode", data.mode);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const providerIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.provider_id).filter(Boolean)),
    ) as string[];
    const doctorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.doctor_id).filter(Boolean)),
    ) as string[];

    const [providersRes, doctorsRes] = await Promise.all([
      providerIds.length
        ? context.supabase.from("insurance_providers").select("id, name_ar").in("id", providerIds)
        : Promise.resolve({ data: [] as any[] }),
      doctorIds.length
        ? context.supabase.from("doctors").select("id, name_ar").in("id", doctorIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const providerMap = new Map<string, string>(
      (providersRes.data ?? []).map((p: any) => [p.id, p.name_ar]),
    );
    const doctorMap = new Map<string, string>(
      (doctorsRes.data ?? []).map((d: any) => [d.id, d.name_ar]),
    );

    const enriched: NphiesLogRow[] = (rows ?? []).map((r: any) => ({
      ...r,
      provider_name_ar: r.provider_id ? (providerMap.get(r.provider_id) ?? null) : null,
      doctor_name_ar: r.doctor_id ? (doctorMap.get(r.doctor_id) ?? null) : null,
    }));

    const eligibleCount = enriched.filter((r) => r.eligible === true).length;
    const ineligibleCount = enriched.filter((r) => r.eligible === false).length;
    const errorCount = enriched.filter((r) => r.http_status != null && r.http_status >= 500).length;
    const latencies = enriched
      .map((r) => r.latency_ms)
      .filter((n): n is number => typeof n === "number");
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

    const reasonMap = new Map<string, number>();
    const modeMap = new Map<string, number>();
    for (const r of enriched) {
      const reasonKey = r.reason ?? "unknown";
      reasonMap.set(reasonKey, (reasonMap.get(reasonKey) ?? 0) + 1);
      modeMap.set(r.mode, (modeMap.get(r.mode) ?? 0) + 1);
    }
    const byReason = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
    const byMode = Array.from(modeMap.entries())
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total: enriched.length,
      eligibleCount,
      ineligibleCount,
      errorCount,
      avgLatencyMs,
      byReason,
      byMode,
      rows: enriched,
    };
  });

/** Read-only NPHIES runtime config health — never returns secrets. */
export const getNphiesConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getConfigReport } = await import("@/lib/nphies/adapter.server");
    return getConfigReport();
  });

/** Admin-only NPHIES connection test — pings OAuth token endpoint. */
export const pingNphiesConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { pingNphies } = await import("@/lib/nphies/adapter.server");
    return pingNphies();
  });
