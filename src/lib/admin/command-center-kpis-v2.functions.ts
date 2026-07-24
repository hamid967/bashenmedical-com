/**
 * Phase 7 — Enterprise Admin Command Center: real-data KPI aggregator.
 *
 * Returns the 14 Overview KPIs listed in the Phase 7 brief. Each KPI is
 * fetched in isolation so a single permission/RLS problem does not blank
 * the grid — a failing KPI is returned with `unavailable: true` and an
 * error message the UI can render in its error state.
 *
 * Admin/super_admin only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertHasRole } from "@/lib/admin/_guard";

export type CommandCenterKpiKey =
  | "appointments_today"
  | "appointments_confirmed"
  | "pending_requests"
  | "cancellations_today"
  | "no_show_rate"
  | "occupancy"
  | "available_slots"
  | "new_patients_today"
  | "pending_reports"
  | "insurance_pending"
  | "invoices_unpaid"
  | "whatsapp_requests"
  | "support_open"
  | "integration_failures";

export type CommandCenterKpiV2 = {
  key: CommandCenterKpiKey;
  label: string;
  /** null when unavailable. Use `unavailable` to distinguish empty vs. failed. */
  value: number | null;
  /** For rate KPIs, a percentage 0..100. */
  isPercent?: boolean;
  positiveIsGood: boolean;
  /** Empty means we successfully looked up 0 rows. */
  empty: boolean;
  unavailable: boolean;
  errorMessage?: string;
  /** Where to drill into — same-origin admin path. */
  drillTo: string;
  hint?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function safeCount(
  sb: Sb,
  table: string,
  build: (q: Sb) => Sb,
): Promise<{ count: number | null; error: string | null }> {
  try {
    const q = build(sb.from(table).select("id", { count: "exact", head: true }));
    const { count, error } = await q;
    if (error) return { count: null, error: error.message || "query failed" };
    return { count: count ?? 0, error: null };
  } catch (e) {
    return { count: null, error: e instanceof Error ? e.message : "query failed" };
  }
}

