import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { riyadhTodayIso } from "@/lib/riyadh-date";

/**
 * M2 — Atomic booking engine.
 * - listAvailableSlots: public read (available slots for a doctor/date range).
 * - bookSlot: public RPC call, atomically reserves the slot + creates appointment.
 * - releaseSlot: staff only, reopens a slot when an appointment is cancelled.
 * - generateSlots: staff only, bulk-creates slots for a doctor on a given day.
 */

function serverPublicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Public: list available slots
// ---------------------------------------------------------------------------
const listSchema = z.object({
  doctorId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  branchId: z.string().uuid().optional().nullable(),
});

export const listAvailableSlots = createServerFn({ method: "GET" })
  .validator((raw: unknown) => listSchema.parse(raw))
  .handler(async ({ data }) => {
    const sb = serverPublicClient();
    let q = sb
      .from("availability_slots")
      .select("id, doctor_id, branch_id, slot_date, start_time, end_time, status")
      .eq("doctor_id", data.doctorId)
      .eq("status", "available")
      .gte("slot_date", data.fromDate)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(500);

    if (data.toDate) q = q.lte("slot_date", data.toDate);
    else q = q.lte("slot_date", data.fromDate);
    if (data.branchId) q = q.eq("branch_id", data.branchId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { slots: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// Public: book a slot (atomic via RPC)
// ---------------------------------------------------------------------------
const bookSchema = z.object({
  slotId: z.string().uuid(),
  patientName: z.string().trim().min(2).max(120),
  patientPhone: z.string().trim().min(6).max(32),
  patientEmail: z.string().email().max(200).optional().nullable(),
  nationalId: z.string().trim().max(32).optional().nullable(),
  gender: z.enum(["male", "female"]).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  patientId: z.string().uuid().optional().nullable(),
});

const RPC_ERROR_MAP: Record<string, string> = {
  slot_required: "لم يتم تحديد الفترة.",
  patient_name_required: "اسم المريض مطلوب.",
  patient_phone_required: "رقم الجوال مطلوب.",
  slot_not_found: "لم يتم العثور على هذه الفترة.",
  slot_unavailable: "هذه الفترة لم تعد متاحة، الرجاء اختيار فترة أخرى.",
  slot_in_past: "لا يمكن الحجز في وقت مضى.",
};

function friendlyRpcError(msg: string | undefined): string {
  if (!msg) return "تعذّر إتمام الحجز.";
  for (const key of Object.keys(RPC_ERROR_MAP)) {
    if (msg.includes(key)) return RPC_ERROR_MAP[key];
  }
  return "تعذّر إتمام الحجز. حاول مرة أخرى.";
}

export const bookSlot = createServerFn({ method: "POST" })
  .validator((raw: unknown) => bookSchema.parse(raw))
  .handler(async ({ data }) => {
    const sb = serverPublicClient();
    const { data: apptId, error } = await sb.rpc("book_slot", {
      p_slot_id: data.slotId,
      p_patient_name: data.patientName,
      p_patient_phone: data.patientPhone,
      p_patient_email: data.patientEmail ?? undefined,
      p_national_id: data.nationalId ?? undefined,
      p_gender: data.gender ?? undefined,
      p_reason: data.reason ?? undefined,
      p_notes: data.notes ?? undefined,
      p_patient_id: data.patientId ?? undefined,
    });
    if (error) throw new Error(friendlyRpcError(error.message));
    return { appointmentId: apptId as unknown as string };
  });

/**
 * Authenticated booking wrapper — for portal users booking either for
 * themselves or on behalf of a verified dependent. Prevents booking for
 * the wrong person by validating guardian ownership + verification +
 * `booking` access scope via `can_book_for_dependent` before delegating
 * to the atomic `book_slot` RPC. Persists `booked_for_dependent_id` on
 * the appointment for audit.
 */
const bookAsGuardianSchema = bookSchema.extend({
  dependentId: z.string().uuid().optional().nullable(),
});

export const bookSlotAsGuardian = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => bookAsGuardianSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.dependentId) {
      const { data: allowed, error: guardErr } = await supabase.rpc(
        "can_book_for_dependent" as any,
        { _guardian: userId, _dependent: data.dependentId } as any,
      );
      if (guardErr) throw new Error("تعذّر التحقق من صلاحية الحجز نيابةً.");
      if (allowed !== true) {
        throw new Error(
          "لا يمكن الحجز نيابةً عن هذا التابع: تأكّد من توثيق العلاقة ومن تفعيل صلاحية الحجز.",
        );
      }
    }

    // Book via the authenticated client — RPC is SECURITY DEFINER so the
    // slot lock still runs with elevated rights.
    const { data: apptId, error } = await supabase.rpc("book_slot", {
      p_slot_id: data.slotId,
      p_patient_name: data.patientName,
      p_patient_phone: data.patientPhone,
      p_patient_email: data.patientEmail ?? undefined,
      p_national_id: data.nationalId ?? undefined,
      p_gender: data.gender ?? undefined,
      p_reason: data.reason ?? undefined,
      p_notes: data.notes ?? undefined,
      p_patient_id: data.patientId ?? undefined,
    });
    if (error) throw new Error(friendlyRpcError(error.message));
    const appointmentId = apptId as unknown as string;

    // Persist the true beneficiary + guardian link on the appointment.
    if (data.dependentId && appointmentId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("appointments")
        .update({ booked_for_dependent_id: data.dependentId } as any)
        .eq("id", appointmentId);
    }

    return { appointmentId };
  });

// ---------------------------------------------------------------------------
// Staff: release a slot (cancel/reschedule)
// ---------------------------------------------------------------------------
export const releaseSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ appointmentId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: released, error } = await context.supabase.rpc("release_slot", {
      p_appointment_id: data.appointmentId,
    });
    if (error) throw new Error(error.message);
    return { released: !!released };
  });

