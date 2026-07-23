/**
 * لقطة سريعة للوحة تحكم المريض — تُعيد بمكالمة واحدة:
 *  - الموعد القادم
 *  - التقارير الجديدة (آخر 7 أيام)
 *  - الإجراءات المطلوبة
 *  - الدفعات المستحقة
 *  - الوصفات النشطة
 *  - موافقات التأمين
 *  - طلبات الخدمة (استفسارات)
 *  - الإشعارات غير المقروءة
 *  - الإعلانات والعروض
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPatientAccess } from "@/lib/patient/authz.server";

export type QuickSnapshot = {
  nextAppointment: {
    id: string;
    date: string;
    time: string | null;
    status: string;
    reason: string | null;
    doctor: {
      id: string;
      name_ar: string;
      name_en: string | null;
      photo_url: string | null;
    } | null;
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
  prescriptions: {
    count: number;
    items: Array<{
      id: string;
      medication: string;
      dosage: string | null;
      status: string;
      refills_remaining: number | null;
    }>;
  };
  insuranceApprovals: {
    count: number;
    pending: number;
    approved: number;
    needsInfo: number;
    items: Array<{
      id: string;
      service_description: string | null;
      status: string;
      request_number: string | null;
      expires_at: string | null;
    }>;
  };
  serviceRequests: {
    count: number;
    open: number;
    items: Array<{
      id: string;
      request_number: string;
      service_label: string | null;
      internal_status: string;
      created_at: string;
    }>;
  };
  notifications: {
    unread: number;
    items: Array<{
      id: string;
      title: string | null;
      body: string | null;
      kind: string | null;
      created_at: string;
      read_at: string | null;
    }>;
  };
  announcements: Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    slug: string;
    published_at: string | null;
  }>;
  offers: Array<{
    id: string;
    title_ar: string;
    title_en: string | null;
    slug: string;
    cover_image_url: string | null;
    excerpt_ar: string | null;
    published_at: string | null;
  }>;
};

export const getPortalQuickSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<QuickSnapshot> => {
    const { supabase, userId } = context;
    await assertPatientAccess(supabase, userId, "dashboard");
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

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

    const empty = { data: [] as any[], error: null };

    const [
      apptRes,
      reportsRes,
      invoicesRes,
      insuranceRes,
      prescriptionsRes,
      inquiriesRes,
      notificationsRes,
      announcementsRes,
      offersRes,
    ] = await Promise.all([
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
        : Promise.resolve(empty),
      patientId
        ? supabase
            .from("invoices")
            .select("id, invoice_number, total, currency, status, issued_at")
            .eq("patient_id", patientId)
            .in("status", ["unpaid", "partially_paid", "pending"])
            .order("issued_at", { ascending: false })
            .limit(5)
        : Promise.resolve(empty),
      patientId
        ? supabase
            .from("insurance_approvals")
            .select("id, request_number, service_description, status, expires_at")
            .eq("patient_id", patientId)
            .order("submitted_at", { ascending: false })
            .limit(10)
        : Promise.resolve(empty),
      patientId
        ? supabase
            .from("prescriptions")
            .select("id, medication, dosage, status, refills_remaining, created_at")
            .eq("patient_id", patientId)
            .in("status", ["active", "pending"])
            .order("created_at", { ascending: false })
            .limit(5)
        : Promise.resolve(empty),
      supabase
        .from("service_inquiries")
        .select("id, request_number, service_label, internal_status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("notifications")
        .select("id, title, body, kind, created_at, read_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("custom_pages")
        .select("id, slug, title_ar, title_en, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(3),
      supabase
        .from("health_articles")
        .select("id, slug, title_ar, title_en, excerpt_ar, cover_image_url, published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(3),
    ]);

    // Next appointment enrichment
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

    // Outstanding invoices — subtract completed payments
    const invRows = (invoicesRes.data ?? []) as any[];
    const invIds = invRows.map((r) => r.id);
    const paidMap = new Map<string, number>();
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
    const outstandingItems = invRows
      .map((r) => {
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
      })
      .filter((r) => r.due_amount > 0);
    const outstandingTotal = outstandingItems.reduce((s, i) => s + i.due_amount, 0);

    // Insurance approvals — group
    const insRows = (insuranceRes.data ?? []) as any[];
    const insPending = insRows.filter((r) => r.status === "pending" || r.status === "submitted").length;
    const insApproved = insRows.filter((r) => r.status === "approved").length;
    const insNeedsInfo = insRows.filter((r) => r.status === "additional_info_required").length;

    // Service inquiries
    const inqRows = (inquiriesRes.data ?? []) as any[];
    const openInquiries = inqRows.filter(
      (r) => !["closed", "resolved", "cancelled"].includes(String(r.internal_status ?? "")),
    );

    // Notifications
    const notifRows = (notificationsRes.data ?? []) as any[];
    const unreadNotifications = notifRows.filter((r) => !r.read_at).length;

    // Required actions
    const actions: QuickSnapshot["requiredActions"]["items"] = [];
    if (!patientId) {
      actions.push({
        id: "link-patient",
        label: "أكمل ملفك الشخصي لربط حسابك بملف المريض",
        href: "/patient/profile",
        severity: "critical",
      });
    }
    if (profile && (!profile.national_id || !profile.date_of_birth)) {
      actions.push({
        id: "complete-profile",
        label: "استكمال بيانات الملف الشخصي (الهوية/تاريخ الميلاد)",
        href: "/patient/profile",
        severity: "warning",
      });
    }
    for (const ins of insRows.filter((r) => r.status === "additional_info_required")) {
      actions.push({
        id: `ins-${ins.id}`,
        label: `طلب تأمين يحتاج معلومات إضافية: ${ins.service_description ?? ""}`.trim(),
        href: "/patient/insurance",
        severity: "warning",
      });
    }
    if (outstandingItems.length > 0) {
      actions.push({
        id: "pay-invoices",
        label: `لديك ${outstandingItems.length} فاتورة مستحقة للدفع`,
        href: "/patient/billing",
        severity: "warning",
      });
    }

    const reportRows = (reportsRes.data ?? []) as any[];
    const rxRows = (prescriptionsRes.data ?? []) as any[];
    const annRows = (announcementsRes.data ?? []) as any[];
    const offerRows = (offersRes.data ?? []) as any[];

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
      requiredActions: { count: actions.length, items: actions },
      outstandingPayments: {
        total: outstandingTotal,
        currency: outstandingItems[0]?.currency ?? "SAR",
        count: outstandingItems.length,
        items: outstandingItems,
      },
      prescriptions: {
        count: rxRows.length,
        items: rxRows.map((r) => ({
          id: r.id,
          medication: r.medication,
          dosage: r.dosage ?? null,
          status: r.status,
          refills_remaining: r.refills_remaining ?? null,
        })),
      },
      insuranceApprovals: {
        count: insRows.length,
        pending: insPending,
        approved: insApproved,
        needsInfo: insNeedsInfo,
        items: insRows.slice(0, 5).map((r) => ({
          id: r.id,
          service_description: r.service_description ?? null,
          status: r.status,
          request_number: r.request_number ?? null,
          expires_at: r.expires_at ?? null,
        })),
      },
      serviceRequests: {
        count: inqRows.length,
        open: openInquiries.length,
        items: inqRows.map((r) => ({
          id: r.id,
          request_number: r.request_number,
          service_label: r.service_label ?? null,
          internal_status: r.internal_status,
          created_at: r.created_at,
        })),
      },
      notifications: {
        unread: unreadNotifications,
        items: notifRows.slice(0, 5).map((r) => ({
          id: r.id,
          title: r.title ?? null,
          body: r.body ?? null,
          kind: r.kind ?? null,
          created_at: r.created_at,
          read_at: r.read_at ?? null,
        })),
      },
      announcements: annRows.map((r) => ({
        id: r.id,
        title_ar: r.title_ar,
        title_en: r.title_en ?? null,
        slug: r.slug,
        published_at: r.published_at ?? null,
      })),
      offers: offerRows.map((r) => ({
        id: r.id,
        title_ar: r.title_ar,
        title_en: r.title_en ?? null,
        slug: r.slug,
        cover_image_url: r.cover_image_url ?? null,
        excerpt_ar: r.excerpt_ar ?? null,
        published_at: r.published_at ?? null,
      })),
    };
  });
