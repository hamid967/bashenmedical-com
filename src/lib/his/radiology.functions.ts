/**
 * HIS — Radiology technician workspace server functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "@/lib/admin/_guard";

export type AdminRadiologyReport = {
  id: string;
  patient_id: string | null;
  modality: string | null;
  body_part: string | null;
  findings: string | null;
  status: string | null;
  report_date: string | null;
  file_path: string | null;
  ordered_by: string | null;
  released_at: string | null;
  created_at: string;
  patient?: { id: string; full_name_ar: string | null; mrn: string | null; phone: string | null } | null;
};

async function assertRadAccess(ctx: { supabase: any; userId: string }) {
  const [a, d] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "doctor" }),
  ]);
  if (a.data !== true && d.data !== true) {
    await assertHasRole(ctx.supabase, ctx.userId, "admin");
  }
}

const ListInput = z
  .object({
    status: z.enum(["all", "pending", "in_progress", "released"]).default("all"),
    modality: z.string().trim().max(40).optional(),
    q: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .default({});

export const listAdminRadiologyReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertRadAccess(context);
    let q: any = context.supabase
      .from("radiology_reports")
      .select(
        "id, patient_id, modality, body_part, findings, status, report_date, file_path, ordered_by, released_at, created_at, patient:patients(id, full_name_ar, mrn, phone)",
        { count: "exact" },
      )
      .order("report_date", { ascending: false, nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.status === "released") q = q.not("released_at", "is", null);
    else if (data.status === "pending") q = q.is("released_at", null).eq("status", "pending");
    else if (data.status === "in_progress") q = q.is("released_at", null).eq("status", "in_progress");
    if (data.modality) q = q.eq("modality", data.modality);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`modality.ilike.${like},body_part.ilike.${like},findings.ilike.${like}`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as AdminRadiologyReport[], total: count ?? 0 };
  });

const UpsertInput = z.object({
  id: z.string().uuid().nullable().optional(),
  patient_id: z.string().uuid(),
  modality: z.string().trim().min(1).max(80),
  body_part: z.string().trim().max(120).nullable().optional(),
  findings: z.string().trim().max(8000).nullable().optional(),
  status: z.enum(["pending", "in_progress", "released"]).default("pending"),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  file_path: z.string().trim().max(1024).nullable().optional(),
});

export const upsertRadiologyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRadAccess(context);
    const payload: Record<string, unknown> = {
      patient_id: data.patient_id,
      modality: data.modality,
      body_part: data.body_part ?? null,
      findings: data.findings ?? null,
      status: data.status,
      report_date: data.report_date ?? null,
      file_path: data.file_path ?? null,
      ordered_by: context.userId,
    };
    if (data.id) {
      const { error } = await (context.supabase as any).from("radiology_reports").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await (context.supabase as any)
      .from("radiology_reports")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

const IdInput = z.object({ id: z.string().uuid() });

export const releaseRadiologyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRadAccess(context);
    const { error } = await context.supabase
      .from("radiology_reports")
      .update({ released_at: new Date().toISOString(), status: "released" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unreleaseRadiologyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRadAccess(context);
    const { error } = await context.supabase
      .from("radiology_reports")
      .update({ released_at: null, status: "in_progress" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRadiologyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRadAccess(context);
    const { error } = await context.supabase.from("radiology_reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
