/**
 * Patient-facing appointment management server functions.
 *
 * Scoped to the signed-in user via the linked `patients.profile_id` when it
 * exists, with a phone-based fallback for legacy rows created before the
 * patient record was linked. RLS on `appointments` enforces the same scope.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveScope(supabase: any, userId: string) {
  const [{ data: patient }, { data: profile }] = await Promise.all([
    supabase.from("patients").select("id, mrn").eq("profile_id", userId).maybeSingle(),
    supabase.from("profiles").select("id, phone").eq("id", userId).maybeSingle(),
  ]);
  return {
    patientId: (patient?.id as string | null) ?? null,
    mrn: (patient?.mrn as string | null) ?? null,
    phone: (profile?.phone as string | null) ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyScope(query: any, scope: { patientId: string | null; phone: string | null }) {
  if (scope.patientId) return query.eq("patient_id", scope.patientId);
  if (scope.phone) return query.eq("patient_phone", scope.phone);
  return query.eq("patient_id", "00000000-0000-0000-0000-000000000000");
}

/* ---------------------------- listMyAppointments -------------------------- */

const ListSchema = z
  .object({
    scope: z.enum(["upcoming", "past", "all"]).default("upcoming"),
    doctorId: z.string().uuid().optional().nullable(),
    branchId: z.string().uuid().optional().nullable(),
    status: z
      .enum(["new", "confirmed", "completed", "cancelled", "no_show"])
      .optional()
      .nullable(),
    fromDate: z.string().date().optional().nullable(),
    toDate: z.string().date().optional().nullable(),
    search: z.string().trim().max(120).optional().nullable(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .default({ scope: "upcoming", limit: 50 });

export const listMyAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => ListSchema.parse(i ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const scope = await resolveScope(supabase, userId);

    const today = new Date().toISOString().slice(0, 10);
    let q = supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, status, reason, notes, doctor_id, branch_id, specialty_id, patient_name, patient_phone, patient_email, insurance_status, is_demo, created_at, cancelled_at",
      );

    q = applyScope(q, scope);

    if (data.scope === "upcoming") {
      q = q
        .gte("appointment_date", today)
        .in("status", ["new", "confirmed"])
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });
    } else if (data.scope === "past") {
      q = q
        .or(
          `appointment_date.lt.${today},status.in.(completed,cancelled,no_show)`,
        )
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false });
    } else {
      q = q
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false });
    }

    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.status) q = q.eq("status", data.status);
    if (data.fromDate) q = q.gte("appointment_date", data.fromDate);
    if (data.toDate) q = q.lte("appointment_date", data.toDate);
    if (data.search) q = q.ilike("reason", `%${data.search}%`);

    q = q.limit(data.limit);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const doctorIds = [
      ...new Set(
        (rows ?? []).map((r: { doctor_id: string | null }) => r.doctor_id).filter(Boolean),
      ),
    ] as string[];
    const branchIds = [
      ...new Set(
        (rows ?? []).map((r: { branch_id: string | null }) => r.branch_id).filter(Boolean),
      ),
    ] as string[];
    const specialtyIds = [
      ...new Set(
        (rows ?? [])
          .map((r: { specialty_id: string | null }) => r.specialty_id)
          .filter(Boolean),
      ),
    ] as string[];

    const [docsRes, brRes, specRes] = await Promise.all([
      doctorIds.length
        ? supabase
            .from("doctors")
            .select("id, name_ar, name_en, title_ar, title_en, photo_url, slug")
            .in("id", doctorIds)
        : Promise.resolve({ data: [] }),
      branchIds.length
        ? supabase
            .from("branches")
            .select("id, name_ar, name_en, address_ar, address_en, phone, lat, lng, slug")
            .in("id", branchIds)
        : Promise.resolve({ data: [] }),
      specialtyIds.length
        ? supabase
            .from("specialties")
            .select("id, name_ar, name_en")
            .in("id", specialtyIds)
        : Promise.resolve({ data: [] }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docMap = new Map<string, any>((docsRes.data ?? []).map((d: any) => [d.id, d]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brMap = new Map<string, any>((brRes.data ?? []).map((b: any) => [b.id, b]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spMap = new Map<string, any>((specRes.data ?? []).map((s: any) => [s.id, s]));

    return {
      scope,
      items: (rows ?? []).map((a) => ({
        ...a,
        doctor: a.doctor_id ? docMap.get(a.doctor_id) ?? null : null,
        branch: a.branch_id ? brMap.get(a.branch_id) ?? null : null,
        specialty: a.specialty_id ? spMap.get(a.specialty_id) ?? null : null,
      })),
    };
  });

/* ------------------------ ownership guard for actions --------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadOwnedAppointment(supabase: any, userId: string, id: string) {
  const scope = await resolveScope(supabase, userId);
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, patient_phone, appointment_date, appointment_time, status, doctor_id, branch_id, specialty_id, reason",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("الموعد غير موجود.");
  const owns =
    (scope.patientId && data.patient_id === scope.patientId) ||
    (!scope.patientId && scope.phone && data.patient_phone === scope.phone);
  if (!owns) throw new Error("لا تملك صلاحية على هذا الموعد.");
  return { appt: data, scope };
}

/* ---------------------------- confirmMyAttendance ------------------------- */

export const confirmMyAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt } = await loadOwnedAppointment(supabase, userId, data.id);
    if (appt.status === "cancelled" || appt.status === "completed") {
      throw new Error("لا يمكن تأكيد موعد منتهي أو ملغى.");
    }
    if (appt.status === "confirmed") return { ok: true, alreadyConfirmed: true as const };
    const { error } = await supabase
      .from("appointments")
      .update({ status: "confirmed" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, alreadyConfirmed: false as const };
  });

/* ---------------------------- cancelMyAppointment ------------------------- */

export const cancelMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt } = await loadOwnedAppointment(supabase, userId, data.id);
    if (appt.status === "cancelled") return { ok: true };
    if (appt.status === "completed") throw new Error("لا يمكن إلغاء موعد مكتمل.");
    const { error } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        notes: data.reason ? `[سبب الإلغاء] ${data.reason}` : undefined,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------- rescheduleMyAppointment ----------------------- */

const RescheduleSchema = z.object({
  id: z.string().uuid(),
  date: z.string().date(),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

export const reschedulePatientAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => RescheduleSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt } = await loadOwnedAppointment(supabase, userId, data.id);
    if (appt.status === "cancelled" || appt.status === "completed") {
      throw new Error("لا يمكن إعادة جدولة موعد منتهي أو ملغى.");
    }

    // Same-doctor clash check
    if (appt.doctor_id) {
      const clashRes = await supabase
        .from("appointments")
        .select("id")
        .eq("doctor_id", appt.doctor_id)
        .eq("appointment_date", data.date)
        .eq("appointment_time", data.time)
        .in("status", ["new", "confirmed"])
        .neq("id", appt.id)
        .maybeSingle();
      if (clashRes.error && clashRes.error.code !== "PGRST116") {
        throw new Error(clashRes.error.message);
      }
      if (clashRes.data) {
        throw new Error("الوقت الجديد غير متاح. اختر وقتًا آخر.");
      }
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_date: data.date,
        appointment_time: data.time.length === 5 ? `${data.time}:00` : data.time,
        status: "new",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------ requestFollowUp --------------------------- */

const FollowUpSchema = z.object({
  fromAppointmentId: z.string().uuid(),
  preferredDate: z.string().date(),
  preferredTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .default("09:00"),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const requestFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => FollowUpSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt, scope } = await loadOwnedAppointment(
      supabase,
      userId,
      data.fromAppointmentId,
    );

    // Patient details snapshot from the previous visit or profile
    const [{ data: profile }, { data: patient }] = await Promise.all([
      supabase.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
      scope.patientId
        ? supabase
            .from("patients")
            .select("full_name_ar, phone, email")
            .eq("id", scope.patientId)
            .maybeSingle()
        : Promise.resolve({ data: null as { full_name_ar: string; phone: string; email: string | null } | null }),
    ]);

    const patient_name =
      patient?.full_name_ar || profile?.full_name || "مريض";
    const patient_phone = patient?.phone || profile?.phone || appt.patient_phone;

    const insertRes = await supabase
      .from("appointments")
      .insert({
        doctor_id: appt.doctor_id,
        branch_id: appt.branch_id,
        specialty_id: appt.specialty_id,
        appointment_date: data.preferredDate,
        appointment_time:
          data.preferredTime.length === 5 ? `${data.preferredTime}:00` : data.preferredTime,
        reason: data.reason || `متابعة لموعد سابق (${appt.appointment_date})`,
        patient_name,
        patient_phone,
        patient_email: patient?.email ?? null,
        patient_id: scope.patientId,
        status: "new",
      })
      .select("id")
      .single();
    if (insertRes.error) throw new Error(insertRes.error.message);
    return { ok: true, id: insertRes.data.id as string };
  });

/* ------------------------------ self check-in ---------------------------- */
/**
 * Digital self check-in from the patient portal.
 * Allowed within a window: 60 min before → 30 min after appointment time.
 * Returns queue number and status.
 */
export const performSelfCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt, scope } = await loadOwnedAppointment(supabase, userId, data.id);

    // 1) Idempotency first: if a check-in row already exists for this
    // appointment, return it — do not create a duplicate and do not
    // re-evaluate the time window (a patient who checked in on time
    // should still get their number back even after the window closes).
    const existing = await supabase
      .from("patient_check_ins")
      .select("id, queue_number, status, checked_in_at")
      .eq("appointment_id", data.id)
      .maybeSingle();
    if (existing.error && existing.error.code !== "PGRST116") {
      throw new Error(existing.error.message);
    }
    if (existing.data) {
      return {
        ok: true,
        already: true as const,
        queue_number: existing.data.queue_number as number | null,
        status: existing.data.status as string,
        checked_in_at: existing.data.checked_in_at as string,
      };
    }

    // 2) Eligibility by appointment status
    if (appt.status === "cancelled") {
      throw new Error("لا يمكن تسجيل الحضور: هذا الموعد ملغى.");
    }
    if (appt.status === "completed") {
      throw new Error("لا يمكن تسجيل الحضور: هذا الموعد مكتمل بالفعل.");
    }
    if (appt.status === "no_show") {
      throw new Error("لا يمكن تسجيل الحضور: تم تسجيل عدم الحضور لهذا الموعد.");
    }
    if (appt.status === "checked_in" || appt.status === "in_progress") {
      // Defensive: appointment marked checked_in but no check-in row exists.
      throw new Error("تم تسجيل حضورك مسبقًا لهذا الموعد.");
    }
    if (appt.status !== "new" && appt.status !== "confirmed") {
      throw new Error("هذا الموعد غير مؤهّل لتسجيل الحضور حاليًا.");
    }

    // 3) Time window: Riyadh (UTC+3), −60 min → +30 min
    const [y, mo, d] = String(appt.appointment_date).split("-").map(Number);
    const [hh, mm] = String(appt.appointment_time).slice(0, 5).split(":").map(Number);
    const apptUTC = Date.UTC(y, mo - 1, d, hh - 3, mm);
    const now = Date.now();
    const diffMin = (now - apptUTC) / 60000;
    if (diffMin < -60) {
      const untilOpen = Math.ceil(-diffMin - 60);
      const h = Math.floor(untilOpen / 60);
      const m = untilOpen % 60;
      const pretty =
        h > 0 ? `${h} ساعة${m ? ` و${m} دقيقة` : ""}` : `${m} دقيقة`;
      throw new Error(
        `تسجيل الحضور يفتح قبل الموعد بـ 60 دقيقة. تبقّى ${pretty}.`,
      );
    }
    if (diffMin > 30) {
      throw new Error(
        "انتهت نافذة تسجيل الحضور الرقمي. يرجى التوجّه إلى الاستقبال لتسجيل الحضور يدويًا.",
      );
    }


    // Compute next queue number for the doctor/branch today
    const { data: existingToday } = await supabase
      .from("patient_check_ins")
      .select("queue_number, appointment_id, appointments!inner(appointment_date, doctor_id, branch_id)")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("appointments.appointment_date" as any, appt.appointment_date)
      .eq("appointments.doctor_id" as any, appt.doctor_id ?? "")
      .order("queue_number", { ascending: false })
      .limit(1);
    const nextQueue =
      Array.isArray(existingToday) && existingToday[0]?.queue_number
        ? Number(existingToday[0].queue_number) + 1
        : 1;

    const ins = await supabase
      .from("patient_check_ins")
      .insert({
        appointment_id: data.id,
        patient_id: scope.patientId,
        queue_number: nextQueue,
        status: "waiting",
      })
      .select("id, queue_number, status, checked_in_at")
      .single();
    if (ins.error) {
      // Race: another concurrent call already inserted the check-in row.
      // The unique index on appointment_id guarantees only one wins.
      if (ins.error.code === "23505") {
        const again = await supabase
          .from("patient_check_ins")
          .select("queue_number, status, checked_in_at")
          .eq("appointment_id", data.id)
          .maybeSingle();
        if (again.data) {
          return {
            ok: true,
            already: true as const,
            queue_number: again.data.queue_number as number | null,
            status: again.data.status as string,
            checked_in_at: again.data.checked_in_at as string,
          };
        }
      }
      throw new Error(ins.error.message);
    }

    // Move appointment to checked_in
    await supabase.from("appointments").update({ status: "checked_in" }).eq("id", data.id);

    // Fire WhatsApp notification (best-effort, never blocks response).
    try {
      const [{ data: patientRow }, { data: doctorRow }, { data: branchRow }] = await Promise.all([
        scope.patientId
          ? supabase
              .from("patients")
              .select("full_name_ar, phone")
              .eq("id", scope.patientId)
              .maybeSingle()
          : Promise.resolve({ data: null as { full_name_ar: string; phone: string } | null }),
        appt.doctor_id
          ? supabase.from("doctors").select("name_ar").eq("id", appt.doctor_id).maybeSingle()
          : Promise.resolve({ data: null as { name_ar: string } | null }),
        appt.branch_id
          ? supabase
              .from("branches")
              .select("name_ar, lat, lng, map_embed_url")
              .eq("id", appt.branch_id)
              .maybeSingle()
          : Promise.resolve({
              data: null as {
                name_ar: string;
                lat: number | null;
                lng: number | null;
                map_embed_url: string | null;
              } | null,
            }),
      ]);

      const { sendCheckInWhatsApp } = await import("@/lib/notifications/whatsapp.server");
      await sendCheckInWhatsApp({
        toPhone: patientRow?.phone ?? appt.patient_phone ?? scope.phone ?? null,
        patientName: patientRow?.full_name_ar || "مريضنا العزيز",
        queueNumber: (ins.data.queue_number as number | null) ?? null,
        checkedInAt: ins.data.checked_in_at as string,
        appointmentId: data.id,
        doctorName: doctorRow?.name_ar ?? null,
        branchName: branchRow?.name_ar ?? null,
        branchLat: branchRow?.lat ?? null,
        branchLng: branchRow?.lng ?? null,
        branchMapEmbedUrl: branchRow?.map_embed_url ?? null,
        locale: "ar",
      });
    } catch (e) {
      console.error("[performSelfCheckIn] whatsapp notify failed", (e as Error).message);
    }

    return {
      ok: true,
      already: false as const,
      queue_number: ins.data.queue_number as number | null,
      status: ins.data.status as string,
      checked_in_at: ins.data.checked_in_at as string,
    };
  });

