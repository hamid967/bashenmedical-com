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
      _reason: data.reason ?? null,
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
    const patch: Record<string, unknown> = { status: data.status };
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
