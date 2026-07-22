/**
 * Calendar server functions — list appointments in a date range and
 * reschedule (date + time) via drag & drop. Role-gated to admin/reception.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "reception" | "pharmacy" | "super_admin" | "doctor";

async function getRoles(sb: any, userId: string): Promise<Role[]> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}

function ensureStaff(roles: Role[]) {
  const ok = roles.some((r) => (["admin", "super_admin", "reception"] as Role[]).includes(r));
  if (!ok) throw new Error("ليست لديك الصلاحية لتنفيذ هذا الإجراء.");
}

const RangeInput = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from date required (YYYY-MM-DD)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to date required (YYYY-MM-DD)"),
  branchId: z.string().uuid().nullable().optional(),
  doctorId: z.string().uuid().nullable().optional(),
});

export type CalendarAppointment = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  patient_name: string;
  patient_phone: string;
  status: "new" | "confirmed" | "completed" | "cancelled" | "no_show";
  doctor_id: string | null;
  specialty_id: string | null;
  branch_id: string | null;
  notes: string | null;
  reason: string | null;
  doctors: { name_ar: string; name_en: string } | null;
  specialties: { name_ar: string; name_en: string } | null;
};

export const listAppointmentsRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => RangeInput.parse(d))
  .handler(async ({ data, context }): Promise<CalendarAppointment[]> => {
    const sb = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    let q = sb
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, patient_name, patient_phone, status, doctor_id, specialty_id, branch_id, notes, reason, doctors(name_ar,name_en), specialties(name_ar,name_en)",
      )
      .gte("appointment_date", data.from)
      .lte("appointment_date", data.to)
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as CalendarAppointment[];
  });

const RescheduleInput = z.object({
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => RescheduleInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    const time = data.time.length === 5 ? `${data.time}:00` : data.time;

    // Load current to block rescheduling terminal states
    const { data: current, error: readErr } = await sb
      .from("appointments")
      .select("id, status, appointment_date, appointment_time")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("الحجز غير موجود.");
    if (["completed", "cancelled", "no_show"].includes(current.status as string)) {
      throw new Error("لا يمكن إعادة جدولة حجز منتهي أو ملغي.");
    }
    if (current.appointment_date === data.date && current.appointment_time === time) {
      return { ok: true, unchanged: true };
    }

    const { error } = await sb
      .from("appointments")
      .update({ appointment_date: data.date, appointment_time: time })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Best-effort audit log (matches pattern used in updateAppointmentStatus)
    try {
      await sb.rpc(
        "log_security_event" as any,
        {
          _action: "appointment_rescheduled",
          _appointment_id: data.id,
          _from_status: current.status,
          _to_status: current.status,
          _reason: `${current.appointment_date} ${current.appointment_time} → ${data.date} ${time}`,
          _metadata: { actor: context.userId },
        } as any,
      );
    } catch (e) {
      console.warn("[calendar] audit log failed", e);
    }

    return { ok: true };
  });

export const listDoctorsForCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureStaff(roles);
    const { data, error } = await context.supabase
      .from("doctors")
      .select("id, name_ar, name_en, is_active, branch_id")
      .eq("is_active", true)
      .order("name_ar");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
