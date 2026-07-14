/**
 * Dependents (family members) — guardian-scoped CRUD.
 * All server fns require an authenticated user; RLS on public.dependents
 * scopes rows to auth.uid() = guardian_user_id.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Dependent = {
  id: string;
  guardian_user_id: string;
  patient_id: string | null;
  full_name: string;
  relationship: "child" | "spouse" | "parent" | "sibling" | "other";
  national_id: string | null;
  phone: string | null;
  gender: "male" | "female" | null;
  date_of_birth: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
};

const RELATIONSHIPS = ["child", "spouse", "parent", "sibling", "other"] as const;

const RelationshipEnum = z.enum(RELATIONSHIPS);
const GenderEnum = z.enum(["male", "female"]);

// Accepts a plain 10-digit Saudi ID or leaves it optional.
const NationalId = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "national_id_invalid")
  .optional()
  .nullable();

// Saudi mobile — accepts +9665XXXXXXXX, 009665XXXXXXXX, or 05XXXXXXXX.
const Phone = z
  .string()
  .trim()
  .regex(/^(?:\+?966|0)?5\d{8}$/, "phone_invalid")
  .optional()
  .nullable();

const BaseSchema = z.object({
  full_name: z.string().trim().min(2, "name_too_short").max(120, "name_too_long"),
  relationship: RelationshipEnum,
  gender: GenderEnum.optional().nullable(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_invalid")
    .optional()
    .nullable(),
  national_id: NationalId,
  phone: Phone,
});

/* ------------------------------ list ------------------------------ */

export const listDependents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("dependents")
      .select(
        "id, guardian_user_id, patient_id, full_name, relationship, national_id, phone, gender, date_of_birth, verified, created_at, updated_at",
      )
      .eq("guardian_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Dependent[];
  });

/* ------------------------------ getById ------------------------------ */

export const getDependent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("dependents")
      .select(
        "id, guardian_user_id, patient_id, full_name, relationship, national_id, phone, gender, date_of_birth, verified, created_at, updated_at",
      )
      .eq("id", data.id)
      .eq("guardian_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as Dependent | null;
  });

/* ------------------------------ create ------------------------------ */

export const createDependent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => BaseSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("dependents")
      .insert({
        guardian_user_id: userId,
        full_name: data.full_name,
        relationship: data.relationship,
        gender: data.gender ?? null,
        date_of_birth: data.date_of_birth ?? null,
        national_id: data.national_id ?? null,
        phone: data.phone ?? null,
      })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as Dependent;
  });

/* ------------------------------ update ------------------------------ */

