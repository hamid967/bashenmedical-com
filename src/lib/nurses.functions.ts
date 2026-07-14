/**
 * Nurses module — server functions for staff, shifts, and patient call queue.
 * Requires authenticated user; RLS on tables enforces role-based access.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Types (kept local — DB types not regenerated for new tables yet)
export type NurseStatus = "active" | "on_leave" | "inactive";
export type ShiftType = "morning" | "evening" | "night";
export type CallPriority = "normal" | "urgent" | "critical";
export type CallStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type Nurse = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  branch_id: string | null;
  department: string | null;
  employee_no: string | null;
  status: NurseStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NurseShift = {
  id: string;
  nurse_id: string;
  branch_id: string | null;
  shift_date: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NurseCall = {
  id: string;
  branch_id: string | null;
  patient_id: string | null;
  room_no: string | null;
  reason: string | null;
  priority: CallPriority;
  status: CallStatus;
  assigned_nurse_id: string | null;
  called_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Nurses ----------
export const listNurses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { branchId?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("nurses" as never).select("*").order("full_name");
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Nurse[];
  });

const NurseInput = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().min(2).max(120),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  department: z.string().max(80).nullable().optional(),
  employee_no: z.string().max(40).nullable().optional(),
  status: z.enum(["active", "on_leave", "inactive"]).default("active"),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertNurse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => NurseInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("nurses" as never).update(rest as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await context.supabase
      .from("nurses" as never)
      .insert(rest as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteNurse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("nurses" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Shifts ----------
const ShiftRangeInput = z.object({
  branchId: z.string().uuid().nullable().optional(),
  fromDate: z.string(), // YYYY-MM-DD
  toDate: z.string(),
});

export const listShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ShiftRangeInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nurse_shifts" as never)
      .select("*")
      .gte("shift_date", data.fromDate)
      .lte("shift_date", data.toDate)
      .order("shift_date")
      .order("start_time");
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as NurseShift[];
  });

const ShiftInput = z.object({
  id: z.string().uuid().optional(),
  nurse_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  shift_date: z.string(),
  shift_type: z.enum(["morning", "evening", "night"]),
  start_time: z.string(),
  end_time: z.string(),
  notes: z.string().max(500).nullable().optional(),
});

export const upsertShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ShiftInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase
        .from("nurse_shifts" as never)
        .update(rest as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const payload = { ...rest, created_by: context.userId } as Record<string, unknown>;
    const { data: row, error } = await context.supabase
      .from("nurse_shifts" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("nurse_shifts" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Calls ----------
const CallListInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    status: z.enum(["pending", "in_progress", "completed", "cancelled", "active"]).nullable().optional(),
  })
  .default({});

export const listCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CallListInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nurse_calls" as never)
      .select("*")
      .order("called_at", { ascending: false })
      .limit(200);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.status === "active") q = q.in("status", ["pending", "in_progress"]);
    else if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as NurseCall[];
  });

const CreateCallInput = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  patient_id: z.string().uuid().nullable().optional(),
  room_no: z.string().max(20).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  priority: z.enum(["normal", "urgent", "critical"]).default("normal"),
  notes: z.string().max(1000).nullable().optional(),
});

export const createCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateCallInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("nurse_calls" as never)
      .insert(data as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

const UpdateCallInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  assigned_nurse_id: z.string().uuid().nullable().optional(),
});

export const updateCallStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpdateCallInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status: data.status };
    if (data.assigned_nurse_id !== undefined) patch.assigned_nurse_id = data.assigned_nurse_id;
    if (data.status === "in_progress") patch.accepted_at = new Date().toISOString();
    if (data.status === "completed" || data.status === "cancelled") patch.completed_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("nurse_calls" as never)
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
