/**
 * Admin — Appointments. List + detail scoped by branch. Guarded by admin.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  branch_id: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const COLS =
  "id, reference_number, patient_name, patient_phone, appointment_date, appointment_time, status, created_at, " +
  "doctor:doctors(id, name_ar, name_en), " +
  "branch:branches(id, name_ar, name_en)";

export const listAdminAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    let q = context.supabase
      .from("appointments")
      .select(COLS, { count: "exact" })
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.status) q = q.eq("status", data.status as any);
    if (data.from) q = q.gte("appointment_date", data.from);
    if (data.to) q = q.lte("appointment_date", data.to);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`patient_name.ilike.${like},patient_phone.ilike.${like},reference_number.ilike.${like}`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminAppointment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data: row, error } = await context.supabase
      .from("appointments")
      .select(COLS + ", reason, notes, patient_email, national_id, gender, estimated_cost_sar, patient_share_sar, insurance_status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الموعد غير موجود");
    const { data: history } = await context.supabase
      .from("appointment_status_history")
      .select("id, from_status, to_status, changed_at, changed_by, reason")
      .eq("appointment_id", data.id)
      .order("changed_at", { ascending: false });
    return { appointment: row, history: history ?? [] };
  });
