/**
 * Fire-and-forget logger for the "Manage My Reservations" telemetry table.
 * Uses supabaseAdmin (service_role only can write per RLS). Failures are
 * swallowed — never block the user request on analytics.
 */
import { createHash } from "crypto";

export type ReservationEventType =
  | "otp_sent"
  | "otp_verified"
  | "cancel"
  | "cancel_undo_success"
  | "cancel_undo_failed"
  | "reschedule";

export type ReservationEventInput = {
  event_type: ReservationEventType;
  phone?: string | null;
  appointment_id?: string | null;
  released?: boolean | null;
  waitlist_notified?: boolean | null;
  slot_rebooked?: boolean | null;
  waitlist_reverted?: boolean | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
};

function hashPhone(phone: string): string {
  // Salted-ish (server-only constant is fine here — this is aggregated
  // dashboard telemetry, not identity). Truncate for compactness.
  return createHash("sha256").update(`rme:${phone}`).digest("hex").slice(0, 24);
}

export async function logReservationEvent(input: ReservationEventInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("reservation_manage_events").insert({
      event_type: input.event_type,
      phone_hash: input.phone ? hashPhone(input.phone) : null,
      appointment_id: input.appointment_id ?? null,
      released: input.released ?? null,
      waitlist_notified: input.waitlist_notified ?? null,
      slot_rebooked: input.slot_rebooked ?? null,
      waitlist_reverted: input.waitlist_reverted ?? null,
      meta: (input.meta ?? {}) as never,
      ip: input.ip ?? null,
    });
  } catch {
    /* telemetry is best-effort */
  }
}