export const updateDependent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    BaseSchema.extend({ id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("dependents")
      .update({
        full_name: patch.full_name,
        relationship: patch.relationship,
        gender: patch.gender ?? null,
        date_of_birth: patch.date_of_birth ?? null,
        national_id: patch.national_id ?? null,
        phone: patch.phone ?? null,
      })
      .eq("id", id)
      .eq("guardian_user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as Dependent;
  });

/* ------------------------------ delete ------------------------------ */

export const deleteDependent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("dependents")
      .delete()
      .eq("id", data.id)
      .eq("guardian_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* -------------------- listDependentAppointments -------------------- */

export type DependentAppointment = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  reason: string | null;
  doctor_name_ar: string | null;
  doctor_name_en: string | null;
  branch_name_ar: string | null;
  specialty_name_ar: string | null;
};

export const listDependentAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        dependent_id: z.string().uuid(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<DependentAppointment[]> => {
    const { supabase, userId } = context;

    // Verify ownership through RLS-safe query on dependents.
    const { data: dep, error: depErr } = await supabase
      .from("dependents")
      .select("id, patient_id")
      .eq("id", data.dependent_id)
      .eq("guardian_user_id", userId)
      .maybeSingle();
    if (depErr) throw new Error(depErr.message);
    if (!dep) throw new Error("Not found");

    // Guardian's phone-scoped RLS won't return dependent rows whose
    // patient_phone belongs to the dependent, so read with the service role.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const marker = `dependent:${dep.id}`;
    let query = supabaseAdmin
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, status, reason, notes, patient_id, " +
          "doctors:doctor_id(name_ar, name_en), " +
          "branches:branch_id(name_ar), " +
          "specialties:specialty_id(name_ar)",
      )
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false })
      .limit(data.limit ?? 20);

    // Rows linked via notes marker OR direct patient_id when the dependent
    // already has a patient record.
    query = dep.patient_id
      ? query.or(`notes.ilike.${marker}%,patient_id.eq.${dep.patient_id}`)
      : query.ilike("notes", `${marker}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      appointment_date: r.appointment_date,
      appointment_time: r.appointment_time,
      status: r.status,
      reason: r.reason ?? null,
      doctor_name_ar: r.doctors?.name_ar ?? null,
      doctor_name_en: r.doctors?.name_en ?? null,
      branch_name_ar: r.branches?.name_ar ?? null,
      specialty_name_ar: r.specialties?.name_ar ?? null,
    }));
  });

/* -------------------- countDependentAppointments -------------------- */

/**
 * Counts appointments linked to a dependent, splitting active (bookings
 * that are still on the schedule) from historical rows so the delete
 * dialog can block removal while there are commitments outstanding.
 */
export const countDependentAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ dependent_id: z.string().uuid() }).parse(raw),
  )
  .handler(
    async ({
      context,
      data,
    }): Promise<{ total: number; active: number }> => {
      const { supabase, userId } = context;

      const { data: dep, error: depErr } = await supabase
        .from("dependents")
        .select("id, patient_id")
        .eq("id", data.dependent_id)
        .eq("guardian_user_id", userId)
        .maybeSingle();
      if (depErr) throw new Error(depErr.message);
      if (!dep) throw new Error("Not found");

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const marker = `dependent:${dep.id}`;
      const filter = dep.patient_id
        ? `notes.ilike.${marker}%,patient_id.eq.${dep.patient_id}`
        : null;

      const buildQuery = () => {
        let q = supabaseAdmin
          .from("appointments")
          .select("id", { count: "exact", head: true });
        if (filter) q = q.or(filter);
        else q = q.ilike("notes", `${marker}%`);
        return q;
      };

      const totalRes = await buildQuery();
      if (totalRes.error) throw new Error(totalRes.error.message);

      const activeRes = await buildQuery().in("status", ["new", "confirmed"]);

      if (activeRes.error) throw new Error(activeRes.error.message);

      return {
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
      };
    },
  );

/* -------------------- cancelDependentActiveAppointments -------------------- */

/**
 * Cancels every active (new/confirmed) appointment attached to the
 * dependent and frees any linked availability slot. Used by the delete
 * dialog so guardians can unblock deletion in one action.
 */
export const cancelDependentActiveAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ dependent_id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ cancelled: number }> => {
    const { supabase, userId } = context;

    const { data: dep, error: depErr } = await supabase
      .from("dependents")
      .select("id, patient_id")
      .eq("id", data.dependent_id)
      .eq("guardian_user_id", userId)
      .maybeSingle();
    if (depErr) throw new Error(depErr.message);
    if (!dep) throw new Error("Not found");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const marker = `dependent:${dep.id}`;
    let selectQ = supabaseAdmin
      .from("appointments")
      .select("id")
      .in("status", ["new", "confirmed"]);
    selectQ = dep.patient_id
      ? selectQ.or(`notes.ilike.${marker}%,patient_id.eq.${dep.patient_id}`)
      : selectQ.ilike("notes", `${marker}%`);

    const { data: rows, error: selErr } = await selectQ;
    if (selErr) throw new Error(selErr.message);
    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) return { cancelled: 0 };

    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ status: "cancelled", cancelled_at: nowIso })
      .in("id", ids);
    if (updErr) throw new Error(updErr.message);

    // Free any linked availability slots so the doctor's schedule reopens.
    await supabaseAdmin
      .from("availability_slots")
      .update({ status: "available", appointment_id: null })
      .in("appointment_id", ids);

    // Audit trail: who cancelled, when, and how many appointments were cancelled.
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      ip =
        getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
        getRequestHeader("cf-connecting-ip") ??
        null;
      ua = getRequestHeader("user-agent") ?? null;
    } catch {
      /* headers unavailable outside request scope */
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      actor_role: "guardian",
      action: "dependent_appointments_cancelled",
      entity_type: "dependent",
      entity_id: dep.id,
      before_data: { active_appointment_ids: ids, active_count: ids.length },
      after_data: { status: "cancelled", cancelled_at: nowIso },
      ip_address: ip,
      user_agent: ua,
      metadata: {
        dependent_id: dep.id,
        cancelled_count: ids.length,
        appointment_ids: ids,
        cancelled_at: nowIso,
        source: "portal.family.delete_dialog",
      },
    });

    return { cancelled: ids.length };
  });




