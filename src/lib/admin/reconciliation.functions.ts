/**
 * Admin — Daily Financial Reconciliation.
 *
 * Matches invoices ↔ payments ↔ NPHIES claims for a given date and surfaces
 * traceable variances. NPHIES rows are best-effort linked to appointments via
 * (doctor_id, patient national_id, request created_at::date == appointment_date).
 * Rows with unmatched data are still returned so the operator can investigate.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD")
    .optional(),
  branch_id: z.string().uuid().optional(),
});

export type ReconciliationRow = {
  invoice_id: string;
  invoice_number: string | null;
  status: string | null;
  appointment_id: string | null;
  appointment_ref: string | null;
  branch_id: string | null;
  branch_name: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_national_id: string | null;
  doctor_id: string | null;
  billed: number;
  collected: number;
  refunded: number;
  net_collected: number;
  nphies_covered: number | null;
  nphies_patient_share: number | null;
  nphies_request_id: string | null;
  nphies_mode: string | null;
  nphies_eligible: boolean | null;
  expected_patient_share: number | null;
  variance: number;
  currency: string;
  flags: string[];
  adjusted: boolean;
  adjustment_reason: string | null;
};

export type ReconciliationSummary = {
  date: string;
  branch_id: string | null;
  invoice_count: number;
  total_billed: number;
  total_collected: number;
  total_refunded: number;
  total_net_collected: number;
  total_nphies_covered: number;
  total_expected_patient_share: number;
  total_variance: number;
  matched_nphies: number;
  unmatched_nphies_requests: number;
  discrepancy_count: number;
};

export const getDailyReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: any) => schema.parse(d ?? {}))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      summary: ReconciliationSummary;
      rows: ReconciliationRow[];
      unmatchedNphies: Array<{
        id: string;
        created_at: string;
        mode: string;
        doctor_id: string | null;
        patient_national_id: string | null;
        covered_amount: number | null;
        patient_share: number | null;
        eligible: boolean | null;
      }>;
    }> => {
      await assertHasRole(context.supabase, context.userId, "admin");

      const day = data.date ?? new Date().toISOString().slice(0, 10);
      const dayStart = new Date(`${day}T00:00:00.000Z`).toISOString();
      const dayEnd = new Date(`${day}T23:59:59.999Z`).toISOString();

      // 1) Invoices issued on the target date (+ appointment + branch + patient)
      const invoiceCols =
        "id, invoice_number, total, currency, status, issued_at, " +
        "patient:patients(id, full_name_ar, full_name_en, national_id), " +
        "appointment:appointments(id, reference_number, branch_id, doctor_id, appointment_date, national_id, " +
        "branch:branches(id, name_ar, name_en))";
      let invQ = context.supabase.from("invoices").select(invoiceCols).eq("issued_at", day);
      if (data.branch_id) {
        // Filter via nested join
        invQ = context.supabase
          .from("invoices")
          .select(
            invoiceCols.replace("appointment:appointments(", "appointment:appointments!inner("),
          )
          .eq("issued_at", day)
          .eq("appointment.branch_id", data.branch_id);
      }
      const { data: invoices, error: invErr } = await invQ;
      if (invErr) throw new Error(invErr.message);
      const invoiceRows = (invoices ?? []) as any[];

      if (invoiceRows.length === 0) {
        // Still return NPHIES totals for context.
      }

      // 2) Payments for these invoices (succeeded only for collected totals)
      const invoiceIds = invoiceRows.map((r) => r.id);
      const paymentsByInvoice = new Map<string, { collected: number; refunded: number }>();
      if (invoiceIds.length > 0) {
        const { data: pays, error: payErr } = await context.supabase
          .from("payments")
          .select("id, invoice_id, amount, status")
          .in("invoice_id", invoiceIds);
        if (payErr) throw new Error(payErr.message);
        for (const p of pays ?? []) {
          const cur = paymentsByInvoice.get(p.invoice_id) ?? { collected: 0, refunded: 0 };
          if (p.status === "succeeded") cur.collected += Number(p.amount);
          paymentsByInvoice.set(p.invoice_id, cur);
        }
        // Refunds
        const paymentIds = (pays ?? []).map((p: any) => p.id).filter(Boolean);
        // refunds table linked via payment_id
        const { data: refunds } = await context.supabase
          .from("refunds")
          .select("payment_id, amount, status, payments!inner(invoice_id)")
          .in(
            "payment_id",
            paymentIds.length ? paymentIds : ["00000000-0000-0000-0000-000000000000"],
          );
        for (const rf of refunds ?? []) {
          if (rf.status !== "succeeded") continue;
          const invId = (rf as any).payments?.invoice_id;
          if (!invId) continue;
          const cur = paymentsByInvoice.get(invId) ?? { collected: 0, refunded: 0 };
          cur.refunded += Number(rf.amount);
          paymentsByInvoice.set(invId, cur);
        }
      }

      // 3) NPHIES requests for the day (best-effort match by doctor_id + national_id)
      const { data: nphies, error: nphErr } = await context.supabase
        .from("nphies_requests")
        .select(
          "id, created_at, mode, doctor_id, patient_national_id, covered_amount, patient_share, eligible, http_status",
        )
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd);
      if (nphErr) throw new Error(nphErr.message);
      const nphiesRows = (nphies ?? []) as any[];

      // Build lookup key: doctor_id|national_id
      const nphiesByKey = new Map<string, any>();
      for (const n of nphiesRows) {
        if (!n.doctor_id || !n.patient_national_id) continue;
        const key = `${n.doctor_id}|${n.patient_national_id}`;
        // Prefer eligible=true, otherwise latest
        const existing = nphiesByKey.get(key);
        if (
          !existing ||
          (n.eligible === true && existing.eligible !== true) ||
          new Date(n.created_at).getTime() > new Date(existing.created_at).getTime()
        ) {
          nphiesByKey.set(key, n);
        }
      }
      const matchedNphiesIds = new Set<string>();

      // 3.5) Active adjustments for these invoices
      const adjustmentsByInvoice = new Map<string, any>();
      const extraNphiesIds: string[] = [];
      if (invoiceIds.length > 0) {
        const { data: adjs, error: adjErr } = await context.supabase
          .from("reconciliation_adjustments")
          .select(
            "id, invoice_id, linked_nphies_request_id, unlink_nphies, override_expected_share, override_invoice_status, resolved, reason, created_at",
          )
          .in("invoice_id", invoiceIds)
          .is("revoked_at", null)
          .order("created_at", { ascending: false });
        if (adjErr) throw new Error(adjErr.message);
        for (const a of adjs ?? []) {
          if (!adjustmentsByInvoice.has(a.invoice_id)) {
            adjustmentsByInvoice.set(a.invoice_id, a);
            if (a.linked_nphies_request_id) extraNphiesIds.push(a.linked_nphies_request_id);
          }
        }
      }
      // Load NPHIES rows referenced by adjustments but not in the day window
      const extraNphiesById = new Map<string, any>();
      if (extraNphiesIds.length > 0) {
        const { data: extras } = await context.supabase
          .from("nphies_requests")
          .select(
            "id, created_at, mode, doctor_id, patient_national_id, covered_amount, patient_share, eligible, http_status",
          )
          .in("id", extraNphiesIds);
        for (const n of extras ?? []) extraNphiesById.set(n.id, n);
      }

      // 4) Merge into rows
      const rows: ReconciliationRow[] = invoiceRows.map((inv) => {
        const appt = inv.appointment ?? null;
        const patient = inv.patient ?? null;
        const nationalId = patient?.national_id ?? appt?.national_id ?? null;
        const doctorId = appt?.doctor_id ?? null;
        const adjustment = adjustmentsByInvoice.get(inv.id) ?? null;

        let nphiesMatch: any =
          doctorId && nationalId ? nphiesByKey.get(`${doctorId}|${nationalId}`) : null;
        if (adjustment?.unlink_nphies) nphiesMatch = null;
        if (adjustment?.linked_nphies_request_id) {
          nphiesMatch =
            extraNphiesById.get(adjustment.linked_nphies_request_id) ??
            nphiesRows.find((n: any) => n.id === adjustment.linked_nphies_request_id) ??
            nphiesMatch;
        }
        if (nphiesMatch) matchedNphiesIds.add(nphiesMatch.id);

        const effectiveStatus: string | null =
          adjustment?.override_invoice_status ?? inv.status ?? null;
        const billed = Number(inv.total ?? 0);
        const pay = paymentsByInvoice.get(inv.id) ?? { collected: 0, refunded: 0 };
        const netCollected = pay.collected - pay.refunded;
        const covered =
          nphiesMatch?.covered_amount != null ? Number(nphiesMatch.covered_amount) : null;
        const patientShare =
          nphiesMatch?.patient_share != null ? Number(nphiesMatch.patient_share) : null;
        const baseExpected =
          patientShare != null ? patientShare : covered != null ? billed - covered : null;
        const expectedShare =
          adjustment?.override_expected_share != null
            ? Number(adjustment.override_expected_share)
            : baseExpected;
        const variance =
          expectedShare != null ? netCollected - expectedShare : netCollected - billed;

        const flags: string[] = [];
        if (Math.abs(variance) > 0.009) flags.push("variance");
        if (!nphiesMatch && appt?.insurance_provider_id) flags.push("missing_nphies");
        if (effectiveStatus !== "paid" && netCollected >= billed - 0.009)
          flags.push("collected_not_marked_paid");
        if (effectiveStatus === "paid" && netCollected + 0.009 < billed)
          flags.push("marked_paid_underpaid");
        if (billed === 0) flags.push("zero_billed");
        if (adjustment?.resolved) {
          // Resolved adjustments suppress the variance flag; keep an explicit marker.
          const idx = flags.indexOf("variance");
          if (idx >= 0) flags.splice(idx, 1);
          flags.push("resolved");
        }

        return {
          invoice_id: inv.id,
          invoice_number: inv.invoice_number ?? null,
          status: effectiveStatus,
          appointment_id: appt?.id ?? null,
          appointment_ref: appt?.reference_number ?? null,
          branch_id: appt?.branch_id ?? null,
          branch_name: appt?.branch?.name_ar ?? appt?.branch?.name_en ?? null,
          patient_id: patient?.id ?? null,
          patient_name: patient?.full_name_ar ?? patient?.full_name_en ?? null,
          patient_national_id: nationalId,
          doctor_id: doctorId,
          billed,
          collected: pay.collected,
          refunded: pay.refunded,
          net_collected: netCollected,
          nphies_covered: covered,
          nphies_patient_share: patientShare,
          nphies_request_id: nphiesMatch?.id ?? null,
          nphies_mode: nphiesMatch?.mode ?? null,
          nphies_eligible: nphiesMatch?.eligible ?? null,
          expected_patient_share: expectedShare,
          variance: Number(variance.toFixed(2)),
          currency: inv.currency ?? "SAR",
          flags,
          adjusted: !!adjustment,
          adjustment_reason: adjustment?.reason ?? null,
        };
      });

      // 5) Unmatched NPHIES rows (potential leakage / claims without invoice)
      const unmatchedNphies = nphiesRows
        .filter((n) => !matchedNphiesIds.has(n.id))
        .map((n) => ({
          id: n.id,
          created_at: n.created_at,
          mode: n.mode,
          doctor_id: n.doctor_id,
          patient_national_id: n.patient_national_id,
          covered_amount: n.covered_amount != null ? Number(n.covered_amount) : null,
          patient_share: n.patient_share != null ? Number(n.patient_share) : null,
          eligible: n.eligible,
        }));

      // 6) Summary
      const summary: ReconciliationSummary = {
        date: day,
        branch_id: data.branch_id ?? null,
        invoice_count: rows.length,
        total_billed: round2(rows.reduce((s, r) => s + r.billed, 0)),
        total_collected: round2(rows.reduce((s, r) => s + r.collected, 0)),
        total_refunded: round2(rows.reduce((s, r) => s + r.refunded, 0)),
        total_net_collected: round2(rows.reduce((s, r) => s + r.net_collected, 0)),
        total_nphies_covered: round2(rows.reduce((s, r) => s + (r.nphies_covered ?? 0), 0)),
        total_expected_patient_share: round2(
          rows.reduce((s, r) => s + (r.expected_patient_share ?? 0), 0),
        ),
        total_variance: round2(rows.reduce((s, r) => s + r.variance, 0)),
        matched_nphies: matchedNphiesIds.size,
        unmatched_nphies_requests: unmatchedNphies.length,
        discrepancy_count: rows.filter((r) => r.flags.includes("variance")).length,
      };

      return { summary, rows, unmatchedNphies };
    },
  );

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ============================================================
 * Reconciliation Detail — per-invoice deep dive
 * ============================================================ */

