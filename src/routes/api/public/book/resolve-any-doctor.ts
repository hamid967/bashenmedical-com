/**
 * Public API — GET /api/public/book/resolve-any-doctor
 *   ?date=YYYY-MM-DD
 *   &time=HH:MM
 *   &specialty_id=UUID   (required)
 *   &branch_id=UUID      (optional)
 *   &session=STRING      (optional — wizard session id, so the caller's own
 *                        active slot holds don't block themselves)
 *
 * Used by /book's "Any available doctor" option: given the patient's
 * specialty/branch/date/time, pick a concrete doctor who can actually take
 * that slot. Mirrors the availability resolver rules (leave, appointments,
 * active holds) so the choice is consistent with what the UI shows.
 *
 * Response:
 *   { ok: true, doctor: { id, name_ar, name_en } }
 *   { ok: false, error: "no_available_doctor" | "invalid_*" | "missing_scope" }
 */
import { createFileRoute } from "@tanstack/react-router";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";
import { z } from "zod";

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "invalid_time"),
  specialty_id: z.string().uuid("missing_scope"),
  branch_id: z.string().uuid("invalid_branch_id").nullish(),
  session: z.string().max(128).nullish(),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m ?? 0);
}
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const Route = createFileRoute("/api/public/book/resolve-any-doctor")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "reads" });
        if (_rl) return _rl;

        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse({
          date: url.searchParams.get("date"),
          time: url.searchParams.get("time"),
          specialty_id: url.searchParams.get("specialty_id"),
          branch_id: url.searchParams.get("branch_id") || undefined,
          session: url.searchParams.get("session") || undefined,
        });
        if (!parsed.success) {
          return json(400, {
            ok: false,
            error: parsed.error.issues[0]?.message ?? "invalid_query",
          });
        }
        const {
          date,
          time,
          specialty_id: specialtyId,
          branch_id: branchId,
          session: sessionId,
        } = parsed.data;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1) Candidate doctors: active, in specialty (+ branch if given).
          let dq = supabaseAdmin
            .from("doctors")
            .select("id,name_ar,name_en,is_active,branch_id,specialty_id,booking_enabled")
            .eq("is_active", true)
            .eq("specialty_id", specialtyId);
          if (branchId) dq = dq.eq("branch_id", branchId);
          const { data: doctors, error: dErr } = await dq;
          if (dErr || !doctors || doctors.length === 0)
            return json(200, { ok: false, error: "no_available_doctor" });

          const candidates = doctors.filter(
            (d) => (d as { booking_enabled?: boolean }).booking_enabled !== false,
          );
          if (candidates.length === 0)
            return json(200, { ok: false, error: "no_available_doctor" });
          const candidateIds = candidates.map((d) => d.id as string);

          const weekday = weekdayOf(date);
          const timeMin = parseHHMM(time);

          // 2) Which candidates have an availability row covering this slot.
          let availQ = supabaseAdmin
            .from("availability")
            .select("doctor_id,start_time,end_time,slot_minutes,branch_id")
            .in("doctor_id", candidateIds)
            .eq("weekday", weekday);
          if (branchId) availQ = availQ.eq("branch_id", branchId);
          const { data: availability } = await availQ;

          const canWorkSlot = new Set<string>();
          for (const row of availability ?? []) {
            const s = parseHHMM(String(row.start_time));
            const e = parseHHMM(String(row.end_time));
            const step = Number(row.slot_minutes) || 30;
            if (timeMin < s || timeMin + step > e) continue;
            // Must land exactly on the slot grid.
            if ((timeMin - s) % step !== 0) continue;
            canWorkSlot.add(String(row.doctor_id));
          }
          if (canWorkSlot.size === 0)
            return json(200, { ok: false, error: "no_available_doctor" });

          // 3) Exclude doctors on all-day leave for the date.
          const { data: leaves } = await supabaseAdmin
            .from("doctor_leaves")
            .select("doctor_id,all_day")
            .in("doctor_id", Array.from(canWorkSlot))
            .lte("start_date", date)
            .gte("end_date", date);
          const onLeave = new Set(
            (leaves ?? []).filter((l) => l.all_day).map((l) => String(l.doctor_id)),
          );

          // 4) Exclude doctors already booked at that exact time.
          const { data: appts } = await supabaseAdmin
            .from("appointments")
            .select("doctor_id,appointment_time,status")
            .in("doctor_id", Array.from(canWorkSlot))
            .eq("appointment_date", date);
          const busy = new Set<string>();
          for (const a of appts ?? []) {
            if (a.status === "cancelled" || a.status === "no_show") continue;
            if (String(a.appointment_time).slice(0, 5) === time) busy.add(String(a.doctor_id));
          }

          // 5) Exclude doctors with active foreign slot holds on that slot.
          const nowIso = new Date().toISOString();
          const { data: holds } = await supabaseAdmin
            .from("slot_holds")
            .select("doctor_id,appointment_time,session_id")
            .in("doctor_id", Array.from(canWorkSlot))
            .eq("appointment_date", date)
            .is("released_at", null)
            .gt("expires_at", nowIso);
          for (const h of holds ?? []) {
            if (sessionId && h.session_id === sessionId) continue;
            if (String(h.appointment_time).slice(0, 5) === time) busy.add(String(h.doctor_id));
          }

          // 6) Rank free candidates: prefer those with the fewest bookings
          //    already on the same date (light load-balancing so "any" isn't
          //    biased toward the first UUID alphabetically).
          const loadByDoctor = new Map<string, number>();
          for (const a of appts ?? []) {
            if (a.status === "cancelled" || a.status === "no_show") continue;
            const id = String(a.doctor_id);
            loadByDoctor.set(id, (loadByDoctor.get(id) ?? 0) + 1);
          }
          const free = candidates.filter(
            (d) => canWorkSlot.has(d.id as string) && !onLeave.has(d.id as string) && !busy.has(d.id as string),
          );
          if (free.length === 0) return json(200, { ok: false, error: "no_available_doctor" });
          free.sort(
            (a, b) => (loadByDoctor.get(a.id as string) ?? 0) - (loadByDoctor.get(b.id as string) ?? 0),
          );
          const pick = free[0];
          return json(200, {
            ok: true,
            doctor: {
              id: pick.id,
              name_ar: (pick as { name_ar?: string }).name_ar ?? "",
              name_en: (pick as { name_en?: string }).name_en ?? "",
            },
          });
        } catch {
          return json(200, { ok: false, error: "no_available_doctor" });
        }
      },
    },
  },
});
