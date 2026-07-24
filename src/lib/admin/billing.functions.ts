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

// ---------------------------------------------------------------
// Batch B3 — Billing state machine (Estimate → Invoice → Payment
// → Refund) with idempotency guardrails. Provider integration is
// deferred until a payment gateway is enabled by the owner; until
// then, `recordPayment` supports staff-recorded manual receipts
// (cash / bank_transfer / insurance / other) which is what the
// Front Desk / cashier flows need on day one.
// ---------------------------------------------------------------
import { assertHasAnyRole } from "./_guard";

async function requirePermission(
  supabase: any,
  userId: string,
  key: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission_key: key,
  });
  if (error) throw new Error("تعذّر التحقق من الصلاحية.");
  if (data !== true) throw new Error("ليست لديك صلاحية إدارة الفوترة.");
}

// -------- recordPayment (idempotent) --------
export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        amount: z.number().positive().max(1_000_000),
        method: z.enum([
          "mada",
          "visa",
          "mastercard",
          "apple_pay",
          "stc_pay",
          "cash",
          "bank_transfer",
          "insurance",
          "other",
        ]),
        gateway: z.string().trim().max(40).nullable().optional(),
        gateway_ref: z.string().trim().max(120).nullable().optional(),
        idempotency_key: z.string().trim().min(6).max(120),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin"]);
    await requirePermission(context.supabase, context.userId, "billing.manage");

    // Idempotency: return existing row when the same key was used.
    const { data: existing } = await context.supabase
      .from("payments")
      .select("id, status, amount")
      .eq("idempotency_key", data.idempotency_key)
      .maybeSingle();
    if (existing) return { payment_id: existing.id, deduplicated: true };

    const { data: inv, error: e0 } = await context.supabase
      .from("invoices")
      .select("id, total, currency, status")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!inv) throw new Error("الفاتورة غير موجودة.");
    if (inv.status === "cancelled") throw new Error("لا يمكن تسجيل دفعة على فاتورة ملغاة.");

    const { data: ins, error } = await context.supabase
      .from("payments")
      .insert({
        invoice_id: data.invoice_id,
        amount: data.amount,
        currency: inv.currency ?? "SAR",
        method: data.method,
        gateway: data.gateway ?? null,
        gateway_ref: data.gateway_ref ?? null,
        idempotency_key: data.idempotency_key,
        status: "succeeded",
        paid_at: new Date().toISOString(),
        metadata: data.note ? { note: data.note } : null,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Recompute invoice status: paid/partial based on sum of succeeded payments.
    const { data: sums } = await context.supabase
      .from("payments")
      .select("amount, status")
      .eq("invoice_id", data.invoice_id);
    const paid = (sums ?? [])
      .filter((p: any) => p.status === "succeeded")
      .reduce((a: number, b: any) => a + Number(b.amount), 0);
    const nextStatus =
      paid >= Number(inv.total) ? "paid" : paid > 0 ? "partially_paid" : "pending";
    await context.supabase
      .from("invoices")
      .update({
        status: nextStatus,
        paid_at: nextStatus === "paid" ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.invoice_id);

    return { payment_id: ins!.id, deduplicated: false, invoice_status: nextStatus };
  });

// -------- voidInvoice --------
export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin"]);
    await requirePermission(context.supabase, context.userId, "billing.manage");

    const { data: inv } = await context.supabase
      .from("invoices")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!inv) throw new Error("الفاتورة غير موجودة.");
    if (inv.status === "paid" || inv.status === "partially_paid")
      throw new Error("لا يمكن إلغاء فاتورة مدفوعة (كليًا أو جزئيًا) — أنشئ استرداد بدلاً من الإلغاء.");
    if (inv.status === "cancelled") throw new Error("الفاتورة ملغاة مسبقاً.");

    const { error } = await context.supabase
      .from("invoices")
      .update({ status: "cancelled", notes: data.reason } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// -------- Refund lifecycle --------
export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        payment_id: z.string().uuid(),
        amount: z.number().positive().max(1_000_000),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin"]);
    await requirePermission(context.supabase, context.userId, "billing.manage");

    const { data: pay } = await context.supabase
      .from("payments")
      .select("id, amount, status")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (!pay) throw new Error("الدفعة غير موجودة.");
    if (pay.status !== "succeeded")
      throw new Error("يمكن استرداد الدفعات الناجحة فقط.");
    if (Number(data.amount) > Number(pay.amount))
      throw new Error("قيمة الاسترداد تتجاوز قيمة الدفعة.");

    const receipt = `RF-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: ins, error } = await context.supabase
      .from("refunds")
      .insert({
        payment_id: data.payment_id,
        amount: data.amount,
        reason: data.reason,
        status: "pending",
        requested_by: context.userId,
        receipt_reference: receipt,
      } as never)
      .select("id, receipt_reference")
      .single();
    if (error) throw new Error(error.message);
    return { refund_id: ins!.id, receipt_reference: ins!.receipt_reference };
  });

export const decideRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "completed"]),
        decision_reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin"]);
    await requirePermission(context.supabase, context.userId, "billing.manage");

    const { data: cur } = await context.supabase
      .from("refunds")
      .select("id, status, payment_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!cur) throw new Error("طلب الاسترداد غير موجود.");

    const legal: Record<string, string[]> = {
      pending: ["approved", "rejected"],
      approved: ["completed", "rejected"],
      completed: [],
      rejected: [],
    };
    if (!legal[cur.status]?.includes(data.decision))
      throw new Error(`الانتقال ${cur.status} → ${data.decision} غير مسموح.`);

    const patch: any = {
      status: data.decision,
      approved_by: context.userId,
      decision_reason: data.decision_reason ?? null,
    };
    if (data.decision === "completed") patch.processed_at = new Date().toISOString();

    const { error } = await context.supabase
      .from("refunds")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Mark invoice as refunded when the whole payment is completed-refunded.
    if (data.decision === "completed") {
      const { data: pay } = await context.supabase
        .from("payments")
        .select("invoice_id, amount")
        .eq("id", cur.payment_id)
        .maybeSingle();
      if (pay) {
        await context.supabase
          .from("invoices")
          .update({ status: "refunded" } as never)
          .eq("id", pay.invoice_id);
      }
    }
    return { ok: true as const };
  });

// -------- List refunds for an invoice (admin drawer) --------
export const listInvoiceRefunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin"]);
    const { data: pays } = await context.supabase
      .from("payments")
      .select(
        "id, amount, method, status, paid_at, gateway_ref, refunds(id, amount, reason, status, receipt_reference, created_at, processed_at, decision_reason)",
      )
      .eq("invoice_id", data.invoice_id)
      .order("created_at", { ascending: false });
    return { payments: pays ?? [] };
  });
