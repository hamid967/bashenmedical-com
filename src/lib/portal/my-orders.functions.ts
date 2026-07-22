import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * قائمة "طلباتي الأخيرة" الموحّدة للوحة المريض (Bashen Medical eServices).
 *
 * تجمع من عدة جداول (مواعيد، بلاغات، أدوية، زيارات منزلية، استشارات، فواتير،
 * مختبر، أشعة) وترجع أحدث ما لا يتجاوز `limit` من طلبات المستخدم الحالي.
 *
 * ربط المستخدم بالبيانات:
 *   - جداول تحمل `patient_id` (uuid) → عبر patients.profile_id = auth.uid()
 *   - جداول تعتمد `patient_phone` (نصية) → عبر profiles.phone
 *
 * كل الاستعلامات موازية، ثم تُدمج وتُرتب زمنيّاً.
 */

export type MyRecentOrder = {
  kind:
    | "appointment"
    | "complaint"
    | "medicine_order"
    | "home_care"
    | "second_opinion"
    | "invoice"
    | "lab_report"
    | "radiology_report";
  id: string;
  reference: string | null;
  title: string;
  status: string;
  created_at: string;
  href: string | null;
};

const KIND_TITLES: Record<MyRecentOrder["kind"], string> = {
  appointment: "موعد",
  complaint: "بلاغ / شكوى",
  medicine_order: "طلب دواء",
  home_care: "زيارة منزلية",
  second_opinion: "استشارة عن بُعد",
  invoice: "فاتورة",
  lab_report: "نتيجة مختبر",
  radiology_report: "تقرير أشعة",
};

