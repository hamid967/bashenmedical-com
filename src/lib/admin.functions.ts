import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "reception" | "pharmacy" | "super_admin";

async function getRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}

function ensureRole(roles: Role[], allowed: Role[]) {
  // super_admin يملك جميع الصلاحيات ضمنيًا
  if (roles.includes("super_admin")) return;
  if (!roles.some((r) => allowed.includes(r))) {
    throw new Error("ليست لديك الصلاحية لتنفيذ هذا الإجراء.");
  }
}

/**
 * Convert a raw Supabase/PostgREST error into an Arabic user-facing message.
 * Handles: RLS denials, check-constraint violations, FK/unique conflicts,
 * missing rows, and network timeouts. Keeps raw details in the log server-side.
 */
function humanizeSupabaseError(err: any, fallback = "تعذّر تنفيذ الطلب."): string {
  if (!err) return fallback;
  const code: string | undefined = err.code ?? err.details?.code;
  const msg: string = String(err.message ?? err.details ?? "");
  console.error("[supabase-error]", { code, msg, hint: err.hint, details: err.details });

  // RLS denial (PostgREST maps to 42501 or PGRST301)
  if (
    code === "42501" ||
    code === "PGRST301" ||
    /row-level security|permission denied/i.test(msg)
  ) {
    return "ليست لديك الصلاحية لتنفيذ هذا الإجراء. الرجاء التواصل مع المسؤول إذا كنت ترى هذا خطأً.";
  }
  // CHECK constraint / policy WITH CHECK failure on insert
  if (code === "23514" || /violates check constraint/i.test(msg)) {
    return "البيانات المُدخلة غير صالحة. الرجاء مراجعة الحقول والمحاولة مجددًا.";
  }
  // Unique violation
  if (code === "23505" || /duplicate key/i.test(msg)) {
    return "توجد بيانات مكرّرة تمنع إتمام العملية.";
  }
  // Foreign key
  if (code === "23503" || /foreign key/i.test(msg)) {
    return "لا يمكن تنفيذ الطلب لوجود سجلات مرتبطة.";
  }
  // Not-null
  if (code === "23502" || /null value in column/i.test(msg)) {
    return "أحد الحقول المطلوبة مفقود.";
  }
  // Auth / session
  if (/jwt|unauthorized|not authenticated/i.test(msg)) {
    return "انتهت الجلسة. الرجاء تسجيل الدخول من جديد.";
  }
  // Rate limit
  if (code === "429" || /rate limit/i.test(msg)) {
    return "عدد المحاولات مرتفع. الرجاء الانتظار قليلًا ثم المحاولة مرة أخرى.";
  }
  return fallback;
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    return { userId: context.userId, roles };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const sb = context.supabase;
    const today = new Date().toISOString().slice(0, 10);

    const [appts, todayAppts, pendingAppts, orders, pendingOrders, doctorsCount] =
      await Promise.all([
        sb.from("appointments").select("id", { count: "exact", head: true }),
        sb
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("appointment_date", today),
        sb.from("appointments").select("id", { count: "exact", head: true }).eq("status", "new"),
        sb.from("medicine_orders").select("id", { count: "exact", head: true }),
        sb.from("medicine_orders").select("id", { count: "exact", head: true }).eq("status", "new"),
        sb.from("doctors").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
    return {
      appointmentsTotal: appts.count ?? 0,
      appointmentsToday: todayAppts.count ?? 0,
      appointmentsPending: pendingAppts.count ?? 0,
      ordersTotal: orders.count ?? 0,
      ordersPending: pendingOrders.count ?? 0,
      doctorsActive: doctorsCount.count ?? 0,
    };
  });

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { data, error } = await context.supabase
      .from("appointments")
      .select("*, doctors(name_ar,name_en), specialties(name_ar,name_en)")
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false })
      .limit(200);
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

