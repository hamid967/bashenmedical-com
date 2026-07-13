/**
 * Doctor self-service scheduling — server functions used by the doctor's own
 * portal panel at /portal/schedule.
 *
 * Every mutation is scoped to the *signed-in doctor* via the security-definer
 * helper `public.get_my_doctor_id()`. RLS also enforces the same scope, so
 * these functions cannot touch another doctor's rows even if abused.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireMyDoctorId(sb: any): Promise<string> {
  const { data, error } = await sb.rpc("get_my_doctor_id");
  if (error) throw new Error(error.message);
  const id = data as string | null;
  if (!id) {
    throw new Error(
      "حسابك غير مرتبط بسجل طبيب. يرجى التواصل مع الإدارة لربط حسابك.",
    );
  }
  return id;
}

/* ------------------------------- me / summary ------------------------------ */

export const getMyDoctorSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: doctorId } = await supabase.rpc("get_my_doctor_id");
    if (!doctorId) return { linked: false as const };

    const [doctorRes, availRes, slotsRes, apptRes, leavesRes] = await Promise.all([
      supabase
        .from("doctors")
        .select("id, name_ar, name_en, title_ar, title_en, photo_url, branch_id, specialty_id, booking_enabled, is_active")
        .eq("id", doctorId as string)
        .maybeSingle(),
      supabase
        .from("availability")
        .select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId as string),
      supabase
        .from("availability_slots")
        .select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId as string)
        .eq("status", "available")
        .gte("slot_date", new Date().toISOString().slice(0, 10)),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId as string)
        .in("status", ["new", "confirmed"])
        .gte("appointment_date", new Date().toISOString().slice(0, 10)),
      supabase
        .from("doctor_leaves")
        .select("id", { count: "exact", head: true })
        .eq("doctor_id", doctorId as string)
        .gte("end_date", new Date().toISOString().slice(0, 10)),
    ]);

    return {
      linked: true as const,
      doctor: doctorRes.data,
      counts: {
        weeklySlots: availRes.count ?? 0,
        availableSlots: slotsRes.count ?? 0,
        upcomingAppointments: apptRes.count ?? 0,
        activeLeaves: leavesRes.count ?? 0,
      },
    };
  });

/* --------------------------- weekly availability --------------------------- */

const HHMM = /^\d{2}:\d{2}$/;

