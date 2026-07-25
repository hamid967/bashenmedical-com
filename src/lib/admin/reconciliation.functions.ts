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
  .validator((d: unknown) => schema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{
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
    let invQ = context.supabase
      .from("invoices")
      .select(invoiceCols)
      .eq("issued_at", day);
    if (data.branch_id) {
      // Filter via nested join
      invQ = context.supabase
        .from("invoices")
        .select(invoiceCols.replace("appointment:appointments(", "appointment:appointments!inner("))
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
    let paymentsByInvoice = new Map<string, { collected: number; refunded: number }>();
    if (invoiceIds.length > 0) {
      const { data: pays, error: payErr } = await context.supabase
        .from("payments")
        .select("invoice_id, amount, status")
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
        .in("payment_id", paymentIds.length ? paymentIds : ["00000000-0000-0000-0000-000000000000"]);
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

    // 4) Merge into rows
    const rows: ReconciliationRow[] = invoiceRows.map((inv) => {
      const appt = inv.appointment ?? null;
      const patient = inv.patient ?? null;
      const nationalId = patient?.national_id ?? appt?.national_id ?? null;
      const doctorId = appt?.doctor_id ?? null;
      const nphiesMatch =
        doctorId && nationalId ? nphiesByKey.get(`${doctorId}|${nationalId}`) : null;
      if (nphiesMatch) matchedNphiesIds.add(nphiesMatch.id);

      const billed = Number(inv.total ?? 0);
      const pay = paymentsByInvoice.get(inv.id) ?? { collected: 0, refunded: 0 };
      const netCollected = pay.collected - pay.refunded;
      const covered = nphiesMatch?.covered_amount != null ? Number(nphiesMatch.covered_amount) : null;
      const patientShare =
        nphiesMatch?.patient_share != null ? Number(nphiesMatch.patient_share) : null;
      const expectedShare = patientShare != null ? patientShare : covered != null ? billed - covered : null;
      const variance = expectedShare != null ? netCollected - expectedShare : netCollected - billed;

      const flags: string[] = [];
      if (Math.abs(variance) > 0.009) flags.push("variance");
      if (!nphiesMatch && appt?.insurance_provider_id) flags.push("missing_nphies");
      if (inv.status !== "paid" && netCollected >= billed - 0.009) flags.push("collected_not_marked_paid");
      if (inv.status === "paid" && netCollected + 0.009 < billed) flags.push("marked_paid_underpaid");
      if (billed === 0) flags.push("zero_billed");

      return {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number ?? null,
        status: inv.status ?? null,
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
      total_nphies_covered: round2(
        rows.reduce((s, r) => s + (r.nphies_covered ?? 0), 0),
      ),
      total_expected_patient_share: round2(
        rows.reduce((s, r) => s + (r.expected_patient_share ?? 0), 0),
      ),
      total_variance: round2(rows.reduce((s, r) => s + r.variance, 0)),
      matched_nphies: matchedNphiesIds.size,
      unmatched_nphies_requests: unmatchedNphies.length,
      discrepancy_count: rows.filter((r) => r.flags.includes("variance")).length,
    };

    return { summary, rows, unmatchedNphies };
  });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