import { checkAppointmentTransition, type ApptStatus, type StaffRole } from "./appt-transitions";
import { reasonSchema } from "./reason";

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "confirmed", "completed", "cancelled", "no_show"]),
        reason: reasonSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const actorId = context.userId;

    const logDenied = async (
      denyReason: string,
      fromStatus: string | null,
      extra?: Record<string, unknown>,
    ) => {
      try {
        await sb.rpc(
          "log_security_event" as any,
          {
            _action: "appointment_status_update_denied",
            _appointment_id: data.id,
            _from_status: fromStatus,
            _to_status: data.status,
            _reason: denyReason,
            _metadata: { actor: actorId, requested_reason: data.reason ?? null, ...(extra ?? {}) },
          } as any,
        );
      } catch (e) {
        console.error("[security-audit] failed to log denial", e);
      }
    };

    // 1) Authenticated user (middleware) + role gate
    const roles = (await getRoles(sb, actorId)) as StaffRole[];
    if (!roles.some((r) => (["admin", "reception", "super_admin"] as any[]).includes(r as any))) {
      await logDenied("role_denied", null, { roles });
      throw new Error("ليست لديك الصلاحية لتنفيذ هذا الإجراء.");
    }

    // 2) Load the target row (RLS-scoped as the caller). Missing / hidden → 404-ish
    const { data: current, error: readErr } = await sb
      .from("appointments")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) {
      await logDenied("read_error", null, { code: readErr.code });
      throw new Error(humanizeSupabaseError(readErr));
    }
    if (!current) {
      await logDenied("appointment_not_found", null);
      throw new Error("الحجز غير موجود أو لا تملك صلاحية عرضه.");
    }

    // 3-4) Transition legality + per-transition role check + reason requirement
    const check = checkAppointmentTransition(
      current.status as ApptStatus,
      data.status as ApptStatus,
      roles,
      data.reason,
    );
    if (!check.ok) {
      await logDenied((check as any).code ?? "transition_denied", current.status, {
        message: check.message,
        roles,
      });
      throw new Error(check.message);
    }
    if (check.unchanged) return { ok: true, unchanged: true };

    // 5) Perform the update via RPC (carries reason into the audit trigger)
    const { error } = await sb.rpc(
      "update_appointment_status" as any,
      {
        _id: data.id,
        _status: data.status,
        _reason: data.reason ?? null,
      } as any,
    );
    if (error) {
      await logDenied("rpc_error", current.status, { code: error.code });
      throw new Error(humanizeSupabaseError(error));
    }
    return { ok: true };
  });

export const updateAppointmentNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        id: z.string().uuid(),
        notes: z.string().trim().max(2000).nullable(),
        reason: reasonSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { error } = await context.supabase.rpc(
      "update_appointment_notes" as any,
      {
        _id: data.id,
        _notes: data.notes,
        _reason: data.reason ?? null,
      } as any,
    );
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const listAppointmentAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ appointmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { data: rows, error } = await context.supabase
      .from("appointment_audit")
      .select("*")
      .eq("appointment_id", data.appointmentId)
      .order("changed_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(humanizeSupabaseError(error));
    // Enrich with actor email (best-effort; requires admin)
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)));
    let emailById = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      for (const p of profs ?? []) emailById.set(p.id, p.full_name ?? "");
    }
    return (rows ?? []).map((r: any) => ({
      ...r,
      changed_by_name: r.changed_by ? (emailById.get(r.changed_by) ?? null) : null,
    }));
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("medicine_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "pharmacy"]);
    const { error } = await context.supabase
      .from("medicine_orders")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const listDoctorsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("doctors")
      .select("*, specialties(name_ar,name_en)")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const toggleDoctorActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase
      .from("doctors")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

const doctorInput = z.object({
  specialty_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/i, "slug lowercase, digits, dashes")
    .nullable()
    .optional(),
  name_ar: z.string().min(1),
  name_en: z.string().nullable().optional(),
  title_ar: z.string().nullable().optional(),
  title_en: z.string().nullable().optional(),
  photo_url: z.string().url().nullable().optional().or(z.literal("")),
  bio_ar: z.string().nullable().optional(),
  bio_en: z.string().nullable().optional(),
  languages: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const listSpecialtiesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("specialties")
      .select("id, name_ar, name_en")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const createDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => doctorInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const payload = { ...data, photo_url: data.photo_url || null };
    const { data: row, error } = await context.supabase
      .from("doctors")
      .insert(payload as any)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

export const updateDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).and(doctorInput.partial()).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { id, ...rest } = data;
    const payload: any = { ...rest };
    if ("photo_url" in payload) payload.photo_url = payload.photo_url || null;
    const { error } = await context.supabase.from("doctors").update(payload).eq("id", id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const deleteDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase.from("doctors").delete().eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

/* ---------------- Specialties CRUD ---------------- */

const specialtyInput = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug lowercase, digits, dashes"),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  icon: z.string().nullable().optional(),
  description_ar: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const listSpecialtiesFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("specialties")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const createSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => specialtyInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { data: row, error } = await context.supabase
      .from("specialties")
      .insert(data as any)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

export const updateSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).and(specialtyInput.partial()).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("specialties")
      .update(rest as any)
      .eq("id", id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const deleteSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase.from("specialties").delete().eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

/* ---------------- Availability ---------------- */

const availabilityInput = z.object({
  doctor_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  slot_minutes: z.number().int().min(5).max(240).default(30),
});

export const listAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ doctor_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const { data: rows, error } = await context.supabase
      .from("availability")
      .select("*")
      .eq("doctor_id", data.doctor_id)
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return rows ?? [];
  });

export const createAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => availabilityInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    if (data.start_time >= data.end_time) throw new Error("وقت البداية يجب أن يسبق النهاية");
    const { data: row, error } = await context.supabase
      .from("availability")
      .insert(data as any)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

export const deleteAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase.from("availability").delete().eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

/**
 * List reminder-preference audit rows for staff dashboards.
 * Supports:
 *   - optional appointmentId filter
 *   - optional reminder_kind filter ("reminder_24h" | "reminder_2h")
 *   - optional source filter ("staff" | "self_service" | "system")
 *   - pagination via page (1-based) + pageSize (max 100)
 * Returns { rows, total, page, pageSize } and enriches actor names.
 */
export const listReminderPreferenceAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        appointmentId: z.string().uuid().optional(),
        reminderKind: z.enum(["reminder_24h", "reminder_2h"]).optional(),
        source: z.enum(["staff", "self_service", "system"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = context.supabase
      .from("reminder_preference_audit")
      .select("*", { count: "exact" })
      .order("changed_at", { ascending: false })
      .range(from, to);

    if (data.appointmentId) q = q.eq("appointment_id", data.appointmentId);
    if (data.reminderKind) q = q.eq("reminder_kind", data.reminderKind);
    if (data.source) q = q.eq("source", data.source);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(humanizeSupabaseError(error));

    // Enrich actor names (best-effort).
    const ids = Array.from(
      new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)),
    );
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      for (const p of profs ?? []) nameById.set(p.id, p.full_name ?? "");
    }

    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        changed_by_name: r.changed_by ? (nameById.get(r.changed_by) ?? null) : null,
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });


