/**
 * Public API — GET /api/public/book/month-availability
 *   ?year=YYYY&month=MM   (1-12)
 *   &doctor_id=UUID       (optional)
 *   &specialty_id=UUID    (optional — required when no doctor)
 *   &branch_id=UUID       (optional)
 *
 * Returns the set of dates in the requested month for which at least ONE
 * candidate doctor has an availability slot AND is not on all-day leave.
 * The `/book` calendar disables all other days so patients cannot pick a
 * date the doctor doesn't work.
 *
 * Response:
 *   { ok: true, dates: string[] }   // "YYYY-MM-DD"
 */
import { createFileRoute } from "@tanstack/react-router";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";
import { z } from "zod";
import {
  BookingErrorCode,
  BranchId,
  DoctorId,
  MonthField,
  SpecialtyId,
  YearField,
  firstZodErrorCode,
} from "@/lib/booking/query-schemas";

const QuerySchema = z
  .object({
    year: YearField,
    month: MonthField,
    doctor_id: DoctorId.nullish(),
    specialty_id: SpecialtyId.nullish(),
    branch_id: BranchId.nullish(),
  })
  .refine((v) => v.doctor_id || v.specialty_id, {
    message: BookingErrorCode.missing_scope,
  });

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
function riyadhTodayIso(): string {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}

export const Route = createFileRoute("/api/public/book/month-availability")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "reads" }); if (_rl) return _rl;
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse({
          year: url.searchParams.get("year"),
          month: url.searchParams.get("month"),
          doctor_id: url.searchParams.get("doctor_id") || undefined,
          specialty_id: url.searchParams.get("specialty_id") || undefined,
          branch_id: url.searchParams.get("branch_id") || undefined,
        });
        if (!parsed.success) {
          return json(400, { ok: false, error: firstZodErrorCode(parsed.error) });
        }
        const {
          year,
          month,
          doctor_id: doctorId,
          specialty_id: specialtyId,
          branch_id: branchId,
        } = parsed.data;

        const empty = { ok: true, dates: [] as string[] };

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1) Candidate doctors.
          let candidateDoctorIds: string[] = [];
          if (doctorId) {
            candidateDoctorIds = [doctorId];
          } else {
            let q = supabaseAdmin
              .from("doctors")
              .select("id")
              .eq("is_active", true)
              .eq("specialty_id", specialtyId!);
            if (branchId) q = q.eq("branch_id", branchId);
            const { data: docs, error } = await q;
            if (error) return json(200, empty);
            candidateDoctorIds = (docs ?? []).map((d) => d.id as string);
          }
          if (candidateDoctorIds.length === 0) return json(200, empty);

          // 2) Working weekdays per candidate doctor.
          let availQ = supabaseAdmin
            .from("availability")
            .select("doctor_id,weekday")
            .in("doctor_id", candidateDoctorIds);
          if (branchId) availQ = availQ.eq("branch_id", branchId);
          const { data: avail } = await availQ;
          const workingWeekdaysByDoctor = new Map<string, Set<number>>();
          for (const row of avail ?? []) {
            const id = String(row.doctor_id);
            if (!workingWeekdaysByDoctor.has(id)) workingWeekdaysByDoctor.set(id, new Set());
            workingWeekdaysByDoctor.get(id)!.add(Number(row.weekday));
          }
          if (workingWeekdaysByDoctor.size === 0) return json(200, empty);

          // 3) All-day leaves overlapping the month.
          const monthStartIso = `${year}-${pad2(month)}-01`;
          const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
          const monthEndIso = `${year}-${pad2(month)}-${pad2(daysInMonth)}`;
          const { data: leaves } = await supabaseAdmin
            .from("doctor_leaves")
            .select("doctor_id,start_date,end_date,all_day")
            .in("doctor_id", candidateDoctorIds)
            .lte("start_date", monthEndIso)
            .gte("end_date", monthStartIso);

          // 4) For each date, check if any candidate is working (weekday match)
          //    and not on all-day leave that day.
          const today = riyadhTodayIso();
          const dates: string[] = [];
          for (let day = 1; day <= daysInMonth; day++) {
            const iso = `${year}-${pad2(month)}-${pad2(day)}`;
            if (iso < today) continue; // never offer past dates
            const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
            let anyAvailable = false;
            for (const [docId, weekdays] of workingWeekdaysByDoctor) {
              if (!weekdays.has(weekday)) continue;
              const onLeave = (leaves ?? []).some(
                (l) =>
                  l.all_day &&
                  String(l.doctor_id) === docId &&
                  String(l.start_date) <= iso &&
                  String(l.end_date) >= iso,
              );
              if (!onLeave) {
                anyAvailable = true;
                break;
              }
            }
            if (anyAvailable) dates.push(iso);
          }

          return json(200, { ok: true, dates });
        } catch {
          return json(200, empty);
        }
      },
    },
  },
});