export const getCommandCenterKpisV2 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ kpis: CommandCenterKpiV2[]; fetchedAt: string }> => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase as Sb;
    const today = todayIso();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const twentyFourHoursAgo = new Date(Date.now() - 86_400_000).toISOString();

    const [
      apptsToday,
      apptsConfirmed,
      inquiriesPending,
      apptsPending,
      apptsCancelledToday,
      apptsNoShow7d,
      apptsTotal7d,
      slotsBookedToday,
      slotsAvailToday,
      newPatientsToday,
      medRepPending,
      labRepPending,
      radRepPending,
      insurancePending,
      invoicesUnpaid,
      whatsappToday,
      complaintsOpen,
      integrationFailures,
    ] = await Promise.all([
      safeCount(sb, "appointments", (q: Sb) => q.eq("appointment_date", today)),
      safeCount(sb, "appointments", (q: Sb) =>
        q.eq("appointment_date", today).eq("status", "confirmed"),
      ),
      safeCount(sb, "service_inquiries", (q: Sb) => q.eq("status", "pending")),
      safeCount(sb, "appointments", (q: Sb) => q.eq("status", "new")),
      safeCount(sb, "appointments", (q: Sb) =>
        q.eq("appointment_date", today).eq("status", "cancelled"),
      ),
      safeCount(sb, "appointments", (q: Sb) =>
        q.gte("appointment_date", sevenDaysAgo).eq("status", "no_show"),
      ),
      safeCount(sb, "appointments", (q: Sb) => q.gte("appointment_date", sevenDaysAgo)),
      safeCount(sb, "availability_slots", (q: Sb) =>
        q.eq("slot_date", today).eq("status", "booked"),
      ),
      safeCount(sb, "availability_slots", (q: Sb) =>
        q.eq("slot_date", today).eq("status", "available"),
      ),
      safeCount(sb, "patients", (q: Sb) => q.gte("created_at", `${today}T00:00:00Z`)),
      safeCount(sb, "medical_reports", (q: Sb) => q.eq("status", "pending")),
      safeCount(sb, "lab_reports", (q: Sb) => q.eq("status", "pending")),
      safeCount(sb, "radiology_reports", (q: Sb) => q.eq("status", "pending")),
      safeCount(sb, "insurance_approvals", (q: Sb) => q.eq("status", "pending")),
      safeCount(sb, "invoices", (q: Sb) => q.eq("status", "unpaid")),
      safeCount(sb, "service_inquiries", (q: Sb) =>
        q.eq("source", "whatsapp").gte("created_at", `${today}T00:00:00Z`),
      ),
      safeCount(sb, "complaints", (q: Sb) => q.in("status", ["open", "new", "in_progress"])),
      safeCount(sb, "integration_logs", (q: Sb) =>
        q.eq("status", "error").gte("created_at", twentyFourHoursAgo),
      ),
    ]);

    const kpi = (
      key: CommandCenterKpiKey,
      label: string,
      res: { count: number | null; error: string | null },
      opts: { positiveIsGood: boolean; drillTo: string; hint?: string; isPercent?: boolean },
    ): CommandCenterKpiV2 => ({
      key,
      label,
      value: res.count,
      isPercent: opts.isPercent,
      positiveIsGood: opts.positiveIsGood,
      empty: res.error == null && (res.count ?? 0) === 0,
      unavailable: res.error != null,
      errorMessage: res.error ?? undefined,
      drillTo: opts.drillTo,
      hint: opts.hint,
    });

    // Pending = pending inquiries + new appointments awaiting confirmation
    const pendingCount =
      inquiriesPending.error || apptsPending.error
        ? null
        : (inquiriesPending.count ?? 0) + (apptsPending.count ?? 0);
    const pendingError = inquiriesPending.error ?? apptsPending.error;

    // No-show rate over 7d
    let noShowRateVal: number | null = null;
    let noShowError: string | null = null;
    if (apptsNoShow7d.error || apptsTotal7d.error) {
      noShowError = apptsNoShow7d.error ?? apptsTotal7d.error;
    } else {
      const total = apptsTotal7d.count ?? 0;
      const ns = apptsNoShow7d.count ?? 0;
      noShowRateVal = total > 0 ? Math.round((ns / total) * 100) : 0;
    }

    // Occupancy = booked / (booked + available)
    let occupancyVal: number | null = null;
    let occupancyError: string | null = null;
    if (slotsBookedToday.error || slotsAvailToday.error) {
      occupancyError = slotsBookedToday.error ?? slotsAvailToday.error;
    } else {
      const b = slotsBookedToday.count ?? 0;
      const a = slotsAvailToday.count ?? 0;
      occupancyVal = b + a > 0 ? Math.round((b / (b + a)) * 100) : 0;
    }

    // Pending reports = sum across the three tables (partial success allowed)
    const reportErrs = [medRepPending, labRepPending, radRepPending]
      .map((r) => r.error)
      .filter((e): e is string => Boolean(e));
    const reportSum =
      reportErrs.length === 3
        ? null
        : (medRepPending.count ?? 0) + (labRepPending.count ?? 0) + (radRepPending.count ?? 0);

    const kpis: CommandCenterKpiV2[] = [
      kpi("appointments_today", "مواعيد اليوم", apptsToday, {
        positiveIsGood: true,
        drillTo: "/appointments-queue",
        hint: "إجمالي المواعيد المجدولة اليوم",
      }),
      kpi("appointments_confirmed", "المواعيد المؤكدة", apptsConfirmed, {
        positiveIsGood: true,
        drillTo: "/appointments-queue?status=confirmed",
        hint: "مؤكدة اليوم",
      }),
      {
        key: "pending_requests",
        label: "طلبات قيد الانتظار",
        value: pendingCount,
        positiveIsGood: false,
        empty: pendingError == null && (pendingCount ?? 0) === 0,
        unavailable: pendingError != null,
        errorMessage: pendingError ?? undefined,
        drillTo: "/admin/inbox",
        hint: "استفسارات + مواعيد جديدة",
      },
      kpi("cancellations_today", "إلغاءات اليوم", apptsCancelledToday, {
        positiveIsGood: false,
        drillTo: "/appointments-queue?status=cancelled",
      }),
      {
        key: "no_show_rate",
        label: "معدل عدم الحضور (٧ أيام)",
        value: noShowRateVal,
        isPercent: true,
        positiveIsGood: false,
        empty: noShowError == null && noShowRateVal === 0,
        unavailable: noShowError != null,
        errorMessage: noShowError ?? undefined,
        drillTo: "/admin/no-show-stats",
      },
      {
        key: "occupancy",
        label: "إشغال العيادات",
        value: occupancyVal,
        isPercent: true,
        positiveIsGood: true,
        empty: occupancyError == null && occupancyVal === 0,
        unavailable: occupancyError != null,
        errorMessage: occupancyError ?? undefined,
        drillTo: "/availability-management",
        hint: "محجوز ÷ إجمالي المواعيد المتاحة اليوم",
      },
      kpi("available_slots", "مواعيد شاغرة اليوم", slotsAvailToday, {
        positiveIsGood: true,
        drillTo: "/availability-management",
      }),
      kpi("new_patients_today", "مرضى جدد اليوم", newPatientsToday, {
        positiveIsGood: true,
        drillTo: "/patients-management",
      }),
      {
        key: "pending_reports",
        label: "تقارير قيد المراجعة",
        value: reportSum,
        positiveIsGood: false,
        empty: reportErrs.length < 3 && (reportSum ?? 0) === 0,
        unavailable: reportErrs.length === 3,
        errorMessage: reportErrs[0],
        drillTo: "/admin/audit-logs",
        hint: "طبية + مختبر + أشعة",
      },
      kpi("insurance_pending", "موافقات التأمين المعلّقة", insurancePending, {
        positiveIsGood: false,
        drillTo: "/insurance/verify",
      }),
      kpi("invoices_unpaid", "فواتير غير مدفوعة", invoicesUnpaid, {
        positiveIsGood: false,
        drillTo: "/invoices/lookup",
      }),
      kpi("whatsapp_requests", "طلبات واتساب اليوم", whatsappToday, {
        positiveIsGood: true,
        drillTo: "/admin/inbox?source=whatsapp",
      }),
      kpi("support_open", "طلبات دعم مفتوحة", complaintsOpen, {
        positiveIsGood: false,
        drillTo: "/complaints-admin",
      }),
      kpi("integration_failures", "فشل تكاملات (٢٤س)", integrationFailures, {
        positiveIsGood: false,
        drillTo: "/admin/nphies-logs",
      }),
    ];

    return { kpis, fetchedAt: new Date().toISOString() };
  });