export const getReminderPreferenceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const sb = context.supabase;

    const [
      total,
      r24On,
      r2On,
      bothOn,
      bothOff,
      auditTotal,
      audit24,
      audit2,
      auditSelf,
      auditStaff,
      auditSystem,
      auditApptIds,
      auditRecent,
    ] = await Promise.all([
      sb.from("appointments").select("id", { count: "exact", head: true }),
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("reminder_24h", true),
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("reminder_2h", true),
      sb
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("reminder_24h", true)
        .eq("reminder_2h", true),
      sb
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("reminder_24h", false)
        .eq("reminder_2h", false),
      sb.from("reminder_preference_audit").select("id", { count: "exact", head: true }),
      sb
        .from("reminder_preference_audit")
        .select("id", { count: "exact", head: true })
        .eq("reminder_kind", "reminder_24h"),
      sb
        .from("reminder_preference_audit")
        .select("id", { count: "exact", head: true })
        .eq("reminder_kind", "reminder_2h"),
      sb
        .from("reminder_preference_audit")
        .select("id", { count: "exact", head: true })
        .eq("source", "self_service"),
      sb
        .from("reminder_preference_audit")
        .select("id", { count: "exact", head: true })
        .eq("source", "staff"),
      sb
        .from("reminder_preference_audit")
        .select("id", { count: "exact", head: true })
        .eq("source", "system"),
      sb.from("reminder_preference_audit").select("appointment_id"),
      sb
        .from("reminder_preference_audit")
        .select("id", { count: "exact", head: true })
        .gte("changed_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
    ]);

    if (total.error) throw new Error(humanizeSupabaseError(total.error));

    const apptsTotal = total.count ?? 0;
    const distinctAppts = new Set<string>(
      (auditApptIds.data ?? []).map((r: any) => r.appointment_id),
    ).size;
    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    return {
      appointmentsTotal: apptsTotal,
      reminder24Enabled: r24On.count ?? 0,
      reminder2Enabled: r2On.count ?? 0,
      bothEnabled: bothOn.count ?? 0,
      bothDisabled: bothOff.count ?? 0,
      reminder24Pct: pct(r24On.count ?? 0, apptsTotal),
      reminder2Pct: pct(r2On.count ?? 0, apptsTotal),
      bothEnabledPct: pct(bothOn.count ?? 0, apptsTotal),
      bothDisabledPct: pct(bothOff.count ?? 0, apptsTotal),
      auditTotal: auditTotal.count ?? 0,
      audit24: audit24.count ?? 0,
      audit2: audit2.count ?? 0,
      auditSelfService: auditSelf.count ?? 0,
      auditStaff: auditStaff.count ?? 0,
      auditSystem: auditSystem.count ?? 0,
      auditLast7d: auditRecent.count ?? 0,
      appointmentsWithAudit: distinctAppts,
      coveragePct: pct(distinctAppts, apptsTotal),
    };
  });

/**
 * Export reminder-preference audit as CSV, filtered by appointment ref (partial UUID)
 * or patient phone, and optionally by a date range.
 * Returns { csv, count, filename }. Admin/reception only.
 */
export const exportReminderPreferenceAuditCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        ref: z
          .string()
          .trim()
          .min(4, "الرجاء إدخال 4 أحرف على الأقل من ref")
          .max(64)
          .optional(),
        phone: z
          .string()
          .trim()
          .min(4, "رقم الهاتف قصير جدًا")
          .max(32)
          .optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .refine((v) => !!(v.ref || v.phone), {
        message: "الرجاء تحديد ref أو رقم الهاتف على الأقل",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const sb = context.supabase;

    // 1) Fetch candidate appointments; narrow by phone digits and/or ref prefix.
    let apptQ = sb
      .from("appointments")
      .select("id, patient_name, patient_phone, appointment_date, appointment_time")
      .limit(2000);
    if (data.phone) {
      const digits = data.phone.replace(/\D/g, "");
      // Coarse pre-filter via ilike; exact digit-equality applied below.
      apptQ = apptQ.ilike("patient_phone", `%${digits}%`);
    }
    const { data: apptRows, error: apptErr } = await apptQ;
    if (apptErr) throw new Error(humanizeSupabaseError(apptErr));

    let matching = apptRows ?? [];
    if (data.phone) {
      const digits = data.phone.replace(/\D/g, "");
      matching = matching.filter(
        (a: any) => (a.patient_phone ?? "").replace(/\D/g, "") === digits,
      );
    }
    if (data.ref) {
      const ref = data.ref.toLowerCase().replace(/-/g, "");
      matching = matching.filter((a: any) =>
        a.id.toLowerCase().replace(/-/g, "").startsWith(ref),
      );
    }

    const header =
      "changed_at,appointment_id,patient_name,patient_phone,appointment_date,appointment_time,reminder_kind,old_value,new_value,source,reason,changed_by,changed_by_name\n";

    if (!matching.length) {
      return { csv: header, count: 0, filename: buildCsvFilename(data) };
    }

    // 2) Fetch audit rows for those appointments, optional date range.
    const ids = matching.map((a: any) => a.id);
    let auditQ = sb
      .from("reminder_preference_audit")
      .select("*")
      .in("appointment_id", ids)
      .order("changed_at", { ascending: false })
      .limit(5000);
    if (data.from) auditQ = auditQ.gte("changed_at", data.from);
    if (data.to) auditQ = auditQ.lte("changed_at", data.to);
    const { data: audit, error: auditErr } = await auditQ;
    if (auditErr) throw new Error(humanizeSupabaseError(auditErr));

    // 3) Enrich actor names.
    const actorIds = Array.from(
      new Set((audit ?? []).map((r: any) => r.changed_by).filter(Boolean)),
    );
    const nameById = new Map<string, string>();
    if (actorIds.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const p of profs ?? []) nameById.set(p.id, p.full_name ?? "");
    }

    const apptById = new Map<string, any>(matching.map((a: any) => [a.id, a]));
    const esc = (v: any): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = (audit ?? [])
      .map((r: any) => {
        const a = apptById.get(r.appointment_id) ?? {};
        return [
          r.changed_at,
          r.appointment_id,
          a.patient_name,
          a.patient_phone,
          a.appointment_date,
          a.appointment_time,
          r.reminder_kind,
          r.old_value,
          r.new_value,
          r.source,
          r.reason,
          r.changed_by,
          r.changed_by ? (nameById.get(r.changed_by) ?? "") : "",
        ]
          .map(esc)
          .join(",");
      })
      .join("\n");

    // UTF-8 BOM so Excel opens Arabic correctly.
    const csv = "\uFEFF" + header + body + (body ? "\n" : "");
    return { csv, count: audit?.length ?? 0, filename: buildCsvFilename(data) };
  });

function buildCsvFilename(d: { ref?: string; phone?: string; from?: string; to?: string }): string {
  const parts = ["reminder-audit"];
  if (d.ref) parts.push(`ref-${d.ref.replace(/[^a-z0-9]/gi, "")}`);
  if (d.phone) parts.push(`ph-${d.phone.replace(/\D/g, "")}`);
  if (d.from) parts.push(`from-${d.from.slice(0, 10)}`);
  if (d.to) parts.push(`to-${d.to.slice(0, 10)}`);
  return parts.join("_") + ".csv";
}

// ============ Security Audit Log ============

