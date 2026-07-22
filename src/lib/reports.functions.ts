/**
 * Reports server functions — role-gated aggregates for the admin reports page.
 * All fetches use the request user's bearer via requireSupabaseAuth so RLS applies.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "reception" | "pharmacy" | "super_admin" | "doctor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRoles(sb: any, userId: string): Promise<Role[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.role as Role);
}

function ensureStaff(roles: Role[]) {
  const ok = roles.some((r) => (["admin", "super_admin", "reception"] as Role[]).includes(r));
  if (!ok) throw new Error("ليست لديك الصلاحية لعرض التقارير.");
}

const RangeInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().nullable().optional(),
  doctorId: z.string().uuid().nullable().optional(),
  status: z.string().nullable().optional(),
});

export type AppointmentReportRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  patient_name: string;
  patient_phone: string;
  status: string;
  doctor_name_ar: string | null;
  specialty_name_ar: string | null;
  branch_name_ar: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
};

export const getAppointmentsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => RangeInput.parse(d))
  .handler(async ({ data, context }): Promise<AppointmentReportRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    let q = sb
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, patient_name, patient_phone, status, reason, notes, created_at, doctors(name_ar), specialties(name_ar), branches(name_ar)",
      )
      .gte("appointment_date", data.from)
      .lte("appointment_date", data.to)
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false })
      .limit(5000);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      appointment_date: r.appointment_date,
      appointment_time: r.appointment_time,
      patient_name: r.patient_name,
      patient_phone: r.patient_phone,
      status: r.status,
      reason: r.reason,
      notes: r.notes,
      created_at: r.created_at,
      doctor_name_ar: r.doctors?.name_ar ?? null,
      specialty_name_ar: r.specialties?.name_ar ?? null,
      branch_name_ar: r.branches?.name_ar ?? null,
    }));
  });

const OccupancyInput = z.object({
  branchId: z.string().uuid().nullable().optional(),
  days: z.number().int().min(1).max(365).optional(),
});

export type DoctorOccupancyRow = {
  doctor_id: string;
  name_ar: string;
  specialty_name_ar: string | null;
  is_active: boolean;
  booked: number;
  capacity: number;
  occupancy_pct: number;
  leave_days: number;
};

export const getDoctorOccupancyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => OccupancyInput.parse(d))
  .handler(async ({ data, context }): Promise<DoctorOccupancyRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);
    const { data: rows, error } = await sb.rpc("doctor_occupancy", {
      _branch_id: data.branchId ?? null,
      _days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      doctor_id: r.doctor_id,
      name_ar: r.name_ar,
      specialty_name_ar: r.specialty_name_ar,
      is_active: r.is_active,
      booked: Number(r.booked ?? 0),
      capacity: Number(r.capacity ?? 0),
      occupancy_pct: Number(r.occupancy_pct ?? 0),
      leave_days: Number(r.leave_days ?? 0),
    }));
  });

export type PharmacyOrderRow = {
  id: string;
  patient_name: string;
  patient_phone: string;
  status: string;
  branch_name_ar: string | null;
  notes: string | null;
  created_at: string;
};

export const getPharmacyOrdersReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => RangeInput.parse(d))
  .handler(async ({ data, context }): Promise<PharmacyOrderRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);
    let q = sb
      .from("medicine_orders")
      .select("id, patient_name, patient_phone, status, notes, created_at, branches(name_ar)")
      .gte("created_at", `${data.from}T00:00:00`)
      .lte("created_at", `${data.to}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      patient_name: r.patient_name,
      patient_phone: r.patient_phone,
      status: r.status,
      notes: r.notes,
      created_at: r.created_at,
      branch_name_ar: r.branches?.name_ar ?? null,
    }));
  });

const PatientsInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().nullable().optional(),
  gender: z.string().nullable().optional(),
});

export type PatientReportRow = {
  id: string;
  mrn: string | null;
  full_name: string;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  branch_name_ar: string | null;
  created_at: string;
};

export const getPatientsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => PatientsInput.parse(d))
  .handler(async ({ data, context }): Promise<PatientReportRow[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);
    let q = sb
      .from("patients")
      .select("id, mrn, full_name, phone, gender, date_of_birth, created_at, branches(name_ar)")
      .gte("created_at", `${data.from}T00:00:00`)
      .lte("created_at", `${data.to}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.gender) q = q.eq("gender", data.gender);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      mrn: r.mrn,
      full_name: r.full_name,
      phone: r.phone,
      gender: r.gender,
      date_of_birth: r.date_of_birth,
      created_at: r.created_at,
      branch_name_ar: r.branches?.name_ar ?? null,
    }));
  });
