/**
 * Admin — Schedules: availability slots and doctor leaves by branch.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  branch_id: z.string().uuid().optional(),
  doctor_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).default(0),
});

export const listAdminAvailabilitySlots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    let q = context.supabase
      .from("availability_slots")
      .select(
        "id, slot_date, start_time, end_time, status, appointment_id, doctor:doctors(id, name_ar, name_en), branch:branches(id, name_ar, name_en)",
        { count: "exact" },
      )
      .order("slot_date", { ascending: false })
      .order("start_time", { ascending: true })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.doctor_id) q = q.eq("doctor_id", data.doctor_id);
    if (data.from) q = q.gte("slot_date", data.from);
    if (data.to) q = q.lte("slot_date", data.to);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const listAdminDoctorLeaves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    let q = context.supabase
      .from("doctor_leaves")
      .select(
        "id, start_date, end_date, all_day, reason, created_at, doctor:doctors(id, name_ar, name_en), branch:branches(id, name_ar, name_en)",
        { count: "exact" },
      )
      .order("start_date", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.doctor_id) q = q.eq("doctor_id", data.doctor_id);
    if (data.from) q = q.gte("start_date", data.from);
    if (data.to) q = q.lte("end_date", data.to);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });
