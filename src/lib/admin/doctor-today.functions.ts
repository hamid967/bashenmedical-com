/**
 * Batch A2 — Doctor Console server functions.
 *
 * Scope: the signed-in doctor's OWN day. All handlers:
 *   1. Enforce `doctor` role (super_admin also passes).
 *   2. Resolve the caller's `doctor_id` via `doctor_profiles.user_id`.
 *   3. Constrain all reads/writes to appointments/visits owned by that doctor.
 *
 * Access uses the request-scoped supabase client (`context.supabase`) so RLS
 * applies as the caller. No `supabaseAdmin`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasAnyRole } from "./_guard";

const DOCTOR_ROLES = ["doctor", "super_admin"] as const;

async function resolveDoctorId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("doctor_profiles")
    .select("doctor_id, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.doctor_id) {
    throw new Error("لا يوجد ملف طبيب مرتبط بهذا الحساب.");
  }
  return data.doctor_id;
}

/* ----------------------------- 1) Today list ----------------------------- */

const APPT_COLS =
  "id, reference_number, patient_id, patient_name, patient_phone, appointment_date, appointment_time, " +
  "status, arrived_at, called_at, checked_in_at, notes, chief_complaint, " +
  "branch:branches(id, name_ar, name_en)";

export const listMyTodayAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("appointments")
      .select(APPT_COLS)
      .eq("doctor_id", doctorId)
      .eq("appointment_date", today)
      .order("appointment_time", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return { doctor_id: doctorId, rows: data ?? [] };
  });

/* ----------------------------- 2) Start visit ---------------------------- */

const startSchema = z.object({ appointment_id: z.string().uuid() });

export const startVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => startSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);

    const { data: appt, error: fetchErr } = await context.supabase
      .from("appointments")
      .select("id, doctor_id, patient_id, status")
      .eq("id", data.appointment_id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!appt || appt.doctor_id !== doctorId) {
      throw new Error("الحجز غير موجود أو غير مسموح.");
    }
    if (!["arrived", "checked_in", "waiting", "called"].includes(appt.status)) {
      throw new Error(`لا يمكن بدء الكشف والحالة الحالية: ${appt.status}`);
    }

    // Move appt → in_consultation
    const { error: updErr } = await context.supabase
      .from("appointments")
      .update({ status: "in_consultation" })
      .eq("id", appt.id);
    if (updErr) throw new Error(updErr.message);

    // Create or reuse patient_visits row for this appointment.
    const { data: existing } = await context.supabase
      .from("patient_visits")
      .select("id")
      .eq("appointment_id", appt.id)
      .maybeSingle();
    if (existing?.id) return { ok: true, visit_id: existing.id };

    if (!appt.patient_id) {
      throw new Error("لا يمكن بدء الكشف قبل ربط المريض بالحجز.");
    }
    const { data: visit, error: vErr } = await context.supabase
      .from("patient_visits")
      .insert({
        appointment_id: appt.id,
        doctor_id: doctorId,
        patient_id: appt.patient_id,
        visit_date: new Date().toISOString().slice(0, 10),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);
    return { ok: true, visit_id: visit.id };
  });

/* ----------------------------- 3) Save/complete visit -------------------- */

const completeSchema = z.object({
  visit_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  chief_complaint: z.string().trim().max(500).optional().nullable(),
  subjective: z.string().trim().max(4000).optional().nullable(),
  objective: z.string().trim().max(4000).optional().nullable(),
  assessment: z.string().trim().max(4000).optional().nullable(),
  plan: z.string().trim().max(4000).optional().nullable(),
  follow_up_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  finalize: z.boolean().default(false),
});

export const saveVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => completeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);

    const { data: visit, error: vErr } = await context.supabase
      .from("patient_visits")
      .select("id, doctor_id, appointment_id")
      .eq("id", data.visit_id)
      .maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!visit || visit.doctor_id !== doctorId || visit.appointment_id !== data.appointment_id) {
      throw new Error("الزيارة غير موجودة أو غير مسموح.");
    }

    const { error: updErr } = await context.supabase
      .from("patient_visits")
      .update({
        chief_complaint: data.chief_complaint ?? null,
        subjective: data.subjective ?? null,
        objective: data.objective ?? null,
        assessment: data.assessment ?? null,
        plan: data.plan ?? null,
        follow_up_date: data.follow_up_date ?? null,
      })
      .eq("id", visit.id);
    if (updErr) throw new Error(updErr.message);

    if (data.finalize) {
      const { error: apErr } = await context.supabase
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", data.appointment_id)
        .eq("doctor_id", doctorId);
      if (apErr) throw new Error(apErr.message);
    }
    return { ok: true, finalized: data.finalize };
  });

/* ----------------------------- 4) Follow-up hold ------------------------- */

const followUpSchema = z.object({
  appointment_id: z.string().uuid(),
  preferred_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferred_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const holdFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => followUpSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);

    const { data: appt, error: fErr } = await context.supabase
      .from("appointments")
      .select("id, doctor_id, patient_name, patient_phone, branch_id, specialty_id")
      .eq("id", data.appointment_id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!appt || appt.doctor_id !== doctorId) {
      throw new Error("الحجز غير موجود أو غير مسموح.");
    }
    if (data.preferred_to < data.preferred_from) {
      throw new Error("نطاق التاريخ غير صحيح.");
    }

    const reference = `FUP-${Date.now().toString(36).toUpperCase()}`;
    const { error: iErr } = await context.supabase.from("appointment_waitlist").insert({
      branch_id: appt.branch_id,
      doctor_id: doctorId,
      specialty_id: appt.specialty_id ?? null,
      patient_name: appt.patient_name ?? "متابعة",
      patient_phone: appt.patient_phone ?? "",
      preferred_from: data.preferred_from,
      preferred_to: data.preferred_to,
      reference,
      status: "pending",
      notes: data.notes ?? "متابعة بعد الكشف",
    });
    if (iErr) throw new Error(iErr.message);
    return { ok: true, reference };
  });

/* ----------------------------- 5) Patient history ------------------------ */

const historySchema = z.object({ patient_id: z.string().uuid() });

export const listPatientHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => historySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);

    const [apptsRes, visitsRes] = await Promise.all([
      context.supabase
        .from("appointments")
        .select(
          "id, reference_number, appointment_date, appointment_time, status, chief_complaint, " +
            "doctor:doctors(id, name_ar, name_en), branch:branches(id, name_ar, name_en)",
        )
        .eq("patient_id", data.patient_id)
        .lt("appointment_date", today)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false })
        .limit(50),
      context.supabase
        .from("patient_visits")
        .select(
          "id, visit_date, chief_complaint, subjective, objective, assessment, plan, follow_up_date, appointment_id",
        )
        .eq("patient_id", data.patient_id)
        .eq("doctor_id", doctorId)
        .order("visit_date", { ascending: false })
        .limit(30),
    ]);
    if (apptsRes.error) throw new Error(apptsRes.error.message);
    if (visitsRes.error) throw new Error(visitsRes.error.message);
    return { appointments: apptsRes.data ?? [], visits: visitsRes.data ?? [] };
  });

/* ----------------------------- 6) Prescriptions (Rx) --------------------- */

const RX_COLS =
  "id, medication, dosage, instructions, start_date, end_date, refills_remaining, status, notes, created_at";

const rxListSchema = z.object({ appointment_id: z.string().uuid() });

export const listVisitPrescriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => rxListSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);

    const { data: appt, error: aErr } = await context.supabase
      .from("appointments")
      .select("id, doctor_id, patient_id")
      .eq("id", data.appointment_id)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!appt || appt.doctor_id !== doctorId) throw new Error("الحجز غير موجود أو غير مسموح.");
    if (!appt.patient_id) return { rows: [] };

    const { data: rows, error } = await context.supabase
      .from("prescriptions")
      .select(RX_COLS)
      .eq("patient_id", appt.patient_id)
      .eq("doctor_id", doctorId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

const rxAddSchema = z.object({
  appointment_id: z.string().uuid(),
  medication: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(120).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  refills_remaining: z.number().int().min(0).max(12).default(0),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const addPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => rxAddSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);

    const { data: appt, error: aErr } = await context.supabase
      .from("appointments")
      .select("id, doctor_id, patient_id, branch_id")
      .eq("id", data.appointment_id)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!appt || appt.doctor_id !== doctorId) throw new Error("الحجز غير موجود أو غير مسموح.");
    if (!appt.patient_id) throw new Error("لا يمكن إصدار الوصفة قبل ربط المريض بالحجز.");
    if (data.end_date && data.start_date && data.end_date < data.start_date) {
      throw new Error("تاريخ نهاية الوصفة قبل تاريخ البدء.");
    }

    const { data: inserted, error } = await context.supabase
      .from("prescriptions")
      .insert({
        patient_id: appt.patient_id,
        doctor_id: doctorId,
        branch_id: appt.branch_id ?? null,
        medication: data.medication,
        dosage: data.dosage ?? null,
        instructions: data.instructions ?? null,
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        refills_remaining: data.refills_remaining ?? 0,
        notes: data.notes ?? null,
        status: "active",
        created_by: context.userId,
      })
      .select(RX_COLS)
      .single();
    if (error) throw new Error(error.message);
    return { row: inserted };
  });

const rxCancelSchema = z.object({
  prescription_id: z.string().uuid(),
});

export const cancelPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => rxCancelSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);

    const { data: rx, error: fErr } = await context.supabase
      .from("prescriptions")
      .select("id, doctor_id, status")
      .eq("id", data.prescription_id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!rx || rx.doctor_id !== doctorId) throw new Error("الوصفة غير موجودة أو غير مسموح.");
    if (rx.status !== "active") throw new Error("لا يمكن إلغاء وصفة غير نشطة.");

    const { error } = await context.supabase
      .from("prescriptions")
      .update({ status: "cancelled" })
      .eq("id", rx.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- Lab / Radiology orders --------------------- */

const LAB_COLS =
  "id, title, test_type, summary, status, report_date, released_at, ordered_by, created_at";
const RAD_COLS =
  "id, modality, body_part, findings, status, report_date, released_at, ordered_by, created_at";

const orderListSchema = z.object({ appointment_id: z.string().uuid() });

async function loadApptForOrder(sb: any, apptId: string, doctorId: string) {
  const { data: appt, error } = await sb
    .from("appointments")
    .select("id, doctor_id, patient_id")
    .eq("id", apptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!appt || appt.doctor_id !== doctorId) throw new Error("الحجز غير موجود أو غير مسموح.");
  return appt as { id: string; doctor_id: string; patient_id: string | null };
}

export const listVisitLabOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderListSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);
    const appt = await loadApptForOrder(context.supabase, data.appointment_id, doctorId);
    if (!appt.patient_id) return { rows: [] };
    const { data: rows, error } = await context.supabase
      .from("lab_reports")
      .select(LAB_COLS)
      .eq("patient_id", appt.patient_id)
      .eq("ordered_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

const labAddSchema = z.object({
  appointment_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  test_type: z.string().trim().max(120).optional().nullable(),
  summary: z.string().trim().max(2000).optional().nullable(),
});

export const addLabOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => labAddSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);
    const appt = await loadApptForOrder(context.supabase, data.appointment_id, doctorId);
    if (!appt.patient_id) throw new Error("لا يمكن طلب فحص قبل ربط المريض بالحجز.");
    const { data: inserted, error } = await context.supabase
      .from("lab_reports")
      .insert({
        patient_id: appt.patient_id,
        title: data.title,
        test_type: data.test_type ?? null,
        summary: data.summary ?? null,
        status: "pending",
        ordered_by: context.userId,
        report_date: new Date().toISOString().slice(0, 10),
      })
      .select(LAB_COLS)
      .single();
    if (error) throw new Error(error.message);
    return { row: inserted };
  });

const orderIdSchema = z.object({ id: z.string().uuid() });

export const cancelLabOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const { data: row, error: fErr } = await context.supabase
      .from("lab_reports")
      .select("id, ordered_by, released_at, status")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!row || row.ordered_by !== context.userId)
      throw new Error("الطلب غير موجود أو غير مسموح.");
    if (row.released_at) throw new Error("لا يمكن إلغاء طلب صادر بالنتيجة.");
    const { error } = await context.supabase
      .from("lab_reports")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVisitRadOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderListSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);
    const appt = await loadApptForOrder(context.supabase, data.appointment_id, doctorId);
    if (!appt.patient_id) return { rows: [] };
    const { data: rows, error } = await context.supabase
      .from("radiology_reports")
      .select(RAD_COLS)
      .eq("patient_id", appt.patient_id)
      .eq("ordered_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

const radAddSchema = z.object({
  appointment_id: z.string().uuid(),
  modality: z.string().trim().min(1).max(80),
  body_part: z.string().trim().max(120).optional().nullable(),
  findings: z.string().trim().max(2000).optional().nullable(),
});

export const addRadOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => radAddSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const doctorId = await resolveDoctorId(context.supabase, context.userId);
    const appt = await loadApptForOrder(context.supabase, data.appointment_id, doctorId);
    if (!appt.patient_id) throw new Error("لا يمكن طلب أشعة قبل ربط المريض بالحجز.");
    const { data: inserted, error } = await context.supabase
      .from("radiology_reports")
      .insert({
        patient_id: appt.patient_id,
        modality: data.modality,
        body_part: data.body_part ?? null,
        findings: data.findings ?? null,
        status: "pending",
        ordered_by: context.userId,
        report_date: new Date().toISOString().slice(0, 10),
      })
      .select(RAD_COLS)
      .single();
    if (error) throw new Error(error.message);
    return { row: inserted };
  });

export const cancelRadOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => orderIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...DOCTOR_ROLES]);
    const { data: row, error: fErr } = await context.supabase
      .from("radiology_reports")
      .select("id, ordered_by, released_at, status")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!row || row.ordered_by !== context.userId)
      throw new Error("الطلب غير موجود أو غير مسموح.");
    if (row.released_at) throw new Error("لا يمكن إلغاء طلب صادر بالنتيجة.");
    const { error } = await context.supabase
      .from("radiology_reports")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
