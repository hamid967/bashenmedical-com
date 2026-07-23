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
  error_code: z.string().trim().max(64).optional(),
  doctor_id: z.string().uuid().optional(),
  patient_name: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

/**
 * Extract a stable client-facing error_code from a trace row.
 * Priority: extras.error_code (explicitly logged) → derived from event/pg_code.
 */
function deriveErrorCode(
  event: string,
  pgCode: string | null | undefined,
  extra: unknown,
): string | null {
  if (extra && typeof extra === "object") {
    const raw = (extra as Record<string, unknown>).error_code;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  if (event.endsWith(".conflict")) return "SLOT_TAKEN";
  if (event.endsWith(".error")) {
    return pgCode ? `DB_ERROR:${pgCode}` : "DB_ERROR";
  }
  return null;
}

export const listBookingTraceEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => listFilters.parse(input))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // If filtering by patient name, first look up matching appointment_ids
    // and constrain the trace query to those. Empty match → no results.
    let appointmentIdsFilter: string[] | null = null;
    if (data.patient_name) {
      const { data: appts, error: apptErr } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .ilike("patient_name", `%${data.patient_name}%`)
        .limit(500);
      if (apptErr) throw new Error(apptErr.message);
      appointmentIdsFilter = (appts ?? []).map((a) => a.id);
      if (appointmentIdsFilter.length === 0) return { rows: [] };
    }

    let q = supabaseAdmin
      .from("booking_trace_events")
      .select(
        "id, correlation_id, event, idempotency_key_masked, reference_number, appointment_id, doctor_id, appointment_date, appointment_time, duration_ms, pg_code, extra, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.correlation_id) q = q.eq("correlation_id", data.correlation_id);
    if (data.reference) q = q.eq("reference_number", data.reference);
    if (data.doctor_id) q = q.eq("doctor_id", data.doctor_id);
    if (appointmentIdsFilter) q = q.in("appointment_id", appointmentIdsFilter);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let enriched = (rows ?? []).map((r) => ({
      ...r,
      error_code: deriveErrorCode(r.event, r.pg_code, r.extra),
    }));
    if (data.error_code) {
      const needle = data.error_code.toUpperCase();
      enriched = enriched.filter((r) =>
        (r.error_code ?? "").toUpperCase().includes(needle),
      );
    }
    return { rows: enriched };
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
    const { data: rows, error } = await supabaseAdmin
      .from("booking_trace_events")
      .select(
        "correlation_id, event, reference_number, created_at, pg_code, duration_ms, extra",
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
        last_error_code: string | null;
      }
    >();
    for (const r of (rows ?? []) as Row[]) {
      const key = r.correlation_id;
      const prev = byCorr.get(key);
      const isErr = (r.event ?? "").endsWith(".error");
      const isConf = (r.event ?? "").endsWith(".conflict");
      const code = deriveErrorCode(r.event, r.pg_code, r.extra);
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
          last_error_code: isErr || isConf ? code : null,
        });
      } else {
        prev.started_at = r.created_at;
        prev.events += 1;
        prev.had_error = prev.had_error || isErr;
        prev.had_conflict = prev.had_conflict || isConf;
        prev.total_ms += r.duration_ms ?? 0;
        if (!prev.reference_number && r.reference_number)
          prev.reference_number = r.reference_number;
        // Keep the newest error code we've seen (rows arrive newest→oldest).
        if (!prev.last_error_code && (isErr || isConf) && code)
          prev.last_error_code = code;
      }
    }
    const list = Array.from(byCorr.values())
      .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
      .slice(0, data.limit);
    return { rows: list };
  });

/**
 * Batch lookup: given a list of appointment IDs, return the correlation_id
 * (from the newest matching trace event) and any observed error_code for
 * that correlation. Used by /admin/appointments-queue to surface the trace
 * link per row so support can jump directly from a booking to its full
 * request timeline.
 */
export const listAppointmentTraces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        appointment_ids: z.array(z.string().uuid()).max(500).default([]),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    if (data.appointment_ids.length === 0) {
      return { traces: {} as Record<string, { correlation_id: string; error_code: string | null }> };
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    // Newest first — first row per appointment wins for correlation_id.
    // Then we scan any correlation's other events to surface an error code
    // even when the appointment eventually succeeded (retries after a
    // SLOT_TAKEN, etc.).
    const { data: rows, error } = await supabaseAdmin
      .from("booking_trace_events")
      .select("appointment_id, correlation_id, event, pg_code, extra, created_at")
      .in("appointment_id", data.appointment_ids)
      .order("created_at", { ascending: false })
      .limit(data.appointment_ids.length * 20);
    if (error) throw new Error(error.message);

    const apptToCorr = new Map<string, string>();
    for (const r of rows ?? []) {
      if (r.appointment_id && !apptToCorr.has(r.appointment_id)) {
        apptToCorr.set(r.appointment_id, r.correlation_id);
      }
    }

    // Second pass: pull all events for those correlations to detect errors.
    const corrIds = Array.from(new Set(apptToCorr.values()));
    const errorByCorr = new Map<string, string>();
    if (corrIds.length > 0) {
      const { data: corrRows } = await supabaseAdmin
        .from("booking_trace_events")
        .select("correlation_id, event, pg_code, extra")
        .in("correlation_id", corrIds)
        .or("event.like.%.error,event.like.%.conflict");
      for (const r of corrRows ?? []) {
        if (errorByCorr.has(r.correlation_id)) continue;
        const code = deriveErrorCode(r.event, r.pg_code, r.extra);
        if (code) errorByCorr.set(r.correlation_id, code);
      }
    }

    const traces: Record<string, { correlation_id: string; error_code: string | null }> = {};
    for (const [apptId, corr] of apptToCorr) {
      traces[apptId] = {
        correlation_id: corr,
        error_code: errorByCorr.get(corr) ?? null,
      };
    }
    return { traces };
  });
