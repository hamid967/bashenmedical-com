/**
 * Patient-facing appointment management server functions.
 *
 * Scoped to the signed-in user via the linked `patients.profile_id` when it
 * exists, with a phone-based fallback for legacy rows created before the
 * patient record was linked. RLS on `appointments` enforces the same scope.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveScope(supabase: any, userId: string) {
  const [{ data: patient }, { data: profile }] = await Promise.all([
    supabase.from("patients").select("id, mrn").eq("profile_id", userId).maybeSingle(),
    supabase.from("profiles").select("id, phone").eq("id", userId).maybeSingle(),
  ]);
  return {
    patientId: (patient?.id as string | null) ?? null,
    mrn: (patient?.mrn as string | null) ?? null,
    phone: (profile?.phone as string | null) ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyScope(query: any, scope: { patientId: string | null; phone: string | null }) {
  if (scope.patientId) return query.eq("patient_id", scope.patientId);
  if (scope.phone) return query.eq("patient_phone", scope.phone);
  return query.eq("patient_id", "00000000-0000-0000-0000-000000000000");
}

/* ---------------------------- listMyAppointments -------------------------- */

const ListSchema = z
  .object({
    scope: z.enum(["upcoming", "past", "all"]).default("upcoming"),
    doctorId: z.string().uuid().optional().nullable(),
    branchId: z.string().uuid().optional().nullable(),
    status: z
      .enum(["new", "confirmed", "completed", "cancelled", "no_show"])
      .optional()
      .nullable(),
    fromDate: z.string().date().optional().nullable(),
    toDate: z.string().date().optional().nullable(),
    search: z.string().trim().max(120).optional().nullable(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .default({ scope: "upcoming", limit: 50 });

export const listMyAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => ListSchema.parse(i ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const scope = await resolveScope(supabase, userId);

    const today = new Date().toISOString().slice(0, 10);
    let q = supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, status, reason, notes, doctor_id, branch_id, specialty_id, patient_name, patient_phone, patient_email, insurance_status, is_demo, created_at, cancelled_at",
      );

    q = applyScope(q, scope);

    if (data.scope === "upcoming") {
      q = q
        .gte("appointment_date", today)
        .in("status", ["new", "confirmed"])
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });
    } else if (data.scope === "past") {
      q = q
        .or(
          `appointment_date.lt.${today},status.in.(completed,cancelled,no_show)`,
        )
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false });
    } else {
      q = q
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false });
    }

    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.status) q = q.eq("status", data.status);
    if (data.fromDate) q = q.gte("appointment_date", data.fromDate);
    if (data.toDate) q = q.lte("appointment_date", data.toDate);
    if (data.search) q = q.ilike("reason", `%${data.search}%`);

    q = q.limit(data.limit);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const doctorIds = [
      ...new Set(
        (rows ?? []).map((r: { doctor_id: string | null }) => r.doctor_id).filter(Boolean),
      ),
    ] as string[];
    const branchIds = [
      ...new Set(
        (rows ?? []).map((r: { branch_id: string | null }) => r.branch_id).filter(Boolean),
      ),
    ] as string[];
    const specialtyIds = [
      ...new Set(
        (rows ?? [])
          .map((r: { specialty_id: string | null }) => r.specialty_id)
          .filter(Boolean),
      ),
    ] as string[];

    const [docsRes, brRes, specRes] = await Promise.all([
      doctorIds.length
        ? supabase
            .from("doctors")
            .select("id, name_ar, name_en, title_ar, title_en, photo_url, slug")
            .in("id", doctorIds)
        : Promise.resolve({ data: [] }),
      branchIds.length
        ? supabase
            .from("branches")
            .select("id, name_ar, name_en, address_ar, address_en, phone, lat, lng, slug")
            .in("id", branchIds)
        : Promise.resolve({ data: [] }),
      specialtyIds.length
        ? supabase
            .from("specialties")
            .select("id, name_ar, name_en")
            .in("id", specialtyIds)
        : Promise.resolve({ data: [] }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docMap = new Map<string, any>((docsRes.data ?? []).map((d: any) => [d.id, d]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brMap = new Map<string, any>((brRes.data ?? []).map((b: any) => [b.id, b]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spMap = new Map<string, any>((specRes.data ?? []).map((s: any) => [s.id, s]));

    return {
      scope,
      items: (rows ?? []).map((a) => ({
        ...a,
        doctor: a.doctor_id ? docMap.get(a.doctor_id) ?? null : null,
        branch: a.branch_id ? brMap.get(a.branch_id) ?? null : null,
        specialty: a.specialty_id ? spMap.get(a.specialty_id) ?? null : null,
      })),
    };
  });

/* ------------------------ ownership guard for actions --------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadOwnedAppointment(supabase: any, userId: string, id: string) {
  const scope = await resolveScope(supabase, userId);
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, patient_phone, appointment_date, appointment_time, status, doctor_id, branch_id, specialty_id, reason",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("الموعد غير موجود.");
  const owns =
    (scope.patientId && data.patient_id === scope.patientId) ||
    (!scope.patientId && scope.phone && data.patient_phone === scope.phone);
  if (!owns) throw new Error("لا تملك صلاحية على هذا الموعد.");
  return { appt: data, scope };
}

/* ---------------------------- confirmMyAttendance ------------------------- */

export const confirmMyAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt } = await loadOwnedAppointment(supabase, userId, data.id);
    if (appt.status === "cancelled" || appt.status === "completed") {
      throw new Error("لا يمكن تأكيد موعد منتهي أو ملغى.");
    }
    if (appt.status === "confirmed") return { ok: true, alreadyConfirmed: true as const };
    const { error } = await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, alreadyConfirmed: false as const };
  });

/* ---------------------------- cancelMyAppointment ------------------------- */

export const cancelMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt } = await loadOwnedAppointment(supabase, userId, data.id);
    if (appt.status === "cancelled") return { ok: true };
    if (appt.status === "completed") throw new Error("لا يمكن إلغاء موعد مكتمل.");
    const { error } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        notes: data.reason ? `[سبب الإلغاء] ${data.reason}` : undefined,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------- rescheduleMyAppointment ----------------------- */

const RescheduleSchema = z.object({
  id: z.string().uuid(),
  date: z.string().date(),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

export const reschedulePatientAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => RescheduleSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt } = await loadOwnedAppointment(supabase, userId, data.id);
    if (appt.status === "cancelled" || appt.status === "completed") {
      throw new Error("لا يمكن إعادة جدولة موعد منتهي أو ملغى.");
    }

    // Same-doctor clash check
    if (appt.doctor_id) {
      const clashRes = await supabase
        .from("appointments")
        .select("id")
        .eq("doctor_id", appt.doctor_id)
        .eq("appointment_date", data.date)
        .eq("appointment_time", data.time)
        .in("status", ["new", "confirmed"])
        .neq("id", appt.id)
        .maybeSingle();
      if (clashRes.error && clashRes.error.code !== "PGRST116") {
        throw new Error(clashRes.error.message);
      }
      if (clashRes.data) {
        throw new Error("الوقت الجديد غير متاح. اختر وقتًا آخر.");
      }
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_date: data.date,
        appointment_time: data.time.length === 5 ? `${data.time}:00` : data.time,
        status: "new",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------ requestFollowUp --------------------------- */

const FollowUpSchema = z.object({
  fromAppointmentId: z.string().uuid(),
  preferredDate: z.string().date(),
  preferredTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .default("09:00"),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const requestFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => FollowUpSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt, scope } = await loadOwnedAppointment(
      supabase,
      userId,
      data.fromAppointmentId,
    );

    // Patient details snapshot from the previous visit or profile
    const [{ data: profile }, { data: patient }] = await Promise.all([
      supabase.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
      scope.patientId
        ? supabase
            .from("patients")
            .select("full_name_ar, phone, email")
            .eq("id", scope.patientId)
            .maybeSingle()
        : Promise.resolve({ data: null as { full_name_ar: string; phone: string; email: string | null } | null }),
    ]);

    const patient_name =
      patient?.full_name_ar || profile?.full_name || "مريض";
    const patient_phone = patient?.phone || profile?.phone || appt.patient_phone;

    const insertRes = await supabase
      .from("appointments")
      .insert({
        doctor_id: appt.doctor_id,
        branch_id: appt.branch_id,
        specialty_id: appt.specialty_id,
        appointment_date: data.preferredDate,
        appointment_time:
          data.preferredTime.length === 5 ? `${data.preferredTime}:00` : data.preferredTime,
        reason: data.reason || `متابعة لموعد سابق (${appt.appointment_date})`,
        patient_name,
        patient_phone,
        patient_email: patient?.email ?? null,
        patient_id: scope.patientId,
        status: "new",
      })
      .select("id")
      .single();
    if (insertRes.error) throw new Error(insertRes.error.message);
    return { ok: true, id: insertRes.data.id as string };
  });