export const listMyAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    const { data, error } = await context.supabase
      .from("availability")
      .select("id, doctor_id, branch_id, weekday, start_time, end_time, slot_minutes")
      .eq("doctor_id", doctorId)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        startTime: z.string().regex(HHMM),
        endTime: z.string().regex(HHMM),
        slotMinutes: z.number().int().min(5).max(240).default(30),
        branchId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    if (data.endTime <= data.startTime)
      throw new Error("نهاية الفترة يجب أن تكون بعد بدايتها.");

    const { data: existing, error: fetchErr } = await context.supabase
      .from("availability")
      .select("start_time, end_time")
      .eq("doctor_id", doctorId)
      .eq("weekday", data.weekday);
    if (fetchErr) throw new Error(fetchErr.message);

    const s = data.startTime;
    const e = data.endTime;
    const overlap = (existing ?? []).some((row) => {
      const rs = String(row.start_time).slice(0, 5);
      const re = String(row.end_time).slice(0, 5);
      return s < re && e > rs;
    });
    if (overlap) throw new Error("هذه الفترة متداخلة مع فترة أخرى في نفس اليوم.");

    const { error } = await context.supabase.from("availability").insert({
      doctor_id: doctorId,
      weekday: data.weekday,
      start_time: `${data.startTime}:00`,
      end_time: `${data.endTime}:00`,
      slot_minutes: data.slotMinutes,
      branch_id: data.branchId ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMyDoctorId(context.supabase);
    const { error } = await context.supabase
      .from("availability")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------------- leaves ---------------------------------- */

export const listMyLeaves = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    const { data, error } = await context.supabase
      .from("doctor_leaves")
      .select("id, doctor_id, branch_id, start_date, end_date, all_day, reason, created_at")
      .eq("doctor_id", doctorId)
      .order("start_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        allDay: z.boolean().default(true),
        reason: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    if (data.endDate < data.startDate)
      throw new Error("تاريخ الانتهاء قبل تاريخ البداية.");

    // Fetch doctor's branch (leaves may be linked to a branch)
    const { data: doc } = await context.supabase
      .from("doctors")
      .select("branch_id")
      .eq("id", doctorId)
      .maybeSingle();

    const { error } = await context.supabase.from("doctor_leaves").insert({
      doctor_id: doctorId,
      start_date: data.startDate,
      end_date: data.endDate,
      all_day: data.allDay,
      reason: data.reason ?? null,
      branch_id: doc?.branch_id ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMyDoctorId(context.supabase);
    const { error } = await context.supabase
      .from("doctor_leaves")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- generated time slots -------------------------- */

export const listMySlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    const { data: rows, error } = await context.supabase
      .from("availability_slots")
      .select("id, slot_date, start_time, end_time, status, appointment_id")
      .eq("doctor_id", doctorId)
      .gte("slot_date", data.fromDate)
      .lte("slot_date", data.toDate)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const generateMySlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(HHMM),
        endTime: z.string().regex(HHMM),
        durationMinutes: z.number().int().min(5).max(240).default(30),
        breakMinutes: z.number().int().min(0).max(120).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);

    const toMin = (h: string) => {
      const [a, b] = h.split(":").map(Number);
      return a * 60 + b;
    };
    const toHMS = (m: number) =>
      `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}:00`;

    const start = toMin(data.startTime);
    const end = toMin(data.endTime);
    if (end <= start) throw new Error("وقت النهاية يجب أن يكون بعد البداية.");

    const step = data.durationMinutes + data.breakMinutes;
    const candidates: Array<{ start_min: number; end_min: number; row: {
      doctor_id: string; branch_id: string | null; slot_date: string;
      start_time: string; end_time: string; status: "available";
    } }> = [];

    // Read doctor's branch to tag the slots consistently
    const { data: doc } = await context.supabase
      .from("doctors")
      .select("branch_id")
      .eq("id", doctorId)
      .maybeSingle();

    for (let t = start; t + data.durationMinutes <= end; t += step) {
      candidates.push({
        start_min: t,
        end_min: t + data.durationMinutes,
        row: {
          doctor_id: doctorId,
          branch_id: doc?.branch_id ?? null,
          slot_date: data.date,
          start_time: toHMS(t),
          end_time: toHMS(t + data.durationMinutes),
          status: "available",
        },
      });
    }
    if (candidates.length === 0) throw new Error("لا توجد فترات ضمن هذا النطاق.");

    const { data: existing, error: fetchErr } = await context.supabase
      .from("availability_slots")
      .select("start_time, end_time, status")
      .eq("doctor_id", doctorId)
      .eq("slot_date", data.date);
    if (fetchErr) throw new Error(fetchErr.message);

    const ranges = (existing ?? []).map((r) => ({
      start: toMin(String(r.start_time).slice(0, 5)),
      end: toMin(String(r.end_time).slice(0, 5)),
    }));

    const rows: typeof candidates[number]["row"][] = [];
    let skipped = 0;
    for (const c of candidates) {
      const clash = ranges.some((r) => c.start_min < r.end && c.end_min > r.start);
      if (clash) skipped++;
      else rows.push(c.row);
    }

    if (rows.length === 0) return { created: 0, skipped, requested: candidates.length };

    const { data: inserted, error } = await context.supabase
      .from("availability_slots")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return {
      created: inserted?.length ?? 0,
      skipped,
      requested: candidates.length,
    };
  });

export const deleteMySlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMyDoctorId(context.supabase);
    // Guard: can't delete a booked slot
    const { data: row, error: rowErr } = await context.supabase
      .from("availability_slots")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    if (row?.status === "booked")
      throw new Error("لا يمكن حذف فترة محجوزة. ألغِ الحجز أولاً.");
    const { error } = await context.supabase
      .from("availability_slots")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------- upcoming appointments ------------------------ */

export const listMyUpcomingAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("appointments")
      .select("id, appointment_date, appointment_time, status, reason, patient_name, patient_phone")
      .eq("doctor_id", doctorId)
      .gte("appointment_date", today)
      .in("status", ["new", "confirmed"])
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* --------------------- calendar view (month/day range) --------------------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const listMyCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ fromDate: z.string().regex(DATE_RE), toDate: z.string().regex(DATE_RE) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    const [apptRes, slotRes, leaveRes] = await Promise.all([
      context.supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, status, reason, patient_name, patient_phone, notes")
        .eq("doctor_id", doctorId)
        .gte("appointment_date", data.fromDate)
        .lte("appointment_date", data.toDate)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true })
        .limit(1000),
      context.supabase
        .from("availability_slots")
        .select("id, slot_date, start_time, end_time, status, appointment_id")
        .eq("doctor_id", doctorId)
        .gte("slot_date", data.fromDate)
        .lte("slot_date", data.toDate)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(2000),
      context.supabase
        .from("doctor_leaves")
        .select("id, start_date, end_date, all_day, reason")
        .eq("doctor_id", doctorId)
        .lte("start_date", data.toDate)
        .gte("end_date", data.fromDate)
        .limit(200),
    ]);
    if (apptRes.error) throw new Error(apptRes.error.message);
    if (slotRes.error) throw new Error(slotRes.error.message);
    if (leaveRes.error) throw new Error(leaveRes.error.message);
    return {
      appointments: apptRes.data ?? [],
      slots: slotRes.data ?? [],
      leaves: leaveRes.data ?? [],
    };
  });

