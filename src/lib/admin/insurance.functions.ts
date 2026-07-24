/**
 * Admin — Insurance approvals.
 * Lists insurance approval requests across the platform with optional branch
 * scoping (via linked appointment) and reads a single approval with full
 * patient + provider + appointment context. Guarded by `admin`/`super_admin`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  branch_id: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
  provider_id: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const APPROVAL_COLUMNS =
  "id, request_number, service_description, status, submitted_at, reviewed_at, expires_at, " +
  "approved_amount, patient_share, missing_documents, attachments, notes, is_mock, created_at, updated_at, " +
  "patient:patients(id, full_name_ar, full_name_en, mrn, phone), " +
  "provider:insurance_providers(id, name_ar, name_en), " +
  "appointment:appointments(id, appointment_date, branch_id, doctor_id, branch:branches(id, name_ar, name_en))";

export const listAdminInsuranceApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    const joinKind = data.branch_id ? "appointments!inner" : "appointments";
    const selection = APPROVAL_COLUMNS.replace(
      "appointment:appointments(",
      `appointment:${joinKind}(`,
    );

    let q = context.supabase
      .from("insurance_approvals")
      .select(selection, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.branch_id) q = q.eq("appointment.branch_id", data.branch_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.provider_id) q = q.eq("insurance_provider_id", data.provider_id);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(data.to).toISOString());
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`request_number.ilike.${like},service_description.ilike.${like},notes.ilike.${like}`);
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminInsuranceApproval = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data: row, error } = await context.supabase
      .from("insurance_approvals")
      .select(APPROVAL_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("طلب التأمين غير موجود");
    return row;
  });

export const listInsuranceProvidersForFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data, error } = await context.supabase
      .from("insurance_providers")
      .select("id, name_ar, name_en")
      .order("name_ar", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