const detailSchema = z.object({ invoice_id: z.string().uuid() });

export type ReconciliationPaymentRow = {
  id: string;
  amount: number;
  currency: string | null;
  method: string | null;
  gateway: string | null;
  gateway_ref: string | null;
  status: string | null;
  paid_at: string | null;
  is_mock: boolean | null;
  idempotency_key: string | null;
  created_at: string;
};

export type ReconciliationRefundRow = {
  id: string;
  payment_id: string;
  amount: number;
  status: string | null;
  reason: string | null;
  decision_reason: string | null;
  receipt_reference: string | null;
  processed_at: string | null;
  created_at: string;
};

export type ReconciliationNphiesCandidate = {
  id: string;
  created_at: string;
  mode: string;
  eligible: boolean | null;
  reason: string | null;
  coverage_percent: number | null;
  consultation_fee: number | null;
  covered_amount: number | null;
  patient_share: number | null;
  http_status: number | null;
  error_message: string | null;
  policy_number: string | null;
  member_id: string | null;
  matched: boolean;
};

export type ReconciliationFieldDiff = {
  key: string;
  label: string;
  expected: number | string | null;
  actual: number | string | null;
  delta: number | null;
  status: "match" | "diff" | "info";
  note?: string;
};

export type ReconciliationDetail = {
  row: ReconciliationRow;
  invoice: {
    id: string;
    invoice_number: string | null;
    status: string | null;
    issued_at: string | null;
    paid_at: string | null;
    total: number;
    currency: string;
    notes: string | null;
    pdf_path: string | null;
  };
  payments: ReconciliationPaymentRow[];
  refunds: ReconciliationRefundRow[];
  nphies: ReconciliationNphiesCandidate[];
  fieldDiffs: ReconciliationFieldDiff[];
  flagsExplained: Array<{ code: string; label: string; detail: string }>;
  activeAdjustment: ReconciliationAdjustmentRow | null;
  adjustmentHistory: ReconciliationAdjustmentRow[];
};

