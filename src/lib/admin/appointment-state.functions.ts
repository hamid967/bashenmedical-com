/**
 * Phase 5 — Appointment State Machine (unified entry point).
 *
 * All app-side status changes should call these two server functions instead
 * of writing to `appointments.status` directly. They delegate to the DB RPCs:
 *   - transition_appointment_status(id, to_status, reason, metadata)
 *   - reschedule_appointment_atomic(id, new_date, new_time, reason)
 *
 * The DB enforces:
 *   - Allowed transitions (trg_appt_status_transition).
 *   - Mandatory reason for cancelled/no_show/rescheduled.
 *   - History logging via trg_appt_status_history, including reason + metadata.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const APPT_STATUSES = [
  "new",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "held",
  "pending_verification",
  "pending_payment",
  "checked_in",
  "in_progress",
  "slot_held",
  "pending_insurance",
  "pending_confirmation",
  "arrived",
  "waiting",
  "called",
  "in_consultation",
  "rescheduled",
] as const;

const transitionSchema = z.object({
  appointment_id: z.string().uuid(),
  to_status: z.enum(APPT_STATUSES),
  reason: z.string().trim().max(500).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export const transitionAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => transitionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("transition_appointment_status", {
      _appointment_id: data.appointment_id,
      _to_status: data.to_status,
      _reason: data.reason ?? null,
      _metadata: (data.metadata ?? {}) as object,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, appointment: row };
  });

const rescheduleSchema = z.object({
  appointment_id: z.string().uuid(),
  new_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  new_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  reason: z.string().trim().min(3).max(500),
});

export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => rescheduleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const time = data.new_time.length === 5 ? `${data.new_time}:00` : data.new_time;
    const { data: row, error } = await context.supabase.rpc("reschedule_appointment_atomic", {
      _appointment_id: data.appointment_id,
      _new_date: data.new_date,
      _new_time: time,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, appointment: row };
  });