// ---------------------------------------------------------------------------
// Patient: cancel my own appointment (authenticated portal user)
// ---------------------------------------------------------------------------
const cancelSchema = z.object({
  appointmentId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const cancelMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => cancelSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;

    // 1) Read the appointment via RLS-scoped client. If policy hides it,
    //    result is null and we return a generic "not found / not yours".
    const { data: appt, error: readErr } = await sb
      .from("appointments")
      .select("id, status, appointment_date, appointment_time, patient_phone")
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (readErr) throw new Error("تعذّر قراءة بيانات الموعد.");
    if (!appt) throw new Error("الموعد غير موجود أو ليس ضمن مواعيدك.");

    // 2) Edge cases with Arabic messages
    if (appt.status === "cancelled") {
      throw new Error("الحجز ملغى مسبقًا.");
    }
    if (appt.status === "completed" || appt.status === "no_show") {
      throw new Error("لا يمكن إلغاء موعد منتهٍ.");
    }
    // Riyadh-local "today" — matches booking UI (avoids ±3h drift near midnight).
    const todayIso = riyadhTodayIso();
    if (appt.appointment_date < todayIso) {
      throw new Error("لا يمكن إلغاء موعد سابق.");
    }

    // 3) Cancel via update_appointment_status RPC — it sets the audit
    //    change_reason config (required by log_appointment_change for
    //    cancelled) and performs the UPDATE. RLS still applies to the
    //    UPDATE, so the "users cancel own appointments" policy enforces
    //    phone ownership + allowed transitions.
    const reasonText = (data.reason ?? "").trim() || "إلغاء ذاتي من بوابة المريض";
    const { error: updErr } = await sb.rpc(
      "update_appointment_status" as any,
      { _id: data.appointmentId, _status: "cancelled", _reason: reasonText } as any,
    );
    if (updErr) throw new Error("تعذّر إلغاء الحجز. حاول لاحقًا.");

    // 4) Release the linked slot (best-effort — SECURITY DEFINER RPC)
    await sb.rpc("release_slot", { p_appointment_id: data.appointmentId });

    return { ok: true, reason: data.reason ?? null };
  });

