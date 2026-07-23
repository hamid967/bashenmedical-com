/**
 * Public API — GET /api/public/book/availability
 *   ?date=YYYY-MM-DD
 *   &doctor_id=UUID            (optional)
 *   &specialty_id=UUID         (optional — used when no doctor is chosen)
 *   &branch_id=UUID            (optional — narrows availability to a clinic)
 *
 * Authoritative slot resolver used by /book to render the time picker. The
 * server owns the rules so a single change ripples across the UI, admin
 * flows, and any future integrations:
 *
 *   1. Load `availability` rows for the target weekday, filtered by
 *      doctor / specialty / branch as provided.
 *   2. Expand every row into HH:MM slots using its `slot_minutes` step.
 *   3. Subtract slots where the doctor is on leave for that date
 *      (`doctor_leaves`, all-day only — partial-day leaves currently drop
 *      the whole day for simplicity).
 *   4. Subtract slots earlier than "now + 30min" when the date is today
 *      (never surface a slot the patient physically cannot make).
 *   5. Compute per-slot capacity across the matching doctor pool; a slot
 *      is `booked` (unavailable) only when every candidate doctor is taken.
 *      For a single-doctor request this collapses to the classic "already
 *      taken" check the client used to do on its own.
 *
 * Response:
 *   { ok: true,
 *     times:  string[]   // bookable "HH:MM" (sorted)
 *     booked: string[]   // fully-booked "HH:MM" (subset of "generated" — kept
 *                        //  separate so the UI can grey them out instead of
 *                        //  hiding them entirely when helpful)
 *     doctors_considered: number
 *   }
 *
 * Uses the admin client so the public /book UI can see availability and
 * bookings that RLS would otherwise hide from anon; no PII is returned.
 */
import { createFileRoute } from "@tanstack/react-router";
// Riyadh-local "today"/"now" helpers shared with cancel.ts and slots.functions.ts
// so the day boundary is identical across resolver, cancel API, and portal cancel.
import { riyadhTodayIso, riyadhNowMinutes } from "@/lib/riyadh-date";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";
import { z } from "zod";
import {
  BookingErrorCode,
  BranchId,
  DoctorId,
  IsoDate,
  SessionId,
  SpecialtyId,
  firstZodErrorCode,
} from "@/lib/booking/query-schemas";

const QuerySchema = z
  .object({
    date: IsoDate,
    doctor_id: DoctorId.nullish(),
    specialty_id: SpecialtyId.nullish(),
    branch_id: BranchId.nullish(),
    session: SessionId.nullish(),
  })
  .refine((v) => v.doctor_id || v.specialty_id, {
    message: BookingErrorCode.missing_scope,
  });

function json(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Short shared cache + stale-while-revalidate: edge/CDN can serve the
      // cached body for 30s, and keep serving it (up to 60s more) while a
      // background request refreshes it. The client also caches per-key
      // (see React Query staleTime in /book).
      "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
      ...extraHeaders,
    },
  });
}

// Best-effort per-isolate memo. Workers run stateless per request, but the
// same isolate is reused across requests for a while — this collapses
// duplicate lookups (same date+scope) into a single DB round-trip within
// the TTL window. Safe: only public availability data, no PII.
const MEMO_TTL_MS = 20_000;
const memo = new Map<string, { at: number; body: Record<string, unknown> }>();
function memoGet(key: string) {
  const hit = memo.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MEMO_TTL_MS) {
    memo.delete(key);
    return null;
  }
  return hit.body;
}
function memoSet(key: string, body: Record<string, unknown>) {
  // Prevent unbounded growth in long-lived isolates.
  if (memo.size > 500) memo.clear();
  memo.set(key, { at: Date.now(), body });
}


function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function hhmm(mins: number) {
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}
function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