const securityAuditFilterSchema = z.object({
  ref: z.string().trim().max(64).optional(),
  phone: z.string().trim().max(32).optional(),
  action: z.string().trim().max(64).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

export const listSecurityAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => securityAuditFilterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase, userId);
    ensureRole(roles, ["admin"]);

    // Optional: resolve appointment IDs matching ref/phone first
    let appointmentIdFilter: string[] | null = null;
    if (data.ref || data.phone) {
      let apQ = supabase
        .from("appointments")
        .select("id, patient_name, patient_phone")
        .limit(2000);
      if (data.phone) {
        const digits = data.phone.replace(/\D/g, "");
        if (digits.length > 0) apQ = apQ.ilike("patient_phone", `%${digits}%`);
      }
      const { data: appts, error: apErr } = await apQ;
      if (apErr) throw new Error(humanizeSupabaseError(apErr));
      let ids = (appts ?? []).map((a: any) => a.id as string);
      if (data.ref) {
        const cleanRef = data.ref.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
        if (cleanRef.length > 0) {
          ids = ids.filter((id) => id.replace(/-/g, "").toLowerCase().startsWith(cleanRef));
        }
      }
      appointmentIdFilter = ids;
      if (appointmentIdFilter.length === 0) {
        return { items: [], count: 0 };
      }
    }


    let q = supabase
      .from("security_audit_log")
      .select("id, action, actor, appointment_id, from_status, to_status, reason, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (appointmentIdFilter) q = q.in("appointment_id", appointmentIdFilter);
    if (data.action) q = q.eq("action", data.action);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(humanizeSupabaseError(error));

    const appointmentIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.appointment_id).filter(Boolean))
    );
    const actorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean))
    );

    const [apptsRes, profilesRes] = await Promise.all([
      appointmentIds.length
        ? supabase
            .from("appointments")
            .select("id, patient_name, patient_phone, appointment_date, appointment_time")
            .in("id", appointmentIds)
        : Promise.resolve({ data: [], error: null } as any),
      actorIds.length
        ? supabase.from("profiles").select("id, full_name, phone").in("id", actorIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);

    const apptMap = new Map<string, any>();
    for (const a of (apptsRes.data ?? []) as any[]) apptMap.set(a.id, a);
    const profileMap = new Map<string, any>();
    for (const p of (profilesRes.data ?? []) as any[]) profileMap.set(p.id, p);

    const items = (rows ?? []).map((r: any) => ({
      id: r.id,
      action: r.action,
      actor: r.actor,
      actor_name: r.actor ? profileMap.get(r.actor)?.full_name ?? null : null,
      appointment_id: r.appointment_id,
      patient_name: r.appointment_id ? apptMap.get(r.appointment_id)?.patient_name ?? null : null,
      patient_phone: r.appointment_id ? apptMap.get(r.appointment_id)?.patient_phone ?? null : null,
      appointment_date: r.appointment_id ? apptMap.get(r.appointment_id)?.appointment_date ?? null : null,
      appointment_time: r.appointment_id ? apptMap.get(r.appointment_id)?.appointment_time ?? null : null,
      from_status: r.from_status,
      to_status: r.to_status,
      reason: r.reason,
      metadata: r.metadata,
      created_at: r.created_at,
    }));

    return { items, count: items.length };
  });

export const listSecurityAuditActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase, userId);
    ensureRole(roles, ["admin"]);
    const { data, error } = await supabase
      .from("security_audit_log")
      .select("action")
      .limit(1000);
    if (error) throw new Error(humanizeSupabaseError(error));
    const actions = Array.from(new Set((data ?? []).map((r: any) => r.action))).sort();
    return { actions };
  });

/* ---------------- FAQs ---------------- */

