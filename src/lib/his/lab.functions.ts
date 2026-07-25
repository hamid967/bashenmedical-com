/**
 * HIS — Lab technician workspace server functions.
 * Admin/doctor roles can list, create/edit, release, and delete lab reports.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "@/lib/admin/_guard";

export type AdminLabReport = {
  id: string;
  patient_id: string | null;
  title: string | null;
  test_type: string | null;
  summary: string | null;
  status: string | null;
  report_date: string | null;
  file_path: string | null;
  ordered_by: string | null;
  released_at: string | null;
  created_at: string;
  patient?: { id: string; full_name_ar: string | null; mrn: string | null; phone: string | null } | null;
};

async function assertLabAccess(ctx: { supabase: any; userId: string }) {
  // Admin or doctor may operate on lab_reports (RLS aligned).
  const [a, d] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "doctor" }),
  ]);
  if (a.data !== true && d.data !== true) {
    // fall back to unified admin check (super_admin OK)
    await assertHasRole(ctx.supabase, ctx.userId, "admin");
  }
}

const ListInput = z
  .object({
    status: z.enum(["all", "pending", "in_progress", "released"]).default("all"),
    q: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .default({});

export const listAdminLabReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertLabAccess(context);
    let q: any = context.supabase
      .from("lab_reports")
      .select(
        "id, patient_id, title, test_type, summary, status, report_date, file_path, ordered_by, released_at, created_at, patient:patients(id, full_name_ar, mrn, phone)",
        { count: "exact" },
      )
      .order("report_date", { ascending: false, nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.status === "released") q = q.not("released_at", "is", null);
    else if (data.status === "pending") q = q.is("released_at", null).eq("status", "pending");
    else if (data.status === "in_progress") q = q.is("released_at", null).eq("status", "in_progress");
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`title.ilike.${like},test_type.ilike.${like}`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as AdminLabReport[], total: count ?? 0 };
  });

const UpsertInput = z.object({
  id: z.string().uuid().nullable().optional(),
  patient_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  test_type: z.string().trim().max(120).nullable().optional(),
  summary: z.string().trim().max(4000).nullable().optional(),
  status: z.enum(["pending", "in_progress", "released"]).default("pending"),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  file_path: z.string().trim().max(1024).nullable().optional(),
});

export const upsertLabReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertLabAccess(context);
    const payload: Record<string, unknown> = {
      patient_id: data.patient_id,
      title: data.title,
      test_type: data.test_type ?? null,
      summary: data.summary ?? null,
      status: data.status,
      report_date: data.report_date ?? null,
      file_path: data.file_path ?? null,
      ordered_by: context.userId,
    };
    if (data.id) {
      const { error } = await (context.supabase as any).from("lab_reports").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await (context.supabase as any)
      .from("lab_reports")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

const IdInput = z.object({ id: z.string().uuid() });

export const releaseLabReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertLabAccess(context);
    const { error } = await context.supabase
      .from("lab_reports")
      .update({ released_at: new Date().toISOString(), status: "released" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unreleaseLabReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertLabAccess(context);
    const { error } = await context.supabase
      .from("lab_reports")
      .update({ released_at: null, status: "in_progress" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLabReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertLabAccess(context);
    const { error } = await context.supabase.from("lab_reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PatientSearch = z.object({ q: z.string().trim().min(1).max(80) });

export const searchLabPatients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PatientSearch.parse(d))
  .handler(async ({ data, context }) => {
    await assertLabAccess(context);
    const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
    const { data: rows, error } = await context.supabase
      .from("patients")
      .select("id, full_name_ar, mrn, phone")
      .or(`full_name_ar.ilike.${like},mrn.ilike.${like},phone.ilike.${like}`)
      .limit(20);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