/* --------------------------- appointment timeline ------------------------- */
/**
 * Returns the ordered status history for one appointment (owner-scoped),
 * synthesizing a "created" entry from `appointments.created_at` and a
 * "checked_in" entry from `patient_check_ins.checked_in_at` when present.
 */
export const getAppointmentTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { appt } = await loadOwnedAppointment(supabase, userId, data.id);

    const [historyRes, checkInRes] = await Promise.all([
      supabase
        .from("appointment_status_history")
        .select("id, from_status, to_status, reason, created_at")
        .eq("appointment_id", data.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("patient_check_ins")
        .select("queue_number, status, checked_in_at")
        .eq("appointment_id", data.id)
        .maybeSingle(),
    ]);
    if (historyRes.error) throw new Error(historyRes.error.message);

    type Row = {
      key: string;
      status: string;
      at: string;
      from?: string | null;
      reason?: string | null;
      queue_number?: number | null;
    };

    const rows: Row[] = [];

    // Synthetic "created" row (قيد المراجعة) from appointment creation.
    const created = (appt as { created_at?: string | null }).created_at;
    if (created) {
      rows.push({ key: "created", status: "new", at: created });
    }

    for (const h of historyRes.data ?? []) {
      // Skip the very first row if it duplicates the synthetic "created"
      // entry (from_status is null and to_status is "new").
      if (!h.from_status && h.to_status === "new" && created && h.created_at === created) {
        continue;
      }
      rows.push({
        key: h.id as string,
        status: String(h.to_status),
        at: h.created_at as string,
        from: h.from_status as string | null,
        reason: (h.reason as string | null) ?? null,
      });
    }

    // Append check-in row if the history didn't already reflect it.
    if (checkInRes.data?.checked_in_at) {
      const hasCheckedIn = rows.some((r) => r.status === "checked_in");
      if (!hasCheckedIn) {
        rows.push({
          key: "check_in",
          status: "checked_in",
          at: checkInRes.data.checked_in_at as string,
          queue_number: (checkInRes.data.queue_number as number | null) ?? null,
        });
      } else {
        // Attach queue number to the checked_in event.
        const idx = rows.findIndex((r) => r.status === "checked_in");
        if (idx >= 0) rows[idx].queue_number = (checkInRes.data.queue_number as number | null) ?? null;
      }
    }

    // Sort by timestamp asc as a defensive final pass.
    rows.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return {
      appointmentId: data.id,
      currentStatus: String((appt as { status: string }).status),
      events: rows,
    };
  });

