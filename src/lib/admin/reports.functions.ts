/**
 * Admin — Reports queue (medical / lab / radiology).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  kind: z.enum(["medical", "lab", "radiology"]).default("medical"),
  status: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const listAdminReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const patientJoin = "patient:patients(id, full_name_ar, full_name_en, mrn, phone)";
    let table: string;
    let cols: string;
    let dateCol = "created_at";
    if (data.kind === "medical") {
      table = "medical_reports";
      cols = `id, title_ar, title_en, report_type, status, published_at, created_at, ${patientJoin}`;
    } else if (data.kind === "lab") {
      table = "lab_reports";
      cols = `id, title, test_type, status, report_date, released_at, created_at, ${patientJoin}`;
      dateCol = "report_date";
    } else {
      table = "radiology_reports";
      cols = `id, title, modality, status, report_date, released_at, created_at, ${patientJoin}`;
      dateCol = "report_date";
    }
    let q: unknown = (context.supabase as unknown)
      .from(table)
      .select(cols, { count: "exact" })
      .order(dateCol, { ascending: false, nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte(dateCol, data.from);
    if (data.to) q = q.lte(dateCol, data.to);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      if (data.kind === "medical") {
        q = q.or(`title_ar.ilike.${like},title_en.ilike.${like}`);
      } else {
        q = q.or(`title.ilike.${like}`);
      }
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, kind: data.kind };
  });
