/**
 * لقطة سريعة للوحة تحكم المريض — تُعيد بمكالمة واحدة:
 *  - الموعد القادم
 *  - التقارير الجديدة (آخر 7 أيام)
 *  - الإجراءات المطلوبة (موافقات مفقودة، تأمين يحتاج معلومات، ملف ناقص)
 *  - الدفعات المستحقة
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QuickSnapshot = {
  nextAppointment: {
    id: string;
    date: string;
    time: string | null;
    status: string;
    reason: string | null;
    doctor: { id: string; name_ar: string; name_en: string | null; photo_url: string | null } | null;
    branch: { id: string; name_ar: string; name_en: string | null } | null;
  } | null;
  newReports: {
    count: number;
    since: string;
    items: Array<{
      id: string;
      title: string | null;
      report_type: string;
      published_at: string | null;
    }>;
  };
  requiredActions: {
    count: number;
    items: Array<{
      id: string;
      label: string;
      href: string;
      severity: "info" | "warning" | "critical";
    }>;
  };
  outstandingPayments: {
    total: number;
    currency: string;
    count: number;
    items: Array<{
      id: string;
      invoice_number: string | null;
      due_amount: number;
      total: number;
      currency: string;
      issued_at: string;
    }>;
  };
};

export const getPortalQuickSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<QuickSnapshot> => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

    // ملف المريض + الملف الشخصي (لمعرفة الحقول الناقصة)
    const [patientRes, profileRes] = await Promise.all([
      supabase.from("patients").select("id").eq("profile_id", userId).maybeSingle(),
      supabase
        .from("profiles")
        .select("national_id, date_of_birth, phone")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const patientId = patientRes.data?.id ?? null;
    const profile = profileRes.data;

    // مصفوفة استعلامات متوازية
    const [apptRes, reportsRes, invoicesRes, insuranceRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, appointment_date, appointment_time, status, reason, doctor_id, branch_id")
        .eq(patientId ? "patient_id" : "patient_phone", patientId ?? profile?.phone ?? "__none__")
        .gte("appointment_date", today)
        .in("status", ["new", "confirmed"])
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true })
        .limit(1),
      patientId
        ? supabase
            .from("medical_reports")
            .select("id, title_ar, title_en, report_type, published_at")
            .eq("patient_id", patientId)
            .eq("status", "published")
            .is("revoked_at", null)
            .gte("published_at", sevenDaysAgo)
            .order("published_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] as any[], error: null }),
      patientId
        ? supabase
            .from("invoices")
            .select("id, invoice_number, total, currency, status, issued_at")
            .eq("patient_id", patientId)
            .in("status", ["unpaid", "partially_paid", "pending"])
            .order("issued_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] as any[], error: null }),
      patientId
        ? supabase
            .from("insurance_approvals")
            .select("id, service_description, status")
            .eq("patient_id", patientId)
            .eq("status", "additional_info_required")
            .limit(5)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    // إثراء الموعد القادم بالطبيب/الفرع
    let nextAppointment: QuickSnapshot["nextAppointment"] = null;
    const a = apptRes.data?.[0];
    if (a) {
      const [docRes, brRes] = await Promise.all([
        a.doctor_id
          ? supabase
              .from("doctors")
              .select("id, name_ar, name_en, photo_url")
              .eq("id", a.doctor_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        a.branch_id
          ? supabase
              .from("branches")
              .select("id, name_ar, name_en")
              .eq("id", a.branch_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      nextAppointment = {
        id: a.id,
        date: a.appointment_date,
        time: a.appointment_time,
        status: a.status,
        reason: a.reason,
        doctor: (docRes.data as any) ?? null,
        branch: (brRes.data as any) ?? null,
      };
    }

    // الدفعات المستحقة — احسب المتبقي بعد الدفعات
    const invRows = (invoicesRes.data ?? []) as any[];
    const invIds = invRows.map((r) => r.id);
    let paidMap = new Map<string, number>();
    if (invIds.length) {
      const payRes = await supabase
        .from("payments")
        .select("invoice_id, amount, status")
        .in("invoice_id", invIds)
        .eq("status", "completed");
      for (const p of (payRes.data ?? []) as any[]) {
        paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
      }
    }
    const outstandingItems = invRows.map((r) => {
      const total = Number(r.total ?? 0);
      const paid = paidMap.get(r.id) ?? 0;
      return {
        id: r.id as string,
        invoice_number: r.invoice_number as string | null,
        total,
        due_amount: Math.max(0, total - paid),
        currency: (r.currency as string) ?? "SAR",
        issued_at: r.issued_at as string,
      };
    });
    const outstandingTotal = outstandingItems.reduce((s, i) => s + i.due_amount, 0);

    // الإجراءات المطلوبة
    const actions: QuickSnapshot["requiredActions"]["items"] = [];

    if (!patientId) {
      actions.push({
        id: "link-patient",
        label: "أكمل ملفك الشخصي لربط حسابك بملف المريض",
        href: "/portal/profile",
        severity: "critical",
      });
    }
    if (profile && (!profile.national_id || !profile.date_of_birth)) {
      actions.push({
        id: "complete-profile",
        label: "استكمال بيانات الملف الشخصي (الهوية/تاريخ الميلاد)",
        href: "/portal/profile",
        severity: "warning",
      });
    }
    for (const ins of (insuranceRes.data ?? []) as any[]) {
      actions.push({
        id: `ins-${ins.id}`,
        label: `طلب تأمين يحتاج معلومات إضافية: ${ins.service_description ?? ""}`.trim(),
        href: "/portal/insurance",
        severity: "warning",
      });
    }
    if (outstandingItems.length > 0) {
      actions.push({
        id: "pay-invoices",
        label: `لديك ${outstandingItems.length} فاتورة مستحقة للدفع`,
        href: "/portal/invoices",
        severity: "warning",
      });
    }

    const reportRows = (reportsRes.data ?? []) as any[];

    return {
      nextAppointment,
      newReports: {
        count: reportRows.length,
        since: sevenDaysAgo,
        items: reportRows.map((r) => ({
          id: r.id,
          title: r.title_ar ?? r.title_en ?? null,
          report_type: r.report_type,
          published_at: r.published_at,
        })),
      },
      requiredActions: {
        count: actions.length,
        items: actions,
      },
      outstandingPayments: {
        total: outstandingTotal,
        currency: outstandingItems[0]?.currency ?? "SAR",
        count: outstandingItems.length,
        items: outstandingItems,
      },
    };
  });
