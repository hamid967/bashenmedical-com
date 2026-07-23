/**
 * Admin — Booking trace explorer.
 * Query booking_trace_events by correlation_id, reference number, or date.
 * Admin/super_admin only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./service-inquiries.functions";

const listFilters = z.object({
  correlation_id: z.string().trim().max(160).optional(),
  reference: z.string().trim().max(64).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listBookingTraceEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listFilters.parse(input))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    let q = supabaseAdmin
      .from("booking_trace_events")
      .select(
        "id, correlation_id, event, idempotency_key_masked, reference_number, appointment_id, doctor_id, appointment_date, appointment_time, duration_ms, pg_code, extra, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.correlation_id) q = q.eq("correlation_id", data.correlation_id);
    if (data.reference) q = q.eq("reference_number", data.reference);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const listRecentBookingCorrelations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ limit: z.number().int().min(1).max(200).default(50) })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Simple recent list: pull recent events and group client-side.
    const { data: rows, error } = await supabaseAdmin
      .from("booking_trace_events")
      .select(
        "correlation_id, event, reference_number, created_at, pg_code, duration_ms",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit * 6);
    if (error) throw new Error(error.message);

    type Row = NonNullable<typeof rows>[number];
    const byCorr = new Map<
      string,
      {
        correlation_id: string;
        started_at: string;
        last_event: string;
        reference_number: string | null;
        events: number;
        had_error: boolean;
        had_conflict: boolean;
        total_ms: number;
      }
    >();
    for (const r of (rows ?? []) as Row[]) {
      const key = r.correlation_id;
      const prev = byCorr.get(key);
      const isErr = (r.event ?? "").endsWith(".error");
      const isConf = (r.event ?? "").endsWith(".conflict");
      if (!prev) {
        byCorr.set(key, {
          correlation_id: key,
          started_at: r.created_at,
          last_event: r.event,
          reference_number: r.reference_number ?? null,
          events: 1,
          had_error: isErr,
          had_conflict: isConf,
          total_ms: r.duration_ms ?? 0,
        });
      } else {
        // rows arrive newest→oldest; keep first (newest) as last_event,
        // update started_at to older, accumulate flags.
        prev.started_at = r.created_at;
        prev.events += 1;
        prev.had_error = prev.had_error || isErr;
        prev.had_conflict = prev.had_conflict || isConf;
        prev.total_ms += r.duration_ms ?? 0;
        if (!prev.reference_number && r.reference_number)
          prev.reference_number = r.reference_number;
      }
    }
    const list = Array.from(byCorr.values())
      .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
      .slice(0, data.limit);
    return { rows: list };
  });
