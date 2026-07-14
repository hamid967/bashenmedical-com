import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function resolvePatientId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("patients")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

/* ---------- listMyRefunds ---------- */

export const listMyRefunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const patientId = await resolvePatientId(supabase, userId);
    if (!patientId) return { refunds: [] };

    // Get all invoice ids and payment ids for this patient
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_number, currency")
      .eq("patient_id", patientId);
    const invIds = (invs ?? []).map((r: any) => r.id);
    if (invIds.length === 0) return { refunds: [] };

    const { data: pays } = await supabase
      .from("payments")
      .select("id, invoice_id, amount, method, gateway, paid_at")
      .in("invoice_id", invIds);
    const payIds = (pays ?? []).map((p: any) => p.id);
    if (payIds.length === 0) return { refunds: [] };

    const payById = new Map<string, any>((pays ?? []).map((p: any) => [p.id, p]));
    const invById = new Map<string, any>((invs ?? []).map((i: any) => [i.id, i]));

    const { data: rows, error } = await supabase
      .from("refunds")
      .select("id, payment_id, amount, reason, status, requested_by, approved_by, is_mock, decision_reason, processed_at, created_at, updated_at, receipt_reference")
      .in("payment_id", payIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return {
      refunds: (rows ?? []).map((r: any) => {
        const pay = payById.get(r.payment_id);
        const inv = pay ? invById.get(pay.invoice_id) : null;
        return {
          id: r.id as string,
          payment_id: r.payment_id as string,
          invoice_id: (pay?.invoice_id ?? null) as string | null,
          invoice_number: (inv?.invoice_number ?? null) as string | null,
          currency: (inv?.currency ?? "SAR") as string,
          amount: Number(r.amount ?? 0),
          reason: r.reason as string | null,
          status: r.status as string,
          is_mock: !!r.is_mock,
          decision_reason: (r.decision_reason ?? null) as string | null,
          processed_at: (r.processed_at ?? null) as string | null,
          created_at: r.created_at as string,
          updated_at: r.updated_at as string,
          has_decision_maker: !!r.approved_by,
          receipt_reference: (r.receipt_reference ?? null) as string | null,
          payment_amount: Number(pay?.amount ?? 0),
          payment_method: (pay?.method ?? null) as string | null,
          payment_paid_at: (pay?.paid_at ?? null) as string | null,
        };
      }),
    };
  });

/* ---------- requestRefund ---------- */

const RequestSchema = z.object({
  payment_id: z.string().uuid(),
  amount: z.number().positive().optional(),
  reason: z.string().trim().min(3).max(500),
});

export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RequestSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patientId = await resolvePatientId(supabase, userId);
    if (!patientId) throw new Error("لا يوجد ملف مريض مربوط بحسابك");

    // Validate payment belongs to patient, is refundable, and compute already-refunded
    const { data: pay, error: payErr } = await supabase
      .from("payments")
      .select("id, invoice_id, amount, status, currency")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (payErr) throw new Error(payErr.message);
    if (!pay) throw new Error("لم يتم العثور على الدفعة");

    const { data: inv } = await supabase
      .from("invoices")
      .select("id, patient_id")
      .eq("id", pay.invoice_id)
      .maybeSingle();
    if (!inv || inv.patient_id !== patientId) throw new Error("الدفعة غير مرتبطة بحسابك");

    if (!["succeeded", "completed", "paid", "partially_refunded"].includes(pay.status)) {
      throw new Error("لا يمكن استرداد هذه الدفعة في حالتها الحالية");
    }

    // Sum of active refund requests on this payment (pending / approved / processed)
    const { data: prior } = await supabase
      .from("refunds")
      .select("amount, status")
      .eq("payment_id", pay.id);
    const alreadyRequested = (prior ?? [])
      .filter((r: any) => ["pending", "approved", "processed"].includes(r.status))
      .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const maxRefundable = Math.max(0, Number(pay.amount ?? 0) - alreadyRequested);
    if (maxRefundable <= 0) throw new Error("لا يوجد مبلغ قابل للاسترداد على هذه الدفعة");

    const amount = data.amount ?? maxRefundable;
    if (amount > maxRefundable + 0.01) {
      throw new Error(`المبلغ يتجاوز الحد الأقصى المسموح (${maxRefundable.toFixed(2)})`);
    }

    // Block mock/demo payments — real refunds require real payments
    const { data: mockCheck } = await supabase
      .from("payments")
      .select("is_mock")
      .eq("id", pay.id)
      .maybeSingle();
    if (mockCheck?.is_mock) {
      throw new Error("لا يمكن طلب استرداد على دفعة تجريبية. يرجى التواصل مع المحاسبة.");
    }

    // RLS: pending, requested_by = self, is_mock = false, patient owns the payment
    // receipt_reference is auto-generated by a BEFORE INSERT trigger; pass empty so it fires.
    const { data: row, error: insErr } = await supabase
      .from("refunds")
      .insert({
        payment_id: pay.id,
        amount,
        reason: data.reason,
        status: "pending",
        requested_by: userId,
        is_mock: false,
        receipt_reference: "",
      })
      .select("id, receipt_reference")
      .single();
    if (insErr) throw new Error(insErr.message);

    return {
      ok: true,
      refund_id: row?.id as string,
      receipt_reference: (row?.receipt_reference ?? null) as string | null,
    };
  });

/* ---------- cancelMyRefund ---------- */

export const cancelMyRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // RLS allows UPDATE only when requested_by = auth.uid() and status = 'pending'
    const { error } = await supabase
      .from("refunds")
      .update({ status: "canceled" })
      .eq("id", data.id)
      .eq("requested_by", userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- logRefundReceiptDownload ---------- */

export const logRefundReceiptDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        refund_id: z.string().uuid(),
        status: z.string().max(40),
        fields: z.array(z.string().max(60)).max(30),
        field_count: z.number().int().min(0).max(100),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Verify the refund belongs to the caller before logging (RLS on refunds enforces this too)
    const { data: refund, error: refundErr } = await supabase
      .from("refunds")
      .select("id, requested_by, payment_id, amount, status")
      .eq("id", data.refund_id)
      .maybeSingle();
    if (refundErr) throw new Error(refundErr.message);
    if (!refund || refund.requested_by !== userId) {
      throw new Error("Not authorized to log this refund receipt.");
    }

    const req = (globalThis as any).Request
      ? undefined
      : undefined;
    // Best-effort user agent / IP capture
    let userAgent: string | null = null;
    let ipAddress: string | null = null;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const httpReq = getRequest();
      userAgent = httpReq.headers.get("user-agent");
      ipAddress =
        httpReq.headers.get("cf-connecting-ip") ??
        httpReq.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        httpReq.headers.get("x-real-ip") ??
        null;
    } catch {
      /* ignore */
    }

    const { error: logErr } = await supabase.from("audit_logs").insert({
      actor_id: userId,
      actor_role: "patient",
      action: "download",
      entity_type: "refund_receipt",
      entity_id: data.refund_id,
      user_agent: userAgent,
      ip_address: ipAddress,
      metadata: {
        refund_status: data.status,
        included_fields: data.fields,
        field_count: data.field_count,
        payment_id: refund.payment_id,
        refund_amount: refund.amount,
        downloaded_at: new Date().toISOString(),
      },
    });
    if (logErr) throw new Error(logErr.message);

    return { ok: true };
  });