// ---------------------------------------------------------------------------
// Staff: bulk-generate slots for a doctor on one day
// ---------------------------------------------------------------------------
const generateSchema = z.object({
  doctorId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/), // "09:00"
  endTime: z.string().regex(/^\d{2}:\d{2}$/), // "17:00"
  durationMinutes: z.number().int().min(5).max(240),
  breakMinutes: z.number().int().min(0).max(60).default(0),
});

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMMSS(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}:00`;
}

export const generateSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => generateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    // Authorize: only admin/reception/doctor can generate slots
    const roleChecks = await Promise.all(
      (["admin", "reception", "doctor"] as const).map((r) =>
        context.supabase.rpc("has_role", { _user_id: context.userId, _role: r as any }),
      ),
    );
    const allowed = roleChecks.some((r) => r.data === true);
    if (!allowed) throw new Error("غير مصرّح بإنشاء فترات المواعيد.");

    const start = toMinutes(data.startTime);
    const end = toMinutes(data.endTime);
    if (end <= start) throw new Error("وقت النهاية يجب أن يكون بعد البداية.");

    const step = data.durationMinutes + data.breakMinutes;
    const candidates: Array<{
      start_min: number;
      end_min: number;
      row: {
        doctor_id: string;
        branch_id: string | null;
        slot_date: string;
        start_time: string;
        end_time: string;
        status: "available";
      };
    }> = [];
    for (let t = start; t + data.durationMinutes <= end; t += step) {
      candidates.push({
        start_min: t,
        end_min: t + data.durationMinutes,
        row: {
          doctor_id: data.doctorId,
          branch_id: data.branchId ?? null,
          slot_date: data.date,
          start_time: toHHMMSS(t),
          end_time: toHHMMSS(t + data.durationMinutes),
          status: "available",
        },
      });
    }
    if (candidates.length === 0) throw new Error("لا توجد فترات ضمن هذا النطاق.");

    // Overlap detection: fetch existing slots for the same doctor/date and
    // reject any candidate whose [start,end) intersects an existing slot
    // regardless of status (available/booked/blocked).
    const { data: existing, error: fetchErr } = await context.supabase
      .from("availability_slots")
      .select("start_time, end_time, status")
      .eq("doctor_id", data.doctorId)
      .eq("slot_date", data.date);
    if (fetchErr) throw new Error(fetchErr.message);

    const existingRanges = (existing ?? []).map((r) => ({
      start: toMinutes(String(r.start_time).slice(0, 5)),
      end: toMinutes(String(r.end_time).slice(0, 5)),
      status: r.status as string,
    }));

    const rows: (typeof candidates)[number]["row"][] = [];
    const conflicts: Array<{ start: string; end: string; withStatus: string }> = [];
    for (const c of candidates) {
      const clash = existingRanges.find((e) => c.start_min < e.end && c.end_min > e.start);
      if (clash) {
        conflicts.push({
          start: c.row.start_time.slice(0, 5),
          end: c.row.end_time.slice(0, 5),
          withStatus: clash.status,
        });
      } else {
        rows.push(c.row);
      }
    }

    if (rows.length === 0) {
      return {
        requested: candidates.length,
        created: 0,
        skipped: conflicts.length,
        conflicts,
      };
    }

    const { data: inserted, error } = await context.supabase
      .from("availability_slots")
      .insert(rows)
      .select("id");

    if (error) throw new Error(error.message);
    return {
      requested: candidates.length,
      created: inserted?.length ?? 0,
      skipped: conflicts.length,
      conflicts,
    };
  });

// ---------------------------------------------------------------------------
// Staff: list slots for management view (all statuses)
// ---------------------------------------------------------------------------
export const listSlotsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        doctorId: z.string().uuid(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const roleChecks = await Promise.all(
      (["admin", "reception", "doctor"] as const).map((r) =>
        context.supabase.rpc("has_role", { _user_id: context.userId, _role: r as any }),
      ),
    );
    if (!roleChecks.some((r) => r.data === true)) {
      throw new Error("غير مصرّح بعرض فترات المواعيد.");
    }
    let q = context.supabase
      .from("availability_slots")
      .select("id, doctor_id, branch_id, slot_date, start_time, end_time, status, appointment_id")
      .eq("doctor_id", data.doctorId)
      .gte("slot_date", data.fromDate)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(1000);
    if (data.toDate) q = q.lte("slot_date", data.toDate);
    else q = q.lte("slot_date", data.fromDate);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { slots: rows ?? [] };
  });

// ---------------------------------------------------------------------------
// Staff: delete a slot (only if not booked)
// ---------------------------------------------------------------------------
export const deleteSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ slotId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const roleChecks = await Promise.all(
      (["admin", "reception", "doctor"] as const).map((r) =>
        context.supabase.rpc("has_role", { _user_id: context.userId, _role: r as any }),
      ),
    );
    if (!roleChecks.some((r) => r.data === true)) {
      throw new Error("غير مصرّح بحذف الفترات.");
    }
    // Guard: reject deletion of booked slots
    const { data: slot, error: fetchErr } = await context.supabase
      .from("availability_slots")
      .select("id, status")
      .eq("id", data.slotId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!slot) throw new Error("الفترة غير موجودة.");
    if (slot.status === "booked") {
      throw new Error("لا يمكن حذف فترة محجوزة، ألغِ الموعد أوّلاً.");
    }
    const { error } = await context.supabase
      .from("availability_slots")
      .delete()
      .eq("id", data.slotId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });
