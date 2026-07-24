/**
 * Phase 3 — Front Desk + Queue Board.
 *
 * Operational surface for reception / branch managers / admins:
 *  - listTodayAppointments: today's slate for the active branch with the
 *    matching `queue_entries` joined (single row per appointment).
 *  - listQueue: raw queue board grouped by doctor for one branch.
 *  - updateAppointmentStatus: check-in / cancel / no-show / mark completed
 *    via the guarded `update_appointment_status` RPC (state-machine enforced).
 *  - updateQueueStatus: reception-side transitions on `queue_entries`
 *    (waiting → called → in_service → completed / skipped / cancelled).
 *
 * Guarded by `assertHasAnyRole(admin | super_admin | reception |
 * branch_manager)`. RLS on `queue_entries` already grants the same set.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasAnyRole } from "./_guard";

const STAFF_ROLES = ["admin", "reception", "branch_manager"] as const;

/* ---------------------- Today's appointments ---------------------- */

const listSchema = z.object({
  branch_id: z.string().uuid().optional(),
  doctor_id: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const APPT_COLS =
  "id, reference_number, patient_name, patient_phone, appointment_date, appointment_time, " +
  "status, arrived_at, called_at, estimated_wait_min, notes, booking_source, " +
  "doctor:doctors(id, name_ar, name_en), " +
  "branch:branches(id, name_ar, name_en)";

function todayInRiyadh(): string {
  // ISO date in Asia/Riyadh — matches the way slots + queue rows are keyed.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const listTodayAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const day = data.date ?? todayInRiyadh();

    let q = context.supabase
      .from("appointments")
      .select(APPT_COLS)
      .eq("appointment_date", day)
      .order("appointment_time", { ascending: true })
      .limit(200);

    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.doctor_id) q = q.eq("doctor_id", data.doctor_id);
    if (data.q) {
      const needle = data.q.replace(/[%_]/g, "");
      q = q.or(
        `reference_number.ilike.%${needle}%,patient_name.ilike.%${needle}%,patient_phone.ilike.%${needle}%`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    let queueByAppt: Record<string, any> = {};
    if (ids.length > 0) {
      const { data: qrows, error: qerr } = await context.supabase
        .from("queue_entries")
        .select("id, appointment_id, queue_number, status, called_at, started_at, completed_at")
        .in("appointment_id", ids);
      if (qerr) throw new Error(qerr.message);
      queueByAppt = Object.fromEntries((qrows ?? []).map((r: any) => [r.appointment_id, r]));
    }

    return {
      date: day,
      rows: (rows ?? []).map((r: any) => ({ ...r, queue: queueByAppt[r.id] ?? null })),
    };
  });

/* ---------------------- Queue board ---------------------- */

const queueListSchema = z.object({
  branch_id: z.string().uuid().optional(),
  doctor_id: z.string().uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const listQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => queueListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const day = data.date ?? todayInRiyadh();

    let q = context.supabase
      .from("queue_entries")
      .select(
        "id, appointment_id, queue_number, status, called_at, started_at, completed_at, " +
          "doctor:doctors(id, name_ar, name_en), " +
          "branch:branches(id, name_ar, name_en), " +
          "appointment:appointments(id, reference_number, patient_name, patient_phone, appointment_time, status)",
      )
      .eq("queue_date", day)
      .order("queue_number", { ascending: true })
      .limit(500);

    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.doctor_id) q = q.eq("doctor_id", data.doctor_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { date: day, rows: rows ?? [] };
  });

/* ---------------------- Appointment status ---------------------- */

const APPT_STATUSES = [
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

const apptStatusSchema = z.object({
  appointment_id: z.string().uuid(),
  status: z.enum(APPT_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => apptStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const { error } = await context.supabase.rpc("update_appointment_status", {
      _id: data.appointment_id,
      _status: data.status,
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------- Queue status ---------------------- */

const QUEUE_STATUSES = [
  "waiting",
  "called",
  "in_service",
  "completed",
  "skipped",
  "cancelled",
] as const;

const queueStatusSchema = z.object({
  queue_id: z.string().uuid(),
  status: z.enum(QUEUE_STATUSES),
});

export const updateQueueStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => queueStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const now = new Date().toISOString();
    const patch: {
      status: (typeof QUEUE_STATUSES)[number];
      called_at?: string;
      started_at?: string;
      completed_at?: string;
    } = { status: data.status };
    if (data.status === "called") patch.called_at = now;
    if (data.status === "in_service") patch.started_at = now;
    if (data.status === "completed") patch.completed_at = now;

    const { error } = await context.supabase
      .from("queue_entries")
      .update(patch)
      .eq("id", data.queue_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------- Batch A1: Patient search by identifier ---------------------- */

const patientSearchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  branch_id: z.string().uuid().optional(),
});

/**
 * Staff-side patient lookup. Matches on MRN, national_id, phone, and
 * `full_name_*`, plus any row in `patient_identifiers` (Iqama/Passport/etc.).
 * Restricted to non-demo rows unless the caller flips a future flag.
 */
export const searchPatientByIdentifier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => patientSearchSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const needle = data.q.replace(/[%_]/g, "");
    const like = `%${needle}%`;

    // 1. Direct match on patients columns.
    let q = context.supabase
      .from("patients")
      .select(
        "id, mrn, full_name_ar, full_name_en, phone, gender, date_of_birth, national_id, is_active, branch_id",
      )
      .eq("is_demo", false)
      .or(
        `mrn.ilike.${like},national_id.ilike.${like},phone.ilike.${like},full_name_ar.ilike.${like},full_name_en.ilike.${like}`,
      )
      .limit(25);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    const { data: direct, error: e1 } = await q;
    if (e1) throw new Error(e1.message);

    // 2. Match on patient_identifiers (Iqama, Passport, Border, etc.).
    const { data: idHits, error: e2 } = await context.supabase
      .from("patient_identifiers")
      .select("patient_id, id_type, id_value")
      .ilike("id_value", like)
      .limit(25);
    if (e2) throw new Error(e2.message);

    const knownIds = new Set((direct ?? []).map((r: any) => r.id));
    const missingIds = (idHits ?? [])
      .map((r: any) => r.patient_id)
      .filter((id: string) => !knownIds.has(id));

    let extra: any[] = [];
    if (missingIds.length > 0) {
      let q2 = context.supabase
        .from("patients")
        .select(
          "id, mrn, full_name_ar, full_name_en, phone, gender, date_of_birth, national_id, is_active, branch_id",
        )
        .in("id", missingIds)
        .eq("is_demo", false);
      if (data.branch_id) q2 = q2.eq("branch_id", data.branch_id);
      const { data: rows, error: e3 } = await q2;
      if (e3) throw new Error(e3.message);
      extra = rows ?? [];
    }

    return { rows: [...(direct ?? []), ...extra].slice(0, 25) };
  });

/* ---------------------- Batch A1: Patient snapshot ---------------------- */

const snapshotSchema = z.object({ patient_id: z.string().uuid() });

/**
 * Small, read-only patient dossier for the Front Desk snapshot card.
 * Every fetch is RLS-scoped as the staff user; no admin bypass.
 */
export const getPatientSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => snapshotSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);

    const [patientRes, apptRes, allergyRes, visitRes, insRes] = await Promise.all([
      context.supabase
        .from("patients")
        .select(
          "id, mrn, full_name_ar, full_name_en, phone, secondary_phone, gender, date_of_birth, blood_type, nationality, national_id, tags, notes",
        )
        .eq("id", data.patient_id)
        .maybeSingle(),
      context.supabase
        .from("appointments")
        .select(
          "id, reference_number, appointment_date, appointment_time, status, doctor:doctors(name_ar,name_en)",
        )
        .eq("patient_id", data.patient_id)
        .order("appointment_date", { ascending: false })
        .limit(5),
      context.supabase
        .from("patient_allergies")
        .select("allergen, severity, reaction")
        .eq("patient_id", data.patient_id)
        .limit(10),
      context.supabase
        .from("patient_visits")
        .select("id, visit_date, chief_complaint, doctor:doctors(name_ar,name_en)")
        .eq("patient_id", data.patient_id)
        .order("visit_date", { ascending: false })
        .limit(3),
      context.supabase
        .from("insurance_verifications")
        .select("id, status, insurance_provider, verified_at")
        .eq("patient_id", data.patient_id)
        .order("verified_at", { ascending: false })
        .limit(1),
    ]);

    if (patientRes.error) throw new Error(patientRes.error.message);
    if (!patientRes.data) throw new Error("المريض غير موجود.");

    return {
      patient: patientRes.data,
      recent_appointments: apptRes.data ?? [],
      allergies: allergyRes.data ?? [],
      recent_visits: visitRes.data ?? [],
      insurance: insRes.data?.[0] ?? null,
    };
  });

/* ---------------------- Batch A1: Reschedule (staff) ---------------------- */

const rescheduleSchema = z.object({
  appointment_id: z.string().uuid(),
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  new_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  reason: z.string().trim().min(3).max(500),
});

/**
 * Staff-side reschedule. Unlike the guest endpoint under
 * `/api/public/reservations/reschedule`, this requires a reason (logged
 * to `appointment_audit`) and is restricted to admin/reception/branch_manager.
 * Same-doctor clash check runs before the update; the DB unique index is
 * the ultimate race-condition guard.
 */
export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => rescheduleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);

    const time = data.new_time.length === 5 ? `${data.new_time}:00` : data.new_time;

    const { data: appt, error: readErr } = await context.supabase
      .from("appointments")
      .select("id, status, doctor_id, appointment_date, appointment_time")
      .eq("id", data.appointment_id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!appt) throw new Error("الحجز غير موجود.");
    if (appt.status === "cancelled" || appt.status === "completed") {
      throw new Error("لا يمكن إعادة جدولة حجز منتهٍ أو ملغى.");
    }

    if (appt.doctor_id) {
      const { data: clash } = await context.supabase
        .from("appointments")
        .select("id")
        .eq("doctor_id", appt.doctor_id)
        .eq("appointment_date", data.new_date)
        .eq("appointment_time", time)
        .in("status", ["new", "confirmed"])
        .neq("id", appt.id)
        .maybeSingle();
      if (clash) throw new Error("الوقت الجديد غير متاح. اختر وقتًا آخر.");
    }

    const { error: updErr } = await context.supabase
      .from("appointments")
      .update({
        appointment_date: data.new_date,
        appointment_time: time,
        status: "new",
        notes: (appt as any).notes
          ? `${(appt as any).notes}\n[إعادة جدولة] ${data.reason}`
          : `[إعادة جدولة] ${data.reason}`,
      })
      .eq("id", data.appointment_id);
    if (updErr) {
      const msg = /duplicate|unique/i.test(updErr.message)
        ? "الوقت الجديد غير متاح."
        : "تعذّر تنفيذ إعادة الجدولة.";
      throw new Error(msg);
    }

    // Best-effort audit row — trigger `trg_appointments_audit` also logs
    // status changes, but reschedule keeps status='new' so we insert
    // explicitly to preserve the reason.
    try {
      await context.supabase.from("appointment_audit").insert({
        appointment_id: data.appointment_id,
        changed_by: context.userId,
        reason: `[إعادة جدولة] ${appt.appointment_date} ${appt.appointment_time} → ${data.new_date} ${time} — ${data.reason}`,
      });
    } catch {
      /* audit best-effort; primary update already committed */
    }

    return { ok: true };
  });
