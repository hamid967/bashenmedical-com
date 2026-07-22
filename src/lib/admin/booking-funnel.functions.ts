/**
 * Admin: Booking Funnel analytics.
 * Aggregates appointments by status × source × branch × doctor over a
 * rolling window and returns lookup lists for filter dropdowns.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertConsoleAccess as assertAdmin } from "./_guard";

export type FunnelStatus =
  | "held"
  | "pending_verification"
  | "pending_payment"
  | "new"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type FunnelSource = "registered" | "guest" | "demo";

export type FunnelRow = {
  status: FunnelStatus;
  source: FunnelSource;
  branch_id: string | null;
  doctor_id: string | null;
  count: number;
};

export type FunnelSummary = {
  windowDays: number;
  total: number;
  truncated: boolean;
  totalsByStatus: Record<FunnelStatus, number>;
  totalsBySource: Record<FunnelSource, number>;
  byBranch: Array<{ branch_id: string | null; name: string; count: number }>;
  byDoctor: Array<{ doctor_id: string | null; name: string; count: number }>;
  rows: FunnelRow[];
  branches: Array<{ id: string; name: string }>;
  doctors: Array<{ id: string; name: string }>;
  rates: {
    conversion: number | null; // (confirmed+completed) / total
    cancellation: number | null; // cancelled / total
    noShow: number | null; // no_show / total
    holdDrop: number | null; // held / total
  };
};

const Input = z.object({
  windowDays: z.number().int().min(1).max(90).default(14),
  branchId: z.string().uuid().nullable().optional(),
  doctorId: z.string().uuid().nullable().optional(),
  source: z.enum(["registered", "guest", "demo"]).nullable().optional(),
  limit: z.number().int().min(500).max(20_000).default(10_000),
});

function classifySource(row: {
  is_demo: boolean | null;
  patient_id: string | null;
}): FunnelSource {
  if (row.is_demo) return "demo";
  if (row.patient_id) return "registered";
  return "guest";
}

const ZERO_STATUS: Record<FunnelStatus, number> = {
  held: 0,
  pending_verification: 0,
  pending_payment: 0,
  new: 0,
  confirmed: 0,
  completed: 0,
  cancelled: 0,
  no_show: 0,
};

function safeRate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

export const getBookingFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<FunnelSummary> => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.windowDays * 24 * 3600_000).toISOString();

    let q = context.supabase
      .from("appointments")
      .select("id, status, branch_id, doctor_id, is_demo, patient_id, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      status: FunnelStatus;
      branch_id: string | null;
      doctor_id: string | null;
      is_demo: boolean | null;
      patient_id: string | null;
    }>;

    // Lookup lists (branches + doctors) for the filter dropdowns.
    const [branchesRes, doctorsRes] = await Promise.all([
      context.supabase.from("branches").select("id, name_ar, name_en").order("name_ar"),
      context.supabase
        .from("doctors")
        .select("id, name_ar, name_en")
        .order("name_ar")
        .limit(500),
    ]);
    const branches = ((branchesRes.data ?? []) as Array<{
      id: string;
      name_ar: string | null;
      name_en: string | null;
    }>).map((b) => ({ id: b.id, name: b.name_ar || b.name_en || b.id.slice(0, 8) }));
    const doctors = ((doctorsRes.data ?? []) as Array<{
      id: string;
      name_ar: string | null;
      name_en: string | null;
    }>).map((d) => ({ id: d.id, name: d.name_ar || d.name_en || d.id.slice(0, 8) }));

    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const doctorName = new Map(doctors.map((d) => [d.id, d.name]));

    const totalsByStatus: Record<FunnelStatus, number> = { ...ZERO_STATUS };
    const totalsBySource: Record<FunnelSource, number> = {
      registered: 0,
      guest: 0,
      demo: 0,
    };
    const byBranch = new Map<string | null, number>();
    const byDoctor = new Map<string | null, number>();
    const rowMap = new Map<string, FunnelRow>();

    let total = 0;
    for (const r of list) {
      const src = classifySource(r);
      if (data.source && data.source !== src) continue;
      total++;
      totalsByStatus[r.status] = (totalsByStatus[r.status] ?? 0) + 1;
      totalsBySource[src]++;
      byBranch.set(r.branch_id, (byBranch.get(r.branch_id) ?? 0) + 1);
      byDoctor.set(r.doctor_id, (byDoctor.get(r.doctor_id) ?? 0) + 1);
      const key = `${r.status}|${src}|${r.branch_id ?? ""}|${r.doctor_id ?? ""}`;
      const cur = rowMap.get(key);
      if (cur) cur.count++;
      else
        rowMap.set(key, {
          status: r.status,
          source: src,
          branch_id: r.branch_id,
          doctor_id: r.doctor_id,
          count: 1,
        });
    }

    const confirmed =
      (totalsByStatus.confirmed ?? 0) + (totalsByStatus.completed ?? 0);

    return {
      windowDays: data.windowDays,
      total,
      truncated: list.length >= data.limit,
      totalsByStatus,
      totalsBySource,
      byBranch: Array.from(byBranch.entries())
        .map(([id, count]) => ({
          branch_id: id,
          name: id ? branchName.get(id) ?? id.slice(0, 8) : "— بدون فرع",
          count,
        }))
        .sort((a, b) => b.count - a.count),
      byDoctor: Array.from(byDoctor.entries())
        .map(([id, count]) => ({
          doctor_id: id,
          name: id ? doctorName.get(id) ?? id.slice(0, 8) : "— بدون طبيب",
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30),
      rows: Array.from(rowMap.values()).sort((a, b) => b.count - a.count),
      branches,
      doctors,
      rates: {
        conversion: safeRate(confirmed, total),
        cancellation: safeRate(totalsByStatus.cancelled ?? 0, total),
        noShow: safeRate(totalsByStatus.no_show ?? 0, total),
        holdDrop: safeRate(totalsByStatus.held ?? 0, total),
      },
    };
  });
