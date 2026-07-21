/**
 * Admin-only: list high no-show risk appointments for a doctor/day window
 * with reasons and full audit trail per appointment.
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

export type AuditEntry = {
  id: string;
  changed_at: string;
  changed_by: string | null;
  old_status: string | null;
  new_status: string | null;
  reason: string | null;
};

export type HighRiskAppointment = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  no_show_risk: number | null;
  doctor_id: string | null;
  doctor_name_ar: string | null;
  branch_id: string | null;
  patient_name: string;
  patient_phone: string;
  audit: AuditEntry[];
};

const inputSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  minRisk: z.number().int().min(0).max(100).default(60),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listHighRiskAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<HighRiskAppointment[]> => {
    await assertAdmin(context);

    let q = context.supabase
      .from("appointments")
      .select("id, appointment_date, appointment_time, status, no_show_risk, doctor_id, branch_id, patient_name, patient_phone")
      .gte("appointment_date", data.from)
      .lte("appointment_date", data.to)
      .gte("no_show_risk", data.minRisk)
      .eq("is_demo", false)
      .order("no_show_risk", { ascending: false })
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true })
      .limit(data.limit);

    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);
    if (data.branchId) q = q.eq("branch_id", data.branchId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<Omit<HighRiskAppointment, "doctor_name_ar" | "audit">>;
    if (list.length === 0) return [];

    const docIds = Array.from(new Set(list.map((r) => r.doctor_id).filter(Boolean))) as string[];
    const docMap = new Map<string, string>();
    if (docIds.length) {
      const { data: docs } = await context.supabase
        .from("doctors").select("id, name_ar").in("id", docIds);
      for (const d of docs ?? []) docMap.set(d.id, d.name_ar);
    }

    const apptIds = list.map((r) => r.id);
    const auditMap = new Map<string, AuditEntry[]>();
    const { data: audit } = await context.supabase
      .from("appointment_audit")
      .select("id, appointment_id, changed_at, changed_by, old_status, new_status, reason")
      .in("appointment_id", apptIds)
      .order("changed_at", { ascending: false });
    for (const a of (audit ?? []) as Array<AuditEntry & { appointment_id: string }>) {
      const arr = auditMap.get(a.appointment_id) ?? [];
      arr.push({
        id: a.id,
        changed_at: a.changed_at,
        changed_by: a.changed_by,
        old_status: a.old_status,
        new_status: a.new_status,
        reason: a.reason,
      });
      auditMap.set(a.appointment_id, arr);
    }

    return list.map((r) => ({
      ...r,
      doctor_name_ar: r.doctor_id ? docMap.get(r.doctor_id) ?? null : null,
      audit: auditMap.get(r.id) ?? [],
    }));
  });