export type ReconciliationAdjustmentRow = {
  id: string;
  invoice_id: string;
  linked_nphies_request_id: string | null;
  unlink_nphies: boolean;
  override_expected_share: number | null;
  override_invoice_status: string | null;
  resolved: boolean;
  reason: string;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_name: string | null;
  revoke_reason: string | null;
};

const FLAG_DETAILS: Record<string, { label: string; detail: string }> = {
  variance: {
    label: "فرق مالي",
    detail:
      "الفرق بين ما تم تحصيله فعلياً وحصة المريض المتوقعة من NPHIES (أو من الفاتورة إن لم توجد مطالبة).",
  },
  missing_nphies: {
    label: "لا توجد مطالبة NPHIES",
    detail: "الموعد مرتبط بمزوّد تأمين لكن لم تُسجّل مطالبة أهلية في نفس اليوم.",
  },
  collected_not_marked_paid: {
    label: "محصّلة ولم توسم مدفوعة",
    detail: "المبلغ الصافي المحصّل يساوي أو يتجاوز قيمة الفاتورة، لكن حالتها ليست 'paid'.",
  },
  marked_paid_underpaid: {
    label: "مدفوعة ولكن ناقصة",
    detail: "الفاتورة موسومة 'paid' لكن الصافي المحصّل أقل من إجمالي الفاتورة.",
  },
  zero_billed: {
    label: "قيمة صفرية",
    detail: "إجمالي الفاتورة يساوي صفر — يحتاج مراجعة يدوية.",
  },
  resolved: {
    label: "تم الإقرار يدوياً",
    detail: "تمت مراجعة الفرق يدوياً واعتباره مقبولاً؛ راجع سبب التعديل.",
  },
};

