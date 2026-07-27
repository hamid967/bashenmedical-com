/**
 * Admin-only stats for no-show analytics.
 * Aggregates by doctor + day and returns cancel-reason distribution
 * over a date window with optional doctor/branch filters.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: a }, { data: s }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (!a && !s) throw new Error("Forbidden");
}

export type DoctorBreakdown = {
  doctor_id: string | null;
  doctor_name_ar: string | null;
  total: number;
  completed: number;
  no_show: number;
  cancelled: number;
  confirmed: number;
  avg_risk: number | null;
  no_show_rate: number;
};

export type DayBreakdown = {
  appointment_date: string;
  total: number;
  completed: number;
  no_show: number;
  cancelled: number;
  no_show_rate: number;
};

export type ReasonBreakdown = {
  reason: string;
  count: number;
};

export type NoShowStats = {
  from: string;
  to: string;
  totals: {
    total: number;
    completed: number;
    no_show: number;
    cancelled: number;
    confirmed: number;
    no_show_rate: number;
    cancellation_rate: number;
    avg_risk: number | null;
  };
  byDoctor: DoctorBreakdown[];
  byDay: DayBreakdown[];
  cancelReasons: ReasonBreakdown[];
};

const inputSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
});

export const getNoShowStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<NoShowStats> => {
    await assertAdmin(context);

    let q = context.supabase
      .from("appointments")
      .select("id, appointment_date, status, doctor_id, branch_id, no_show_risk")
      .gte("appointment_date", data.from)
      .lte("appointment_date", data.to)
      .eq("is_demo", false);
    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);
    if (data.branchId) q = q.eq("branch_id", data.branchId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      appointment_date: string;
      status: string;
      doctor_id: string | null;
      no_show_risk: number | null;
    }>;

    // Doctor names lookup
    const doctorIds = Array.from(new Set(list.map((r) => r.doctor_id).filter(Boolean))) as string[];
    const doctorMap = new Map<string, string>();
    if (doctorIds.length) {
      const { data: docs } = await context.supabase
        .from("doctors")
        .select("id, name_ar")
        .in("id", doctorIds);
      for (const d of docs ?? []) doctorMap.set(d.id, d.name_ar);
    }

    // Aggregators
    const emptyDoc = (): Omit<
      DoctorBreakdown,
      "doctor_id" | "doctor_name_ar" | "no_show_rate" | "avg_risk"
    > & { _riskSum: number; _riskN: number } => ({
      total: 0,
      completed: 0,
      no_show: 0,
      cancelled: 0,
      confirmed: 0,
      _riskSum: 0,
      _riskN: 0,
    });
    const docAgg = new Map<string, ReturnType<typeof emptyDoc>>();
    const dayAgg = new Map<
      string,
      { total: number; completed: number; no_show: number; cancelled: number }
    >();
    const totals = {
      total: 0,
      completed: 0,
      no_show: 0,
      cancelled: 0,
      confirmed: 0,
      _riskSum: 0,
      _riskN: 0,
    };

    for (const r of list) {
      totals.total++;
      const dKey = r.doctor_id ?? "unassigned";
      if (!docAgg.has(dKey)) docAgg.set(dKey, emptyDoc());
      const dbucket = docAgg.get(dKey)!;
      dbucket.total++;
      if (!dayAgg.has(r.appointment_date))
        dayAgg.set(r.appointment_date, { total: 0, completed: 0, no_show: 0, cancelled: 0 });
      const daybucket = dayAgg.get(r.appointment_date)!;
      daybucket.total++;

      if (r.status === "completed") {
        totals.completed++;
        dbucket.completed++;
        daybucket.completed++;
      } else if (r.status === "no_show") {
        totals.no_show++;
        dbucket.no_show++;
        daybucket.no_show++;
      } else if (r.status === "cancelled") {
        totals.cancelled++;
        dbucket.cancelled++;
        daybucket.cancelled++;
      } else if (r.status === "confirmed") {
        totals.confirmed++;
        dbucket.confirmed++;
      }

      if (typeof r.no_show_risk === "number") {
        totals._riskSum += r.no_show_risk;
        totals._riskN++;
        dbucket._riskSum += r.no_show_risk;
        dbucket._riskN++;
      }
    }

    const byDoctor: DoctorBreakdown[] = Array.from(docAgg.entries())
      .map(([id, b]) => {
        const decided = b.completed + b.no_show;
        return {
          doctor_id: id === "unassigned" ? null : id,
          doctor_name_ar: id === "unassigned" ? null : (doctorMap.get(id) ?? null),
          total: b.total,
          completed: b.completed,
          no_show: b.no_show,
          cancelled: b.cancelled,
          confirmed: b.confirmed,
          avg_risk: b._riskN ? Math.round(b._riskSum / b._riskN) : null,
          no_show_rate: decided ? Math.round((b.no_show / decided) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.no_show_rate - a.no_show_rate);

    const byDay: DayBreakdown[] = Array.from(dayAgg.entries())
      .map(([date, b]) => {
        const decided = b.completed + b.no_show;
        return {
          appointment_date: date,
          total: b.total,
          completed: b.completed,
          no_show: b.no_show,
          cancelled: b.cancelled,
          no_show_rate: decided ? Math.round((b.no_show / decided) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));

    // Cancel reasons via appointment_audit
    const apptIds = list.map((r) => r.id);
    const cancelReasons: ReasonBreakdown[] = [];
    if (apptIds.length) {
      const { data: audit } = await context.supabase
        .from("appointment_audit")
        .select("appointment_id, new_status, reason")
        .eq("new_status", "cancelled")
        .in("appointment_id", apptIds);
      const bucket = new Map<string, number>();
      for (const a of audit ?? []) {
        const reason = (a.reason ?? "").trim() || "بدون سبب مذكور";
        bucket.set(reason, (bucket.get(reason) ?? 0) + 1);
      }
      for (const [reason, count] of bucket.entries()) cancelReasons.push({ reason, count });
      cancelReasons.sort((a, b) => b.count - a.count);
    }

    const decidedAll = totals.completed + totals.no_show;
    return {
      from: data.from,
      to: data.to,
      totals: {
        total: totals.total,
        completed: totals.completed,
        no_show: totals.no_show,
        cancelled: totals.cancelled,
        confirmed: totals.confirmed,
        no_show_rate: decidedAll ? Math.round((totals.no_show / decidedAll) * 1000) / 10 : 0,
        cancellation_rate: totals.total
          ? Math.round((totals.cancelled / totals.total) * 1000) / 10
          : 0,
        avg_risk: totals._riskN ? Math.round(totals._riskSum / totals._riskN) : null,
      },
      byDoctor,
      byDay,
      cancelReasons,
    };
  });

export const listDoctorsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ id: string; name_ar: string }>> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("doctors")
      .select("id, name_ar")
      .eq("is_active", true)
      .order("name_ar");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; name_ar: string }>;
  });

export const listBranchesLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ id: string; name_ar: string }>> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("branches")
      .select("id, name_ar")
      .order("name_ar");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; name_ar: string }>;
  });