/**
 * Weekday index for a `YYYY-MM-DD` string that matches what Postgres /
 * JS `Date` return (0 = Sunday). Using UTC construction avoids the
 * Worker-runtime "local timezone might be UTC" surprise where DST rounds
 * a midnight date backward one day.
 */
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const Route = createFileRoute("/api/public/book/availability")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "reads" }); if (_rl) return _rl;
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse({
          date: url.searchParams.get("date"),
          doctor_id: url.searchParams.get("doctor_id") || undefined,
          specialty_id: url.searchParams.get("specialty_id") || undefined,
          branch_id: url.searchParams.get("branch_id") || undefined,
          session: url.searchParams.get("session") || undefined,
        });
        if (!parsed.success) {
          return json(400, { ok: false, error: firstZodErrorCode(parsed.error) });
        }
        const {
          date,
          doctor_id: doctorId,
          specialty_id: specialtyId,
          branch_id: branchId,
        } = parsed.data;

        // Cache key includes every parameter that changes the result. `date`
        // is bucketed only per full day (safe) but same-day results include
        // an implicit "now" cutoff — we keep the TTL tight (20s) so that
        // cutoff can only drift by ~one slot's fraction at worst.
        const sessionParam = url.searchParams.get("session") ?? "";
        const cacheKey = `${date}|${doctorId ?? ""}|${specialtyId ?? ""}|${branchId ?? ""}|${sessionParam}`;
        const cached = memoGet(cacheKey);
        if (cached) {
          const etag = `W/"${cacheKey}:${(cached as { _v?: number })._v ?? 0}"`;
          if (request.headers.get("if-none-match") === etag) {
            return new Response(null, {
              status: 304,
              headers: {
                ETag: etag,
                "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
              },
            });
          }
          return json(200, cached, { ETag: etag });
        }

        const empty = { ok: true, times: [], booked: [], doctors_considered: 0 };

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1) Resolve candidate doctors. A specific doctor short-circuits;
          //    otherwise pull all active doctors in the specialty (+ branch).
          let candidateDoctorIds: string[] = [];
          if (doctorId) {
            candidateDoctorIds = [doctorId];
          } else {
            let q = supabaseAdmin
              .from("doctors")
              .select("id,is_active,branch_id,specialty_id")
              .eq("is_active", true)
              .eq("specialty_id", specialtyId!);
            if (branchId) q = q.eq("branch_id", branchId);
            const { data: docs, error } = await q;
            if (error) return json(200, empty);
            candidateDoctorIds = (docs ?? []).map((d) => d.id as string);
          }
          if (candidateDoctorIds.length === 0) {
            return json(200, empty);
          }

          const weekday = weekdayOf(date);

          // 2) Availability rows for those doctors on this weekday.
          let availQ = supabaseAdmin
            .from("availability")
            .select("doctor_id,weekday,start_time,end_time,slot_minutes,branch_id")
            .in("doctor_id", candidateDoctorIds)
            .eq("weekday", weekday);
          if (branchId) availQ = availQ.eq("branch_id", branchId);
          const { data: availability, error: availErr } = await availQ;
          if (availErr) return json(200, empty);

          // 3) All-day leaves that cover this date for any candidate.
          const { data: leaves } = await supabaseAdmin
            .from("doctor_leaves")
            .select("doctor_id,start_date,end_date,all_day")
            .in("doctor_id", candidateDoctorIds)
            .lte("start_date", date)
            .gte("end_date", date);
          const doctorsOnLeave = new Set(
            (leaves ?? []).filter((l) => l.all_day).map((l) => l.doctor_id as string),
          );

          // 4) Existing appointments for those doctors on this date (any
          //    non-terminal status counts as occupied).
          const { data: appts } = await supabaseAdmin
            .from("appointments")
            .select("doctor_id,appointment_time,status")
            .in("doctor_id", candidateDoctorIds)
            .eq("appointment_date", date);
          const busyByDoctor = new Map<string, Set<string>>();
          for (const a of appts ?? []) {
            if (a.status === "cancelled" || a.status === "no_show") continue;
            const key = String(a.doctor_id);
            const t = String(a.appointment_time).slice(0, 5);
            if (!busyByDoctor.has(key)) busyByDoctor.set(key, new Set());
            busyByDoctor.get(key)!.add(t);
          }

          // 4b) Active (unexpired) slot holds count as busy too, so a second
          //     visitor can't pick the exact slot someone is actively booking.
          //     The hold owner still sees it as free — the wizard identifies
          //     itself via the `session` query param, and we skip that
          //     session's own holds here.
          const sessionId = sessionParam;
          const nowIso = new Date().toISOString();
          const { data: holds } = await supabaseAdmin
            .from("slot_holds")
            .select("doctor_id,appointment_time,session_id")
            .in("doctor_id", candidateDoctorIds)
            .eq("appointment_date", date)
            .is("released_at", null)
            .gt("expires_at", nowIso);
          for (const h of holds ?? []) {
            if (sessionId && h.session_id === sessionId) continue;
            const key = String(h.doctor_id);
            const t = String(h.appointment_time).slice(0, 5);
            if (!busyByDoctor.has(key)) busyByDoctor.set(key, new Set());
            busyByDoctor.get(key)!.add(t);
          }

          // 5) Expand availability into per-doctor slot sets and aggregate.
          //    We track two things per slot: how many doctors CAN work it,
          //    and how many of those are free right now. A slot is offered
          //    to the UI when generated, and marked "booked" only when all
          //    who could work it are busy or on leave.
          const generatedBy = new Map<string, Set<string>>(); // slot -> doctor set
          for (const row of availability ?? []) {
            const start = parseHHMM(String(row.start_time));
            const end = parseHHMM(String(row.end_time));
            const step = Number(row.slot_minutes) || 30;
            for (let m = start; m + step <= end; m += step) {
              const slot = hhmm(m);
              if (!generatedBy.has(slot)) generatedBy.set(slot, new Set());
              generatedBy.get(slot)!.add(String(row.doctor_id));
            }
          }

          // Same-day: hide slots earlier than "now + 30 min" (Asia/Riyadh).
          const isToday = date === riyadhTodayIso();
          const cutoff = isToday ? riyadhNowMinutes() + 30 : -1;

          const times: string[] = [];
          const booked: string[] = [];
          for (const [slot, doctorSet] of Array.from(generatedBy.entries()).sort()) {
            if (parseHHMM(slot) < cutoff) continue;
            const freeDoctors = Array.from(doctorSet).filter(
              (id) => !doctorsOnLeave.has(id) && !busyByDoctor.get(id)?.has(slot),
            );
            if (freeDoctors.length > 0) {
              times.push(slot);
            } else {
              // Every doctor who could work this slot is unavailable.
              booked.push(slot);
            }
          }

          const body = {
            ok: true,
            times,
            booked,
            doctors_considered: candidateDoctorIds.length,
            // `_v` is a compact fingerprint used only to build the ETag;
            // small counters are enough to distinguish results across the
            // cache window without hashing the whole payload.
            _v: times.length * 1000 + booked.length,
          };
          memoSet(cacheKey, body);
          const etag = `W/"${cacheKey}:${body._v}"`;
          if (request.headers.get("if-none-match") === etag) {
            return new Response(null, {
              status: 304,
              headers: {
                ETag: etag,
                "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
              },
            });
          }
          return json(200, body, { ETag: etag });
        } catch {
          return json(200, empty);
        }
      },
    },
  },
});