function fmtNum(n: number | null | undefined): number | null {
  if (n == null || Number.isNaN(Number(n))) return null;
  return round2(Number(n));
}

export const getReconciliationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: any) => detailSchema.parse(d))
  .handler(async ({ data, context }): Promise<ReconciliationDetail> => {
    await assertHasRole(context.supabase, context.userId, "admin");

    const { data: inv, error: invErr } = await context.supabase
      .from("invoices")
      .select(
        "id, invoice_number, total, currency, status, issued_at, paid_at, notes, pdf_path, " +
          "patient:patients(id, full_name_ar, full_name_en, national_id), " +
          "appointment:appointments(id, reference_number, branch_id, doctor_id, appointment_date, national_id, insurance_provider_id, " +
          "branch:branches(id, name_ar, name_en))",
      )
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!inv) throw new Error("الفاتورة غير موجودة");

    const appt: any = (inv as any).appointment ?? null;
    const patient: any = (inv as any).patient ?? null;
    const nationalId: string | null = patient?.national_id ?? appt?.national_id ?? null;
    const doctorId: string | null = appt?.doctor_id ?? null;
    const day: string | null = appt?.appointment_date ?? (inv as any).issued_at ?? null;

    const { data: pays, error: payErr } = await context.supabase
      .from("payments")
      .select(
        "id, amount, currency, method, gateway, gateway_ref, status, paid_at, is_mock, idempotency_key, created_at",
      )
      .eq("invoice_id", data.invoice_id)
      .order("created_at", { ascending: true });
    if (payErr) throw new Error(payErr.message);
    const payments: ReconciliationPaymentRow[] = (pays ?? []).map((p: any) => ({
      ...p,
      amount: Number(p.amount ?? 0),
    }));

    const paymentIds = payments.map((p) => p.id);
    let refunds: ReconciliationRefundRow[] = [];
    if (paymentIds.length > 0) {
      const { data: rfs, error: rfErr } = await context.supabase
        .from("refunds")
        .select(
          "id, payment_id, amount, status, reason, decision_reason, receipt_reference, processed_at, created_at",
        )
        .in("payment_id", paymentIds)
        .order("created_at", { ascending: true });
      if (rfErr) throw new Error(rfErr.message);
      refunds = (rfs ?? []).map((r: any) => ({ ...r, amount: Number(r.amount ?? 0) }));
    }

    const collected = payments
      .filter((p) => p.status === "succeeded")
      .reduce((s, p) => s + p.amount, 0);
    const refunded = refunds
      .filter((r) => r.status === "succeeded")
      .reduce((s, r) => s + r.amount, 0);
    const netCollected = collected - refunded;

    let nphies: ReconciliationNphiesCandidate[] = [];
    if (doctorId && nationalId && day) {
      const dayStart = new Date(`${day}T00:00:00.000Z`).toISOString();
      const dayEnd = new Date(`${day}T23:59:59.999Z`).toISOString();
      const { data: nRows, error: nErr } = await context.supabase
        .from("nphies_requests")
        .select(
          "id, created_at, mode, eligible, reason, coverage_percent, consultation_fee, covered_amount, patient_share, http_status, error_message, policy_number, member_id",
        )
        .eq("doctor_id", doctorId)
        .eq("patient_national_id", nationalId)
        .gte("created_at", dayStart)
        .lte("created_at", dayEnd)
        .order("created_at", { ascending: false });
      if (nErr) throw new Error(nErr.message);
      const base = (nRows ?? []).map((n: any) => ({
        id: n.id,
        created_at: n.created_at,
        mode: n.mode,
        eligible: n.eligible,
        reason: n.reason,
        coverage_percent: fmtNum(n.coverage_percent),
        consultation_fee: fmtNum(n.consultation_fee),
        covered_amount: fmtNum(n.covered_amount),
        patient_share: fmtNum(n.patient_share),
        http_status: n.http_status,
        error_message: n.error_message,
        policy_number: n.policy_number,
        member_id: n.member_id,
        matched: false,
      }));
      const preferred = base.find((n) => n.eligible === true) ?? base[0] ?? null;
      nphies = base.map((n) => ({ ...n, matched: preferred ? n.id === preferred.id : false }));
    }
    // Fetch adjustment history for this invoice
    const { data: adjRows, error: adjErr } = await context.supabase
      .from("reconciliation_adjustments")
      .select(
        "id, invoice_id, linked_nphies_request_id, unlink_nphies, override_expected_share, override_invoice_status, resolved, reason, created_by, created_at, revoked_at, revoked_by, revoke_reason",
      )
      .eq("invoice_id", data.invoice_id)
      .order("created_at", { ascending: false });
    if (adjErr) throw new Error(adjErr.message);
    const adjRaw = (adjRows ?? []) as any[];

    // Resolve user names for creators / revokers
    const userIds = Array.from(
      new Set(adjRaw.flatMap((a) => [a.created_by, a.revoked_by]).filter(Boolean)),
    ) as string[];
    const userNames = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of (profs ?? []) as any[]) {
        userNames.set(p.id, p.full_name || p.id.slice(0, 8));
      }
    }

    const adjustmentHistory: ReconciliationAdjustmentRow[] = adjRaw.map((a) => ({
      id: a.id,
      invoice_id: a.invoice_id,
      linked_nphies_request_id: a.linked_nphies_request_id,
      unlink_nphies: !!a.unlink_nphies,
      override_expected_share:
        a.override_expected_share != null ? Number(a.override_expected_share) : null,
      override_invoice_status: a.override_invoice_status,
      resolved: !!a.resolved,
      reason: a.reason,
      created_by: a.created_by,
      created_by_name: userNames.get(a.created_by) ?? null,
      created_at: a.created_at,
      revoked_at: a.revoked_at,
      revoked_by: a.revoked_by,
      revoked_by_name: a.revoked_by ? (userNames.get(a.revoked_by) ?? null) : null,
      revoke_reason: a.revoke_reason,
    }));
    const activeAdjustment = adjustmentHistory.find((a) => a.revoked_at == null) ?? null;

    // If an adjustment links a NPHIES request not in the day window, load it
    let primary = nphies.find((n) => n.matched) ?? null;
    if (activeAdjustment?.unlink_nphies) {
      primary = null;
      nphies = nphies.map((n) => ({ ...n, matched: false }));
    } else if (activeAdjustment?.linked_nphies_request_id) {
      const linkedId = activeAdjustment.linked_nphies_request_id;
      let existing = nphies.find((n) => n.id === linkedId) ?? null;
      if (!existing) {
        const { data: extra } = await context.supabase
          .from("nphies_requests")
          .select(
            "id, created_at, mode, eligible, reason, coverage_percent, consultation_fee, covered_amount, patient_share, http_status, error_message, policy_number, member_id",
          )
          .eq("id", linkedId)
          .maybeSingle();
        if (extra) {
          const ext: ReconciliationNphiesCandidate = {
            id: extra.id,
            created_at: extra.created_at,
            mode: extra.mode,
            eligible: extra.eligible,
            reason: extra.reason,
            coverage_percent: fmtNum(extra.coverage_percent),
            consultation_fee: fmtNum(extra.consultation_fee),
            covered_amount: fmtNum(extra.covered_amount),
            patient_share: fmtNum(extra.patient_share),
            http_status: extra.http_status,
            error_message: extra.error_message,
            policy_number: extra.policy_number,
            member_id: extra.member_id,
            matched: true,
          };
          nphies = [ext, ...nphies.map((n) => ({ ...n, matched: false }))];
          existing = ext;
        }
      } else {
        nphies = nphies.map((n) => ({ ...n, matched: n.id === linkedId }));
      }
      primary = existing;
    }

    const billed = Number((inv as any).total ?? 0);
    const covered = primary?.covered_amount ?? null;
    const patientShare = primary?.patient_share ?? null;
    const baseExpected =
      patientShare != null ? patientShare : covered != null ? billed - covered : null;
    const expectedShare =
      activeAdjustment?.override_expected_share != null
        ? activeAdjustment.override_expected_share
        : baseExpected;
    const variance = expectedShare != null ? netCollected - expectedShare : netCollected - billed;
    const effectiveStatus: string | null =
      activeAdjustment?.override_invoice_status ?? (inv as any).status ?? null;

    const flags: string[] = [];
    if (Math.abs(variance) > 0.009) flags.push("variance");
    if (!primary && appt?.insurance_provider_id) flags.push("missing_nphies");
    if (effectiveStatus !== "paid" && netCollected >= billed - 0.009)
      flags.push("collected_not_marked_paid");
    if (effectiveStatus === "paid" && netCollected + 0.009 < billed)
      flags.push("marked_paid_underpaid");
    if (billed === 0) flags.push("zero_billed");
    if (activeAdjustment?.resolved) {
      const idx = flags.indexOf("variance");
      if (idx >= 0) flags.splice(idx, 1);
      flags.push("resolved");
    }

    const currency: string = (inv as any).currency ?? "SAR";
    const row: ReconciliationRow = {
      invoice_id: (inv as any).id,
      invoice_number: (inv as any).invoice_number ?? null,
      status: effectiveStatus,
      appointment_id: appt?.id ?? null,
      appointment_ref: appt?.reference_number ?? null,
      branch_id: appt?.branch_id ?? null,
      branch_name: appt?.branch?.name_ar ?? appt?.branch?.name_en ?? null,
      patient_id: patient?.id ?? null,
      patient_name: patient?.full_name_ar ?? patient?.full_name_en ?? null,
      patient_national_id: nationalId,
      doctor_id: doctorId,
      billed: round2(billed),
      collected: round2(collected),
      refunded: round2(refunded),
      net_collected: round2(netCollected),
      nphies_covered: covered,
      nphies_patient_share: patientShare,
      nphies_request_id: primary?.id ?? null,
      nphies_mode: primary?.mode ?? null,
      nphies_eligible: primary?.eligible ?? null,
      expected_patient_share: expectedShare != null ? round2(expectedShare) : null,
      variance: round2(variance),
      currency,
      flags,
      adjusted: !!activeAdjustment,
      adjustment_reason: activeAdjustment?.reason ?? null,
    };

    const fieldDiffs: ReconciliationFieldDiff[] = [];
    const pushMoney = (
      key: string,
      label: string,
      expected: number | null,
      actual: number | null,
      note?: string,
    ) => {
      if (expected == null && actual == null) {
        fieldDiffs.push({
          key,
          label,
          expected: null,
          actual: null,
          delta: null,
          status: "info",
          note,
        });
        return;
      }
      const e = expected ?? 0;
      const a = actual ?? 0;
      const delta = round2(a - e);
      fieldDiffs.push({
        key,
        label,
        expected: expected != null ? round2(expected) : null,
        actual: actual != null ? round2(actual) : null,
        delta,
        status: Math.abs(delta) <= 0.009 ? "match" : "diff",
        note,
      });
    };

    pushMoney(
      "billed_vs_covered_plus_share",
      "الفاتورة = تغطية + حصة المريض",
      billed,
      (covered ?? 0) + (patientShare ?? 0),
      primary ? undefined : "لا توجد مطالبة NPHIES مطابقة",
    );
    pushMoney(
      "collected_vs_expected_share",
      "المحصّل الصافي ≟ حصة المريض المتوقعة",
      expectedShare,
      netCollected,
    );
    pushMoney("collected_vs_billed", "المحصّل الصافي ≟ إجمالي الفاتورة", billed, netCollected);
    pushMoney(
      "refund_impact",
      "أثر الاسترداد على المحصّل",
      collected,
      netCollected,
      refunded > 0 ? `تم استرداد ${round2(refunded)} ${currency}` : undefined,
    );
    fieldDiffs.push({
      key: "status_consistency",
      label: "اتساق حالة الفاتورة",
      expected: netCollected >= billed - 0.009 ? "paid" : "issued/pending",
      actual: (inv as any).status ?? "—",
      delta: null,
      status:
        (netCollected >= billed - 0.009 && (inv as any).status === "paid") ||
        (netCollected + 0.009 < billed && (inv as any).status !== "paid")
          ? "match"
          : "diff",
    });
    fieldDiffs.push({
      key: "nphies_eligibility",
      label: "أهلية NPHIES",
      expected: appt?.insurance_provider_id ? "مطالبة موجودة" : "غير مطلوبة",
      actual: primary
        ? primary.eligible === true
          ? "مؤهل"
          : primary.eligible === false
            ? "غير مؤهل"
            : "غير محدد"
        : "لا توجد",
      delta: null,
      status: !appt?.insurance_provider_id ? "info" : primary?.eligible === true ? "match" : "diff",
    });

    const flagsExplained = flags.map((code) => ({
      code,
      label: FLAG_DETAILS[code]?.label ?? code,
      detail: FLAG_DETAILS[code]?.detail ?? "",
    }));

    return {
      row,
      invoice: {
        id: (inv as any).id,
        invoice_number: (inv as any).invoice_number ?? null,
        status: (inv as any).status ?? null,
        issued_at: (inv as any).issued_at ?? null,
        paid_at: (inv as any).paid_at ?? null,
        total: round2(billed),
        currency,
        notes: (inv as any).notes ?? null,
        pdf_path: (inv as any).pdf_path ?? null,
      },
      payments,
      refunds,
      nphies,
      fieldDiffs,
      flagsExplained,
      activeAdjustment,
      adjustmentHistory,
    };
  });