const faqInput = z.object({
  question_ar: z.string().trim().min(1, "السؤال بالعربية مطلوب").max(500),
  answer_ar: z.string().trim().min(1, "الجواب بالعربية مطلوب").max(4000),
  question_en: z.string().trim().max(500).nullable().optional(),
  answer_en: z.string().trim().max(4000).nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const listFaqsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { data, error } = await context.supabase
      .from("faqs")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const createFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => faqInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { data: row, error } = await context.supabase
      .from("faqs")
      .insert(data as any)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

export const updateFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).and(faqInput.partial()).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { id, ...rest } = data;
    const { error } = await context.supabase.from("faqs").update(rest as any).eq("id", id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const deleteFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase.from("faqs").delete().eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

/* ---------------- About Sections ---------------- */

const aboutInput = z.object({
  section_key: z
    .string()
    .trim()
    .min(1, "المفتاح مطلوب")
    .max(100)
    .regex(/^[a-z0-9_-]+$/i, "المفتاح: أحرف/أرقام/شرطة سفلية فقط"),
  title_ar: z.string().trim().max(300).nullable().optional(),
  title_en: z.string().trim().max(300).nullable().optional(),
  body_ar: z.string().trim().max(8000).nullable().optional(),
  body_en: z.string().trim().max(8000).nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const listAboutSectionsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { data, error } = await context.supabase
      .from("about_sections")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const createAboutSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => aboutInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { data: row, error } = await context.supabase
      .from("about_sections")
      .insert(data as any)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

export const updateAboutSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).and(aboutInput.partial()).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("about_sections")
      .update(rest as any)
      .eq("id", id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

export const deleteAboutSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { error } = await context.supabase
      .from("about_sections")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

// ============= Clinic Settings =============

const OpeningHoursSchema = z.object({
  days: z.array(z.string()).min(1),
  opens: z.string().regex(/^\d{2}:\d{2}$/),
  closes: z.string().regex(/^\d{2}:\d{2}$/),
});

const UpdateClinicSettingsSchema = z.object({
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  phone: z.string().min(1),
  phone_display: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  mobile_display: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  address_ar: z.string().min(1),
  address_en: z.string().min(1),
  street_address: z.string().min(1),
  address_locality: z.string().min(1),
  address_region: z.string().min(1),
  postal_code: z.string().nullable().optional(),
  address_country: z.string().min(2),
  lat: z.number(),
  lng: z.number(),
  maps_url: z.string().url().nullable().optional().or(z.literal("")),
  price_range: z.string().nullable().optional(),
  currencies_accepted: z.string().nullable().optional(),
  payment_accepted: z.string().nullable().optional(),
  medical_specialties: z.array(z.string()),
  same_as: z.array(z.string()),
  opening_hours: z.array(OpeningHoursSchema),
});

export const getClinicSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const { data, error } = await context.supabase
      .from("clinic_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(humanizeSupabaseError(error));
    return data;
  });

export const updateClinicSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpdateClinicSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const payload = {
      ...data,
      email: data.email || null,
      maps_url: data.maps_url || null,
    };
    const { error } = await context.supabase
      .from("clinic_settings")
      .update(payload)
      .eq("id", 1);
    if (error) throw new Error(humanizeSupabaseError(error));
    return { ok: true };
  });

/* ---------------- Branches CRUD (admin quick-add wizard) ---------------- */

const branchInput = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/i, "slug lowercase, digits, dashes"),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  city_ar: z.string().nullable().optional(),
  city_en: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  emergency_phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  address_ar: z.string().nullable().optional(),
  address_en: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  description_ar: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  hero_image_url: z.string().url().nullable().optional().or(z.literal("")),
  map_embed_url: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const listBranchesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception", "pharmacy"]);
    const { data, error } = await context.supabase
      .from("branches")
      .select("id, slug, name_ar, name_en, city_ar, is_active, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(humanizeSupabaseError(error));
    return data ?? [];
  });

export const createBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => branchInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin"]);
    const payload: any = { ...data };
    if (payload.email === "") payload.email = null;
    if (payload.hero_image_url === "") payload.hero_image_url = null;
    const { data: row, error } = await context.supabase
      .from("branches")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });

/* ---------------- Admin appointment quick-create ---------------- */

const appointmentAdminInput = z.object({
  patient_name: z.string().trim().min(2).max(120),
  patient_phone: z.string().trim().min(6).max(32),
  national_id: z.string().trim().max(20).nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  specialty_id: z.string().uuid().nullable().optional(),
  doctor_id: z.string().uuid().nullable().optional(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointment_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  reason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  status: z
    .enum(["new", "confirmed"])
    .default("confirmed"),
});

export const createAppointmentAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => appointmentAdminInput.parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureRole(roles, ["admin", "reception"]);
    const payload: any = {
      patient_name: data.patient_name,
      patient_phone: data.patient_phone,
      national_id: data.national_id ?? null,
      gender: data.gender ?? null,
      branch_id: data.branch_id ?? null,
      specialty_id: data.specialty_id ?? null,
      doctor_id: data.doctor_id ?? null,
      appointment_date: data.appointment_date,
      appointment_time: data.appointment_time,
      reason: data.reason ?? null,
      notes: data.notes ?? null,
      status: data.status,
    };
    const { data: row, error } = await context.supabase
      .from("appointments")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(humanizeSupabaseError(error));
    return row;
  });
