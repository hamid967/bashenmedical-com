import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ---------- helpers ---------- */

async function resolvePatientId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("patients")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

async function loadInvoicePayments(supabase: any, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return new Map<string, number>();
  const { data } = await supabase
    .from("payments")
    .select("invoice_id, amount, status")
    .in("invoice_id", invoiceIds);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { invoice_id: string; amount: number; status: string }[]) {
    if (row.status !== "succeeded" && row.status !== "completed" && row.status !== "paid") continue;
    map.set(row.invoice_id, (map.get(row.invoice_id) ?? 0) + Number(row.amount ?? 0));
  }
  return map;
}

/* ---------- listMyInvoices ---------- */

const ListSchema = z.object({
  status: z.enum(["all", "outstanding", "paid"]).default("all"),
  limit: z.number().int().min(1).max(100).default(50),
});

export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patientId = await resolvePatientId(supabase, userId);
    if (!patientId)
      return { invoices: [], summary: { total: 0, paid: 0, outstanding: 0, count: 0 } };

    let q = supabase
      .from("invoices")
      .select(
        "id, invoice_number, total, currency, status, issued_at, paid_at, appointment_id, pdf_path, notes",
      )
      .eq("patient_id", patientId)
      .order("issued_at", { ascending: false })
      .limit(data.limit);

    if (data.status === "outstanding") {
      q = q.in("status", ["unpaid", "pending", "partially_paid"]);
    } else if (data.status === "paid") {
      q = q.in("status", ["paid", "settled"]);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    const paidMap = await loadInvoicePayments(supabase, ids);

    const invoices = (rows ?? []).map((r: any) => {
      const paid = paidMap.get(r.id) ?? 0;
      const total = Number(r.total ?? 0);
      return {
        id: r.id as string,
        invoice_number: r.invoice_number as string | null,
        total,
        paid_amount: paid,
        due_amount: Math.max(0, total - paid),
        currency: r.currency as string,
        status: r.status as string,
        issued_at: r.issued_at as string,
        paid_at: r.paid_at as string | null,
        appointment_id: r.appointment_id as string | null,
        pdf_path: r.pdf_path as string | null,
        notes: r.notes as string | null,
      };
    });

    // Summary across ALL invoices for this patient (not just the filtered page)
    const { data: allRows } = await supabase
      .from("invoices")
      .select("id, total, status")
      .eq("patient_id", patientId);
    const allIds = (allRows ?? []).map((r: any) => r.id);
    const allPaidMap = await loadInvoicePayments(supabase, allIds);
    let totalSum = 0;
    let paidSum = 0;
    for (const r of (allRows ?? []) as any[]) {
      totalSum += Number(r.total ?? 0);
      paidSum += allPaidMap.get(r.id) ?? 0;
    }
    return {
      invoices,
      summary: {
        total: totalSum,
        paid: paidSum,
        outstanding: Math.max(0, totalSum - paidSum),
        count: (allRows ?? []).length,
      },
    };
  });

/* ---------- getMyInvoice ---------- */

export const getMyInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patientId = await resolvePatientId(supabase, userId);
    if (!patientId) throw new Error("لا يوجد ملف مريض مربوط بحسابك");

    const { data: inv, error } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, total, currency, status, issued_at, paid_at, appointment_id, pdf_path, notes, patient_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv || inv.patient_id !== patientId) throw new Error("الفاتورة غير موجودة");

    const { data: pays } = await supabase
      .from("payments")
      .select(
        "id, amount, currency, method, status, gateway, gateway_ref, paid_at, created_at, is_mock",
      )
      .eq("invoice_id", data.id)
      .order("created_at", { ascending: false });

    const paid = (pays ?? [])
      .filter((p: any) => ["succeeded", "completed", "paid"].includes(p.status))
      .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

    const total = Number(inv.total ?? 0);
    return {
      invoice: {
        id: inv.id as string,
        invoice_number: inv.invoice_number as string | null,
        total,
        paid_amount: paid,
        due_amount: Math.max(0, total - paid),
        currency: inv.currency as string,
        status: inv.status as string,
        issued_at: inv.issued_at as string,
        paid_at: inv.paid_at as string | null,
        appointment_id: inv.appointment_id as string | null,
        pdf_path: inv.pdf_path as string | null,
        notes: inv.notes as string | null,
      },
      payments: (pays ?? []) as Array<{
        id: string;
        amount: number;
        currency: string;
        method: string;
        status: string;
        gateway: string | null;
        gateway_ref: string | null;
        paid_at: string | null;
        created_at: string;
        is_mock: boolean;
      }>,
    };
  });

/* ---------- listMyPayments ---------- */

export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const patientId = await resolvePatientId(supabase, userId);
    if (!patientId) return { payments: [] };

    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("patient_id", patientId);
    const invIds = (invs ?? []).map((r: any) => r.id);
    if (invIds.length === 0) return { payments: [] };
    const numberByInvoice = new Map<string, string | null>(
      (invs ?? []).map((r: any) => [r.id as string, (r.invoice_number as string | null) ?? null]),
    );

    const { data: pays, error } = await supabase
      .from("payments")
      .select(
        "id, invoice_id, amount, currency, method, status, gateway, gateway_ref, paid_at, created_at, is_mock",
      )
      .in("invoice_id", invIds)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    return {
      payments: (pays ?? []).map((p: any) => ({
        ...p,
        invoice_number: numberByInvoice.get(p.invoice_id) ?? null,
      })) as Array<{
        id: string;
        invoice_id: string;
        invoice_number: string | null;
        amount: number;
        currency: string;
        method: string;
        status: string;
        gateway: string | null;
        gateway_ref: string | null;
        paid_at: string | null;
        created_at: string;
        is_mock: boolean;
      }>,
    };
  });

/* ---------- createDemoInvoicePayment ---------- */

const PayMethod = z.enum(["card", "mada", "apple_pay", "bank_transfer", "counter"]);
const PaySchema = z.object({
  invoice_id: z.string().uuid(),
  method: PayMethod.default("card"),
  amount: z.number().positive().optional(),
});

export const createDemoInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => PaySchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patientId = await resolvePatientId(supabase, userId);
    if (!patientId) throw new Error("لا يوجد ملف مريض مربوط بحسابك");

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, total, currency, status, patient_id")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!inv || inv.patient_id !== patientId) throw new Error("الفاتورة غير موجودة");

    // Compute remaining amount
    const { data: existing } = await supabase
      .from("payments")
      .select("amount, status")
      .eq("invoice_id", inv.id);
    const paid = (existing ?? [])
      .filter((p: any) => ["succeeded", "completed", "paid"].includes(p.status))
      .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const remaining = Math.max(0, Number(inv.total ?? 0) - paid);
    if (remaining <= 0) throw new Error("الفاتورة مسددة بالكامل");

    const amount = data.amount ?? remaining;
    if (amount > remaining + 0.01) throw new Error("المبلغ يتجاوز المتبقي");

    // Patient can INSERT payment via RLS; mark as mock/demo
    const { data: payRow, error: payErr } = await supabase
      .from("payments")
      .insert({
        invoice_id: inv.id,
        amount,
        currency: inv.currency,
        method: data.method,
        status: "succeeded",
        gateway: "demo",
        is_mock: true,
        paid_at: new Date().toISOString(),
        metadata: { source: "patient_portal_demo" },
      })
      .select("id")
      .single();
    if (payErr) throw new Error(payErr.message);

    // Update invoice status via admin (billing.manage required otherwise)
    const newPaid = paid + amount;
    const invoiceStatus = newPaid + 0.01 >= Number(inv.total ?? 0) ? "paid" : "partially_paid";
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("invoices")
        .update({
          status: invoiceStatus,
          paid_at: invoiceStatus === "paid" ? new Date().toISOString() : null,
        })
        .eq("id", inv.id);
    } catch {
      // Non-fatal: invoice status can be reconciled by billing team
    }

    return { ok: true, payment_id: payRow?.id as string, invoice_status: invoiceStatus };
  });
