/**
 * Advanced patients management server functions — role-gated staff operations
 * for listing with filters/pagination, updating status, bulk status, and tags.
 * RLS applies via the request user's bearer.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "reception" | "pharmacy" | "super_admin" | "doctor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRoles(sb: any, userId: string): Promise<Role[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.role as Role);
}
function ensureStaff(roles: Role[]) {
  const ok = roles.some((r) =>
    (["admin", "super_admin", "reception", "doctor"] as Role[]).includes(r),
  );
  if (!ok) throw new Error("ليست لديك الصلاحية.");
}
function ensureAdmin(roles: Role[]) {
  const ok = roles.some((r) => (["admin", "super_admin"] as Role[]).includes(r));
  if (!ok) throw new Error("هذه العملية للمشرفين فقط.");
}

const STATUS_VALUES = ["active", "inactive", "archived", "deceased"] as const;
export type PatientStatus = (typeof STATUS_VALUES)[number];

const ListInput = z.object({
  q: z.string().trim().max(120).optional(),
  branchId: z.string().uuid().nullable().optional(),
  status: z.enum(STATUS_VALUES).nullable().optional(),
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
  tag: z.string().trim().max(40).nullable().optional(),
  minAge: z.number().int().min(0).max(150).nullable().optional(),
  maxAge: z.number().int().min(0).max(150).nullable().optional(),
  createdFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  createdTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  includeInactive: z.boolean().default(false),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
});

export type PatientRow = {
  id: string;
  mrn: string;
  full_name_ar: string;
  full_name_en: string | null;
  phone: string;
  national_id: string | null;
  gender: "male" | "female" | "other" | null;
  date_of_birth: string | null;
  branch_id: string;
  branch_name_ar: string | null;
  status: PatientStatus;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const listPatientsAdvanced = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    let q = sb
      .from("patients")
      .select(
        "id, mrn, full_name_ar, full_name_en, phone, national_id, gender, date_of_birth, branch_id, status, tags, is_active, created_at, updated_at, branches(name_ar)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    // Soft-delete filter: hide is_active=false unless explicitly requested
    if (!data.includeInactive) q = q.eq("is_active", true);

    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.status) q = q.eq("status", data.status);
    if (data.gender) q = q.eq("gender", data.gender);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (data.createdFrom) q = q.gte("created_at", `${data.createdFrom}T00:00:00`);
    if (data.createdTo) q = q.lte("created_at", `${data.createdTo}T23:59:59`);

    // Age → DOB range (approximate on year boundaries)
    if (data.minAge != null || data.maxAge != null) {
      const today = new Date();
      if (data.maxAge != null) {
        const d = new Date(today);
        d.setFullYear(d.getFullYear() - data.maxAge - 1);
        d.setDate(d.getDate() + 1);
        q = q.gte("date_of_birth", d.toISOString().slice(0, 10));
      }
      if (data.minAge != null) {
        const d = new Date(today);
        d.setFullYear(d.getFullYear() - data.minAge);
        q = q.lte("date_of_birth", d.toISOString().slice(0, 10));
      }
    }

    if (data.q) {
      const t = data.q.replace(/[,()]/g, " ").trim();
      q = q.or(
        `full_name_ar.ilike.%${t}%,full_name_en.ilike.%${t}%,phone.ilike.%${t}%,mrn.ilike.%${t}%,national_id.ilike.%${t}%`,
      );
    }

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    q = q.range(from, to);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: PatientRow[] = ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      mrn: r.mrn,
      full_name_ar: r.full_name_ar,
      full_name_en: r.full_name_en,
      phone: r.phone,
      national_id: r.national_id,
      gender: r.gender,
      date_of_birth: r.date_of_birth,
      branch_id: r.branch_id,
      branch_name_ar: r.branches?.name_ar ?? null,
      status: r.status,
      tags: r.tags ?? [],
      is_active: r.is_active,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    return { rows: mapped, total: count ?? mapped.length };
  });

const UpdateStatusInput = z.object({
  patientId: z.string().uuid(),
  status: z.enum(STATUS_VALUES),
  reason: z.string().trim().max(500).optional(),
});

export const updatePatientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => UpdateStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);

    const { data: current, error: readErr } = await sb
      .from("patients")
      .select("id, status, full_name_ar")
      .eq("id", data.patientId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("المريض غير موجود.");

    const { error } = await sb
      .from("patients")
      .update({ status: data.status })
      .eq("id", data.patientId);
    if (error) throw new Error(error.message);

    try {
      await sb.rpc("log_security_event", {
        _action: "patient.status_changed",
        _reason: data.reason ?? null,
        _metadata: {
          patient_id: data.patientId,
          patient_name: current.full_name_ar,
          from: current.status,
          to: data.status,
        },
      });
    } catch (e) {
      console.warn("[patients] audit failed", e);
    }

    return { ok: true, previous: current.status as PatientStatus };
  });

const BulkStatusInput = z.object({
  patientIds: z.array(z.string().uuid()).min(1).max(200),
  status: z.enum(STATUS_VALUES),
  reason: z.string().trim().max(500).optional(),
});

export const bulkUpdatePatientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => BulkStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureAdmin(roles);

    const { error, count } = await sb
      .from("patients")
      .update({ status: data.status }, { count: "exact" })
      .in("id", data.patientIds);
    if (error) throw new Error(error.message);

    try {
      await sb.rpc("log_security_event", {
        _action: "patient.bulk_status_changed",
        _reason: data.reason ?? null,
        _metadata: {
          count: count ?? data.patientIds.length,
          ids: data.patientIds,
          to: data.status,
        },
      });
    } catch (e) {
      console.warn("[patients] bulk audit failed", e);
    }

    return { ok: true, updated: count ?? data.patientIds.length };
  });

const UpdateTagsInput = z.object({
  patientId: z.string().uuid(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});

export const updatePatientTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => UpdateTagsInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);
    const normalized = Array.from(new Set(data.tags.map((t) => t.trim()).filter(Boolean)));
    const { error } = await sb
      .from("patients")
      .update({ tags: normalized })
      .eq("id", data.patientId);
    if (error) throw new Error(error.message);
    return { ok: true, tags: normalized };
  });

export const listPatientTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureStaff(roles);
    const { data, error } = await sb
      .from("patients")
      .select("tags")
      .eq("is_active", true)
      .limit(2000);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).forEach((r: any) => (r.tags ?? []).forEach((t: string) => set.add(t)));
    return Array.from(set).sort();
  });

// -------------------- Soft delete / restore --------------------

const SoftDeleteInput = z.object({
  patientId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const softDeletePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => SoftDeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureAdmin(roles);

    const { data: current, error: readErr } = await sb
      .from("patients")
      .select("id, is_active, status, full_name_ar")
      .eq("id", data.patientId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("المريض غير موجود.");
    if (current.is_active === false) {
      return { ok: true, alreadyInactive: true };
    }

    const { error } = await sb
      .from("patients")
      .update({ is_active: false, status: "archived" })
      .eq("id", data.patientId);
    if (error) throw new Error(error.message);

    try {
      await sb.rpc("log_security_event", {
        _action: "patient.soft_deleted",
        _reason: data.reason ?? null,
        _metadata: {
          patient_id: data.patientId,
          patient_name: current.full_name_ar,
          previous_status: current.status,
        },
      });
    } catch (e) {
      console.warn("[patients] soft-delete audit failed", e);
    }

    return { ok: true };
  });

export const restorePatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => SoftDeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const roles = await getRoles(sb, context.userId);
    ensureAdmin(roles);

    const { data: current, error: readErr } = await sb
      .from("patients")
      .select("id, is_active, full_name_ar")
      .eq("id", data.patientId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("المريض غير موجود.");
    if (current.is_active === true) {
      return { ok: true, alreadyActive: true };
    }

    const { error } = await sb
      .from("patients")
      .update({ is_active: true, status: "active" })
      .eq("id", data.patientId);
    if (error) throw new Error(error.message);

    try {
      await sb.rpc("log_security_event", {
        _action: "patient.restored",
        _reason: data.reason ?? null,
        _metadata: {
          patient_id: data.patientId,
          patient_name: current.full_name_ar,
        },
      });
    } catch (e) {
      console.warn("[patients] restore audit failed", e);
    }

    return { ok: true };
  });
