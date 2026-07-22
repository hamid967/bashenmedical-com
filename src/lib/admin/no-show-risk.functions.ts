/**
 * Admin-only server fns for Predictive No-Show v1.
 * Reads live risk scores from `appointments.no_show_risk` and per-slot
 * overbooking suggestions from `public.suggest_overbooking(...)`.
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

export type NoShowRiskRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  patient_name: string | null;
  patient_phone: string | null;
  doctor_id: string | null;
  doctor_name_ar: string | null;
  status: string;
  no_show_risk: number | null;
  whatsapp_opt_in: boolean;
  insurance_status: string | null;
};

export type OverbookingSuggestion = {
  doctor_id: string;
  doctor_name_ar: string | null;
  branch_id: string | null;
  appointment_date: string;
  appointment_time: string;
  booked_count: number;
  avg_risk: number;
  expected_shows: number;
  suggested_overbook: number;
};

export type NoShowSummary = {
  windowDays: number;
  total: number;
  buckets: { low: number; medium: number; high: number };
  avgRisk: number | null;
  topRisk: NoShowRiskRow[];
  suggestions: OverbookingSuggestion[];
};

export const getNoShowRisk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { windowDays?: number; limit?: number }) =>
    z
      .object({
        windowDays: z.number().int().min(1).max(60).default(14),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<NoShowSummary> => {
    await assertAdmin(context);
    const today = new Date();
    const fromISO = today.toISOString().slice(0, 10);
    const toDate = new Date(today);
    toDate.setDate(toDate.getDate() + data.windowDays);
    const toISO = toDate.toISOString().slice(0, 10);

    const { data: rows, error } = await context.supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, patient_name, patient_phone, doctor_id, status, no_show_risk, whatsapp_opt_in, insurance_status",
      )
      .gte("appointment_date", fromISO)
      .lte("appointment_date", toISO)
      .in("status", ["new", "confirmed", "pending_verification"])
      .order("no_show_risk", { ascending: false, nullsFirst: false })
      .order("appointment_date", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const doctorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.doctor_id).filter(Boolean)),
    ) as string[];
    const doctorsRes = doctorIds.length
      ? await context.supabase.from("doctors").select("id, name_ar").in("id", doctorIds)
      : { data: [] as any[] };
    const doctorMap = new Map<string, string>(
      (doctorsRes.data ?? []).map((d: any) => [d.id, d.name_ar]),
    );

    const enriched: NoShowRiskRow[] = (rows ?? []).map((r: any) => ({
      ...r,
      doctor_name_ar: r.doctor_id ? (doctorMap.get(r.doctor_id) ?? null) : null,
    }));

    const risks = enriched
      .map((r) => r.no_show_risk)
      .filter((n): n is number => typeof n === "number");
    const avgRisk = risks.length
      ? Math.round(risks.reduce((a, b) => a + b, 0) / risks.length)
      : null;

    const buckets = { low: 0, medium: 0, high: 0 };
    for (const r of enriched) {
      const s = r.no_show_risk ?? 25;
      if (s >= 60) buckets.high++;
      else if (s >= 35) buckets.medium++;
      else buckets.low++;
    }

    // Overbooking suggestions via RPC
    const { data: suggRows, error: suggErr } = await context.supabase.rpc("suggest_overbooking", {
      _from: fromISO,
      _to: toISO,
    });
    if (suggErr) throw new Error(suggErr.message);
    const suggestions: OverbookingSuggestion[] = (suggRows ?? []).map((s: any) => ({
      doctor_id: s.doctor_id,
      doctor_name_ar: s.doctor_id ? (doctorMap.get(s.doctor_id) ?? null) : null,
      branch_id: s.branch_id,
      appointment_date: s.appointment_date,
      appointment_time: s.appointment_time,
      booked_count: s.booked_count,
      avg_risk: Number(s.avg_risk),
      expected_shows: Number(s.expected_shows),
      suggested_overbook: s.suggested_overbook,
    }));

    return {
      windowDays: data.windowDays,
      total: enriched.length,
      buckets,
      avgRisk,
      topRisk: enriched,
      suggestions,
    };
  });
