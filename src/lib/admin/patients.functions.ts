/**
 * Admin — Patients. Search + detail. Guarded by admin.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  branch_id: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const COLS =
  "id, mrn, full_name_ar, full_name_en, phone, gender, date_of_birth, city, is_active, created_at, " +
  "branch:branches(id, name_ar, name_en)";

export const listAdminPatients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    let q = context.supabase
      .from("patients")
      .select(COLS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(
        `full_name_ar.ilike.${like},full_name_en.ilike.${like},mrn.ilike.${like},phone.ilike.${like}`,
      );
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminPatient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data: patient, error } = await context.supabase
      .from("patients")
      .select(
        COLS +
          ", national_id, email, blood_type, marital_status, nationality, address, emergency_contact_name, emergency_contact_phone, notes, tags, status",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!patient) throw new Error("المريض غير موجود");
    return { patient };
  });
