/**
 * Doctor management server functions: overview with occupancy, availability
 * schedule CRUD, and leaves (vacation/time-off) CRUD. Staff-gated.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "super_admin" | "reception" | "doctor" | "pharmacy";

async function getRoles(sb: any, userId: string): Promise<Role[]> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}
function ensureStaff(roles: Role[]) {
  if (!roles.some((r) => (["admin", "super_admin", "reception", "doctor"] as Role[]).includes(r)))
    throw new Error("ليست لديك الصلاحية.");
}
function ensureAdmin(roles: Role[]) {
  if (!roles.some((r) => (["admin", "super_admin"] as Role[]).includes(r)))
    throw new Error("هذه العملية للمسؤولين فقط.");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (name: string, args?: Record<string, unknown>) => any;

/* -------- Overview: doctors + occupancy -------- */
export type DoctorOccupancy = {
  doctor_id: string;
  name_ar: string;
  name_en: string;
  branch_id: string | null;
  specialty_id: string | null;
  specialty_name_ar: string | null;
  is_active: boolean;
  booked: number;
  capacity: number;
  occupancy_pct: number;
  leave_days: number;
};

const OverviewInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    days: z.number().int().min(1).max(365).optional(),
  })
  .default({});

export const listDoctorsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => OverviewInput.parse(d))
  .handler(async ({ data, context }): Promise<DoctorOccupancy[]> => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureStaff(roles);
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: rows, error } = await rpc.call(context.supabase, "doctor_occupancy", {
      _branch_id: data.branchId ?? null,
      _days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as DoctorOccupancy[];
  });

/* -------- Availability schedule -------- */
export const listDoctorAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ doctorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureStaff(roles);
    const { data: rows, error } = await context.supabase
      .from("availability")
      .select("id, doctor_id, branch_id, weekday, start_time, end_time, slot_minutes")
      .eq("doctor_id", data.doctorId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createDoctorAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        doctorId: z.string().uuid(),
        weekday: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        slotMinutes: z.number().int().min(5).max(240).default(30),
        branchId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureAdmin(roles);
    if (data.endTime <= data.startTime) throw new Error("نهاية الفترة يجب أن تكون بعد بدايتها.");
    const { error } = await context.supabase.from("availability").insert({
      doctor_id: data.doctorId,
      weekday: data.weekday,
      start_time: `${data.startTime}:00`,
      end_time: `${data.endTime}:00`,
      slot_minutes: data.slotMinutes,
      branch_id: data.branchId ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDoctorAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureAdmin(roles);
    const { error } = await context.supabase.from("availability").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------- Leaves -------- */
export type DoctorLeave = {
  id: string;
  doctor_id: string;
  branch_id: string | null;
  start_date: string;
  end_date: string;
  all_day: boolean;
  reason: string | null;
  doctor_name_ar: string;
  created_at: string;
};

export const listDoctorLeaves = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        branchId: z.string().uuid().nullable().optional(),
        doctorId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<DoctorLeave[]> => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureStaff(roles);
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: rows, error } = await rpc.call(context.supabase, "list_doctor_leaves", {
      _from: data.from,
      _to: data.to,
      _branch_id: data.branchId ?? null,
      _doctor_id: data.doctorId ?? null,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as DoctorLeave[];
  });

export const createDoctorLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        doctorId: z.string().uuid(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        allDay: z.boolean().default(true),
        reason: z.string().max(500).nullable().optional(),
        branchId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureAdmin(roles);
    if (data.endDate < data.startDate) throw new Error("تاريخ الانتهاء قبل تاريخ البداية.");
    const { error } = await context.supabase.from("doctor_leaves" as never).insert({
      doctor_id: data.doctorId,
      start_date: data.startDate,
      end_date: data.endDate,
      all_day: data.allDay,
      reason: data.reason ?? null,
      branch_id: data.branchId ?? null,
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDoctorLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureAdmin(roles);
    const { error } = await context.supabase
      .from("doctor_leaves" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------- Specialties (for filter/select) -------- */
export const listSpecialtiesMini = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureStaff(roles);
    const { data, error } = await context.supabase
      .from("specialties")
      .select("id, name_ar, name_en")
      .order("name_ar");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
