/**
 * تفاصيل طلب واحد للمريض في بوابة المريض (Bashen Medical).
 *
 * يتحقق من ملكية الطلب للمريض الحالي عبر:
 *   - patient_id = patients.id حيث profile_id = auth.uid()
 *   - أو patient_phone / phone = profiles.phone
 *
 * يُرجع نفس شكل OrderDetails للوحة الإدارة، مع مرفقات المريض
 * المخزّنة في patient_attachments (RLS يضمن العزل).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { OrderTableKind } from "@/lib/unified-status";

const KIND_TO_TABLE: Record<OrderTableKind, string> = {
  appointment: "appointments",
  complaint: "complaints",
  medicine_order: "medicine_orders",
  home_care: "home_care_requests",
  second_opinion: "second_opinion_requests",
  invoice: "invoices",
  lab_report: "lab_reports",
  radiology_report: "radiology_reports",
};

export type MyOrderTimelineEvent = {
  at: string;
  kind: "created" | "updated" | "status" | "notes";
  title: string;
  detail?: string | null;
};

export type MyOrderDetails = {
  kind: OrderTableKind;
  id: string;
  order: Record<string, any>;
  attachments: Array<{
    id: string;
    file_name: string | null;
    file_url: string | null;
    mime_type: string | null;
    created_at: string;
  }>;
  timeline: MyOrderTimelineEvent[];
};

export const getMyOrderDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        kind: z.enum([
          "appointment",
          "complaint",
          "medicine_order",
          "home_care",
          "second_opinion",
          "invoice",
          "lab_report",
          "radiology_report",
        ]),
        id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<MyOrderDetails> => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: patient }] = await Promise.all([
      supabase.from("profiles").select("phone").eq("id", userId).maybeSingle(),
      supabase.from("patients").select("id").eq("profile_id", userId).maybeSingle(),
    ]);
    const phone = profile?.phone ?? null;
    const patientId = patient?.id ?? null;

    const { data: order, error } = await supabase
      .from(KIND_TO_TABLE[data.kind] as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("لم يُعثر على الطلب.");

    // ownership check (بعد التحقق من RLS، هذا حزام أمان إضافي على مستوى التطبيق).
    const ownerByPatient = patientId && (order as any).patient_id === patientId;
    const ownerByPhone =
      phone &&
      ((order as any).patient_phone === phone || (order as any).phone === phone);
    if (!ownerByPatient && !ownerByPhone) {
      throw new Error("لا تملك صلاحية الاطّلاع على هذا الطلب.");
    }

    // attachments (للمريض الحالي فقط)
    let attachments: MyOrderDetails["attachments"] = [];
    if (patientId) {
      const { data: atts } = await supabase
        .from("patient_attachments")
        .select("id, file_name, file_url, mime_type, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(50);
      attachments = (atts ?? []) as any;
    }

    // timeline
    const timeline: MyOrderTimelineEvent[] = [];
    if ((order as any).created_at) {
      timeline.push({
        at: (order as any).created_at,
        kind: "created",
        title: "تم إرسال الطلب",
      });
    }
    if (data.kind === "appointment") {
      // list_appointment_audit_by_ref يتطلّب رقم حجز + جوال، لذا نقرأ الجدول مباشرة.
      const { data: audit } = await supabase
        .from("appointment_audit")
        .select("changed_at, old_status, new_status, old_notes, new_notes, reason")
        .eq("appointment_id", data.id)
        .order("changed_at", { ascending: true })
        .limit(200);
      for (const row of (audit ?? []) as any[]) {
        if (row.old_status || row.new_status) {
          timeline.push({
            at: row.changed_at,
            kind: "status",
            title: `تحدّثت الحالة: ${row.old_status ?? "∅"} → ${row.new_status ?? "∅"}`,
            detail: row.reason ?? null,
          });
        }
        if ((row.old_notes ?? "") !== (row.new_notes ?? "")) {
          timeline.push({
            at: row.changed_at,
            kind: "notes",
            title: "تحديث الملاحظات",
            detail: row.new_notes ?? null,
          });
        }
      }
    } else if (
      (order as any).updated_at &&
      (order as any).updated_at !== (order as any).created_at
    ) {
      timeline.push({
        at: (order as any).updated_at,
        kind: "updated",
        title: "تحديث الطلب",
      });
    }
    timeline.sort((a, b) => (a.at < b.at ? -1 : 1));

    return {
      kind: data.kind,
      id: data.id,
      order: order as any,
      attachments,
      timeline,
    };
  });