export const updateMyAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "confirmed", "completed", "cancelled", "no_show"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    const patch: { status: typeof data.status; cancelled_at?: string | null } = { status: data.status };
    if (data.status === "cancelled") patch.cancelled_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("appointments")
      .update(patch)
      .eq("id", data.id)
      .eq("doctor_id", doctorId);
    if (error) throw new Error(error.message);
    // Free the linked slot if the appointment is cancelled/no_show
    if (data.status === "cancelled" || data.status === "no_show") {
      await context.supabase
        .from("availability_slots")
        .update({ status: "available", appointment_id: null })
        .eq("appointment_id", data.id)
        .eq("doctor_id", doctorId);
    }
    return { ok: true };
  });

export const rescheduleMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      date: z.string().regex(DATE_RE),
      time: z.string().regex(HHMM),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    // Free any previously linked slot
    await context.supabase
      .from("availability_slots")
      .update({ status: "available", appointment_id: null })
      .eq("appointment_id", data.id)
      .eq("doctor_id", doctorId);
    // Try to book an available slot at the new time (if one exists)
    const { data: match } = await context.supabase
      .from("availability_slots")
      .select("id, status")
      .eq("doctor_id", doctorId)
      .eq("slot_date", data.date)
      .eq("start_time", `${data.time}:00`)
      .maybeSingle();
    if (match && match.status !== "available") {
      throw new Error("هذه الفترة غير متاحة. اختر وقتاً آخر.");
    }
    const { error } = await context.supabase
      .from("appointments")
      .update({
        appointment_date: data.date,
        appointment_time: `${data.time}:00`,
        status: "confirmed",
      })
      .eq("id", data.id)
      .eq("doctor_id", doctorId);
    if (error) throw new Error(error.message);
    if (match) {
      await context.supabase
        .from("availability_slots")
        .update({ status: "booked", appointment_id: data.id })
        .eq("id", match.id);
    }
    return { ok: true };
  });

export const setMySlotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["available", "blocked"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const doctorId = await requireMyDoctorId(context.supabase);
    const { data: row } = await context.supabase
      .from("availability_slots")
      .select("status")
      .eq("id", data.id)
      .eq("doctor_id", doctorId)
      .maybeSingle();
    if (!row) throw new Error("لم يتم العثور على الفترة.");
    if (row.status === "booked") throw new Error("لا يمكن تعديل فترة محجوزة.");
    const { error } = await context.supabase
      .from("availability_slots")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("doctor_id", doctorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