/* ============================================================
 * Manual reconciliation adjustments — CRUD
 * ============================================================ */

const applySchema = z
  .object({
    invoice_id: z.string().uuid(),
    reason: z.string().trim().min(3, "السبب مطلوب (٣ أحرف على الأقل)").max(1000),
    linked_nphies_request_id: z.string().uuid().nullable().optional(),
    unlink_nphies: z.boolean().optional(),
    override_expected_share: z.number().finite().min(0).max(10_000_000).nullable().optional(),
    override_invoice_status: z
      .enum(["issued", "pending", "paid", "cancelled", "refunded"])
      .nullable()
      .optional(),
    resolved: z.boolean().optional(),
  })
  .refine(
    (v) =>
      !!v.linked_nphies_request_id ||
      v.unlink_nphies === true ||
      v.override_expected_share != null ||
      v.override_invoice_status != null ||
      v.resolved === true,
    { message: "يجب اختيار تعديل واحد على الأقل" },
  );

export const listReconciliationAdjustments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: any) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ReconciliationAdjustmentRow[]> => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data: rows, error } = await context.supabase
      .from("reconciliation_adjustments")
      .select(
        "id, invoice_id, linked_nphies_request_id, unlink_nphies, override_expected_share, override_invoice_status, resolved, reason, created_by, created_at, revoked_at, revoked_by, revoke_reason",
      )
      .eq("invoice_id", data.invoice_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const raw = (rows ?? []) as any[];
    const userIds = Array.from(
      new Set(raw.flatMap((r) => [r.created_by, r.revoked_by]).filter(Boolean)),
    ) as string[];
    const names = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of (profs ?? []) as any[]) {
        names.set(p.id, p.full_name || p.id.slice(0, 8));
      }
    }
    return raw.map((a) => ({
      id: a.id,
      invoice_id: a.invoice_id,
      linked_nphies_request_id: a.linked_nphies_request_id,
      unlink_nphies: !!a.unlink_nphies,
      override_expected_share:
        a.override_expected_share != null ? Number(a.override_expected_share) : null,
      override_invoice_status: a.override_invoice_status,
      resolved: !!a.resolved,
      reason: a.reason,
      created_by: a.created_by,
      created_by_name: names.get(a.created_by) ?? null,
      created_at: a.created_at,
      revoked_at: a.revoked_at,
      revoked_by: a.revoked_by,
      revoked_by_name: a.revoked_by ? (names.get(a.revoked_by) ?? null) : null,
      revoke_reason: a.revoke_reason,
    }));
  });