export const getMyRecentOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // 1) هوية المريض (patient row) + هاتف الملف الشخصي — للربط عبر الهاتف
    const [{ data: profile }, { data: patient }] = await Promise.all([
      supabase.from("profiles").select("phone").eq("id", userId).maybeSingle(),
      supabase
        .from("patients")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle(),
    ]);

    const patientId = patient?.id ?? null;
    const phone = profile?.phone ?? null;

    // 2) استعلامات موازية
    // مواعيد: patient_id أو phone
    const apptById = patientId
      ? supabase
          .from("appointments")
          .select("id, status, created_at, appointment_date, appointment_time, patient_name")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });
    const apptByPhone = phone
      ? supabase
          .from("appointments")
          .select("id, status, created_at, appointment_date, appointment_time, patient_name")
          .eq("patient_phone", phone)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });

    // بلاغات: phone فقط (ملف complaints يحمل patient_phone)
    const complaints = phone
      ? supabase
          .from("complaints")
          .select("id, reference, message, status, created_at")
          .eq("patient_phone", phone)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });

    // صيدلية: phone
    const meds = phone
      ? supabase
          .from("medicine_orders")
          .select("id, status, created_at, delivery_type, patient_name")
          .eq("patient_phone", phone)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });

    // زيارة منزلية: phone
    const homeCare = phone
      ? supabase
          .from("home_care_requests")
          .select("id, status, created_at, patient_name")
          .eq("patient_phone", phone)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });

    // استشارة عن بُعد: عبر عمود phone
    const secondOp = phone
      ? supabase
          .from("second_opinion_requests")
          .select("id, status, created_at, specialty, patient_name")
          .eq("phone", phone)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });

    // فواتير / مختبر / أشعة: patient_id فقط
    const invoices = patientId
      ? supabase
          .from("invoices")
          .select("id, invoice_number, status, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });

    const labs = patientId
      ? supabase
          .from("lab_reports")
          .select("id, title, test_type, status, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });

    const rads = patientId
      ? supabase
          .from("radiology_reports")
          .select("id, status, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as unknown[], error: null });

    const [aById, aByPhone, cRes, mRes, hRes, sRes, iRes, lRes, rRes] = await Promise.all([
      apptById,
      apptByPhone,
      complaints,
      meds,
      homeCare,
      secondOp,
      invoices,
      labs,
      rads,
    ]);

    const out: MyRecentOrder[] = [];

    const pushAppt = (rows: unknown[]) => {
      for (const raw of rows) {
        const r = raw as {
          id: string;
          status: string;
          created_at: string;
          appointment_date: string | null;
          appointment_time: string | null;
          patient_name: string | null;
        };
        out.push({
          kind: "appointment",
          id: r.id,
          reference: null,
          title: `${KIND_TITLES.appointment}${
            r.appointment_date ? ` — ${r.appointment_date}${r.appointment_time ? " " + r.appointment_time.slice(0, 5) : ""}` : ""
          }`,
          status: r.status,
          created_at: r.created_at,
          href: "/portal/book",
        });
      }
    };
    // دمج مع منع التكرار (patient_id + phone قد يجلبان نفس السجل)
    const apptSeen = new Set<string>();
    for (const raw of [...(aById.data ?? []), ...(aByPhone.data ?? [])] as Array<{ id: string }>) {
      if (apptSeen.has(raw.id)) continue;
      apptSeen.add(raw.id);
      pushAppt([raw]);
    }

    for (const raw of (cRes.data ?? []) as Array<{
      id: string;
      reference: string;
      message: string;
      status: string;
      created_at: string;
    }>) {
      out.push({
        kind: "complaint",
        id: raw.id,
        reference: raw.reference,
        title: `${KIND_TITLES.complaint} — ${raw.reference}`,
        status: raw.status,
        created_at: raw.created_at,
        href: "/portal/complaints",
      });
    }

    for (const raw of (mRes.data ?? []) as Array<{
      id: string;
      status: string;
      created_at: string;
      delivery_type: string | null;
    }>) {
      out.push({
        kind: "medicine_order",
        id: raw.id,
        reference: null,
        title: `${KIND_TITLES.medicine_order}${raw.delivery_type ? ` (${raw.delivery_type})` : ""}`,
        status: raw.status,
        created_at: raw.created_at,
        href: null,
      });
    }

    for (const raw of (hRes.data ?? []) as Array<{
      id: string;
      status: string;
      created_at: string;
    }>) {
      out.push({
        kind: "home_care",
        id: raw.id,
        reference: null,
        title: KIND_TITLES.home_care,
        status: raw.status,
        created_at: raw.created_at,
        href: null,
      });
    }

    for (const raw of (sRes.data ?? []) as Array<{
      id: string;
      status: string;
      created_at: string;
      specialty: string | null;
      patient_name: string | null;
    }>) {
      out.push({
        kind: "second_opinion",
        id: raw.id,
        reference: null,
        title: `${KIND_TITLES.second_opinion}${raw.specialty ? ` — ${raw.specialty}` : ""}`,
        status: raw.status,
        created_at: raw.created_at,
        href: null,
      });
    }

    for (const raw of (iRes.data ?? []) as Array<{
      id: string;
      invoice_number: string;
      status: string;
      created_at: string;
    }>) {
      out.push({
        kind: "invoice",
        id: raw.id,
        reference: raw.invoice_number,
        title: `${KIND_TITLES.invoice} — ${raw.invoice_number}`,
        status: raw.status,
        created_at: raw.created_at,
        href: "/portal/invoices",
      });
    }

    for (const raw of (lRes.data ?? []) as Array<{
      id: string;
      title: string | null;
      test_type: string | null;
      status: string;
      created_at: string;
    }>) {
      out.push({
        kind: "lab_report",
        id: raw.id,
        reference: null,
        title: `${KIND_TITLES.lab_report} — ${raw.title ?? raw.test_type ?? ""}`.trim(),
        status: raw.status,
        created_at: raw.created_at,
        href: "/portal/laboratory",
      });
    }

    for (const raw of (rRes.data ?? []) as Array<{
      id: string;
      status: string;
      created_at: string;
    }>) {
      out.push({
        kind: "radiology_report",
        id: raw.id,
        reference: null,
        title: KIND_TITLES.radiology_report,
        status: raw.status,
        created_at: raw.created_at,
        href: "/portal/radiology",
      });
    }

    // ترتيب زمني نزولاً ثم قص لأحدث 15
    out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return out.slice(0, 15);
  });
