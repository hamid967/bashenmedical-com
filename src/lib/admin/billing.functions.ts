/**
 * Admin — Billing / Invoices.
 * Lists invoices scoped by branch (via linked appointment) and reads a single
 * invoice with full patient + appointment + branch context. Guarded by
 * `admin`/`super_admin` (see `_guard.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  branch_id: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const INVOICE_COLUMNS =
  "id, invoice_number, total, currency, status, issued_at, paid_at, notes, pdf_path, created_at, " +
  "patient:patients(id, full_name_ar, full_name_en, mrn, phone), " +
  "appointment:appointments(id, appointment_date, branch_id, doctor_id, branch:branches(id, name_ar, name_en))";

export const listAdminInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    // Use inner join on appointments when filtering by branch so PostgREST
    // applies the nested filter as a real WHERE clause.
    const joinKind = data.branch_id ? "appointments!inner" : "appointments";
    const selection = INVOICE_COLUMNS.replace(
      "appointment:appointments(",
      `appointment:${joinKind}(`,
    );

    let q = context.supabase
      .from("invoices")
      .select(selection, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.branch_id) q = q.eq("appointment.branch_id", data.branch_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(data.to).toISOString());
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`invoice_number.ilike.${like},notes.ilike.${like}`);
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data: row, error } = await context.supabase
      .from("invoices")
      .select(INVOICE_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الفاتورة غير موجودة");
    return row;
  });