export const applyReconciliationAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: any) => applySchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await assertHasRole(context.supabase, context.userId, "admin");

    // Verify invoice exists
    const { data: inv, error: invErr } = await context.supabase
      .from("invoices")
      .select("id")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!inv) throw new Error("الفاتورة غير موجودة");

    // Revoke previous active adjustment for this invoice
    const nowIso = new Date().toISOString();
    const { error: revErr } = await context.supabase
      .from("reconciliation_adjustments")
      .update({
        revoked_at: nowIso,
        revoked_by: context.userId,
        revoke_reason: "استبدال بتعديل جديد",
      })
      .eq("invoice_id", data.invoice_id)
      .is("revoked_at", null);
    if (revErr) throw new Error(revErr.message);

    const payload = {
      invoice_id: data.invoice_id,
      linked_nphies_request_id: data.linked_nphies_request_id ?? null,
      unlink_nphies: data.unlink_nphies ?? false,
      override_expected_share: data.override_expected_share ?? null,
      override_invoice_status: data.override_invoice_status ?? null,
      resolved: data.resolved ?? false,
      reason: data.reason.trim(),
      created_by: context.userId,
    };
    const { data: inserted, error: insErr } = await context.supabase
      .from("reconciliation_adjustments")
      .insert(payload)
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { id: inserted.id };
  });

export const revokeReconciliationAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: any) =>
    z
      .object({
        id: z.string().uuid(),
        revoke_reason: z.string().trim().min(3, "سبب الإلغاء مطلوب").max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("reconciliation_adjustments")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
        revoke_reason: data.revoke_reason.trim(),
      })
      .eq("id", data.id)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
