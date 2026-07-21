/**
 * Admin: usage stats for "Manage My Reservations".
 * Aggregates events from public.reservation_manage_events over a rolling
 * window plus a daily breakdown for charts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type DailyRow = {
  day: string; // YYYY-MM-DD (UTC)
  otp_sent: number;
  otp_verified: number;
  cancel: number;
  cancel_undo_success: number;
  cancel_undo_failed: number;
  reschedule: number;
  slot_rebooked: number;
  waitlist_notified: number;
  waitlist_reverted: number;
};

export type ReservationsUsageSummary = {
  windowDays: number;
  totalSamples: number;
  truncated: boolean;
  totals: {
    otp_sent: number;
    otp_verified: number;
    cancel: number;
    cancel_undo_attempted: number;
    cancel_undo_success: number;
    reschedule: number;
    slot_rebooked: number;
    waitlist_notified: number;
    waitlist_reverted: number;
  };
  rates: {
    otp_verify_rate: number | null; // verified / sent
    undo_success_rate: number | null; // success / attempted
    undo_usage_rate: number | null; // attempted / cancel
    slot_rebook_rate: number | null; // rebooked / undo_success
    waitlist_revert_rate: number | null; // reverted / notified
  };
  daily: DailyRow[];
};

import { assertConsoleAccess as assertAdmin } from "./_guard";

function safeRate(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10; // percent, 1 decimal
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

const Input = z.object({
  windowDays: z.number().int().min(1).max(90).default(14),
  limit: z.number().int().min(500).max(20_000).default(10_000),
});

export const getReservationsUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ReservationsUsageSummary> => {
    await assertAdmin(context);
    const since = new Date(
      Date.now() - data.windowDays * 24 * 3600_000,
    ).toISOString();

    const { data: rows, error } = await context.supabase
      .from("reservation_manage_events")
      .select(
        "event_type, released, waitlist_notified, slot_rebooked, waitlist_reverted, created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      event_type: string;
      released: boolean | null;
      waitlist_notified: boolean | null;
      slot_rebooked: boolean | null;
      waitlist_reverted: boolean | null;
      created_at: string;
    }>;

    // Build empty daily buckets across the window (chronological asc)
    const buckets = new Map<string, DailyRow>();
    for (let i = data.windowDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600_000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, {
        day: key,
        otp_sent: 0,
        otp_verified: 0,
        cancel: 0,
        cancel_undo_success: 0,
        cancel_undo_failed: 0,
        reschedule: 0,
        slot_rebooked: 0,
        waitlist_notified: 0,
        waitlist_reverted: 0,
      });
    }

    const totals = {
      otp_sent: 0,
      otp_verified: 0,
      cancel: 0,
      cancel_undo_success: 0,
      cancel_undo_failed: 0,
      reschedule: 0,
      slot_rebooked: 0,
      waitlist_notified: 0,
      waitlist_reverted: 0,
    };

    for (const r of list) {
      const key = dayKey(r.created_at);
      const b = buckets.get(key);
      const t = r.event_type;

      // totals
      if (t === "otp_sent") totals.otp_sent++;
      else if (t === "otp_verified") totals.otp_verified++;
      else if (t === "cancel") {
        totals.cancel++;
        if (r.waitlist_notified) totals.waitlist_notified++;
      } else if (t === "cancel_undo_success") {
        totals.cancel_undo_success++;
        if (r.slot_rebooked) totals.slot_rebooked++;
        if (r.waitlist_reverted) totals.waitlist_reverted++;
      } else if (t === "cancel_undo_failed") {
        totals.cancel_undo_failed++;
      } else if (t === "reschedule") totals.reschedule++;

      // daily
      if (b) {
        if (t === "otp_sent") b.otp_sent++;
        else if (t === "otp_verified") b.otp_verified++;
        else if (t === "cancel") {
          b.cancel++;
          if (r.waitlist_notified) b.waitlist_notified++;
        } else if (t === "cancel_undo_success") {
          b.cancel_undo_success++;
          if (r.slot_rebooked) b.slot_rebooked++;
          if (r.waitlist_reverted) b.waitlist_reverted++;
        } else if (t === "cancel_undo_failed") b.cancel_undo_failed++;
        else if (t === "reschedule") b.reschedule++;
      }
    }

    const undo_attempted =
      totals.cancel_undo_success + totals.cancel_undo_failed;

    return {
      windowDays: data.windowDays,
      totalSamples: list.length,
      truncated: list.length >= data.limit,
      totals: {
        otp_sent: totals.otp_sent,
        otp_verified: totals.otp_verified,
        cancel: totals.cancel,
        cancel_undo_attempted: undo_attempted,
        cancel_undo_success: totals.cancel_undo_success,
        reschedule: totals.reschedule,
        slot_rebooked: totals.slot_rebooked,
        waitlist_notified: totals.waitlist_notified,
        waitlist_reverted: totals.waitlist_reverted,
      },
      rates: {
        otp_verify_rate: safeRate(totals.otp_verified, totals.otp_sent),
        undo_success_rate: safeRate(totals.cancel_undo_success, undo_attempted),
        undo_usage_rate: safeRate(undo_attempted, totals.cancel),
        slot_rebook_rate: safeRate(
          totals.slot_rebooked,
          totals.cancel_undo_success,
        ),
        waitlist_revert_rate: safeRate(
          totals.waitlist_reverted,
          totals.waitlist_notified,
        ),
      },
      daily: Array.from(buckets.values()),
    };
  });
