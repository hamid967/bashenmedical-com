/**
 * تفاصيل طلب موحّد (Admin) — Bashen Medical.
 *
 * تُرجع، حسب نوع الطلب (kind) ومعرّفه (id):
 *   - order: صف الجدول الأصلي (subset آمن).
 *   - patient: معلومات المريض إن أمكن ربطه (patient_id أو phone).
 *   - attachments: مرفقات patient_attachments المرتبطة بالمريض.
 *   - timeline: أحداث بترتيب زمني تصاعدي
 *       * appointment_audit للمواعيد.
 *       * إنشاء/تحديث لبقية الأنواع.
 *
 * الوصول: admin / reception / super_admin فقط.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { OrderTableKind } from "@/lib/unified-status";

type Role = "admin" | "reception" | "pharmacy" | "super_admin";
async function getRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}
function ensureAdminOrReception(roles: Role[]) {
  if (roles.includes("super_admin")) return;
  if (!roles.some((r) => r === "admin" || r === "reception")) {
    throw new Error("ليست لديك الصلاحية لعرض تفاصيل الطلب.");
  }
}

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

export type TimelineEvent = {
  at: string;
  kind: "created" | "updated" | "status" | "notes" | "note";
  title: string;
  detail?: string | null;
  actor?: string | null;
};

export type OrderDetails = {
  kind: OrderTableKind;
  id: string;
  order: Record<string, any>;
  patient: {
    id: string | null;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    date_of_birth: string | null;
    gender: string | null;
  } | null;
  attachments: Array<{
    id: string;
    file_name: string | null;
    file_url: string | null;
    mime_type: string | null;
    created_at: string;
  }>;
  timeline: TimelineEvent[];
};

export const getOrderDetails = createServerFn({ method: "GET" })
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
  .handler(async ({ data, context }): Promise<OrderDetails> => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureAdminOrReception(roles);

    const supabase = context.supabase;
    const table = KIND_TO_TABLE[data.kind];

    const { data: order, error } = await supabase
      .from(table as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("لم يُعثر على الطلب.");

    // resolve patient (best-effort)
    let patientRow: any = null;
    const phone: string | null =
      (order as any).patient_phone ?? (order as any).phone ?? null;
    const patientId: string | null = (order as any).patient_id ?? null;
    if (patientId) {
      const { data: p } = await supabase
        .from("patients")
        .select("id, full_name, phone, email, date_of_birth, gender")
        .eq("id", patientId)
        .maybeSingle();
      patientRow = p ?? null;
    } else if (phone) {
      const { data: p } = await supabase
        .from("patients")
        .select("id, full_name, phone, email, date_of_birth, gender")
        .eq("phone", phone)
        .maybeSingle();
      patientRow = p ?? null;
    }

    // attachments (patient scope)
    let attachments: OrderDetails["attachments"] = [];
    if (patientRow?.id) {
      const { data: atts } = await supabase
        .from("patient_attachments")
        .select("id, file_name, file_url, mime_type, created_at")
        .eq("patient_id", patientRow.id)
        .order("created_at", { ascending: false })
        .limit(50);
      attachments = (atts ?? []) as any;
    }

    // timeline
    const timeline: TimelineEvent[] = [];
    if ((order as any).created_at) {
      timeline.push({
        at: (order as any).created_at,
        kind: "created",
        title: "تم إنشاء الطلب",
      });
    }

    if (data.kind === "appointment") {
      const { data: audit } = await supabase
        .from("appointment_audit")
        .select("*")
        .eq("appointment_id", data.id)
        .order("changed_at", { ascending: true })
        .limit(200);
      // enrich actors
      const actorIds = Array.from(
        new Set(((audit ?? []) as any[]).map((r) => r.changed_by).filter(Boolean)),
      );
      const nameById = new Map<string, string>();
      if (actorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        for (const p of (profs ?? []) as any[]) nameById.set(p.id, p.full_name ?? "");
      }
      for (const row of (audit ?? []) as any[]) {
        const actor =
          (row.changed_by && nameById.get(row.changed_by)) ||
          row.actor_kind ||
          null;
        if (row.old_status || row.new_status) {
          timeline.push({
            at: row.changed_at,
            kind: "status",
            title: `تغيّرت الحالة: ${row.old_status ?? "∅"} → ${row.new_status ?? "∅"}`,
            detail: row.reason ?? null,
            actor,
          });
        }
        if ((row.old_notes ?? "") !== (row.new_notes ?? "")) {
          timeline.push({
            at: row.changed_at,
            kind: "notes",
            title: "تحديث الملاحظات",
            detail: row.new_notes ?? null,
            actor,
          });
        }
      }
    } else if ((order as any).updated_at && (order as any).updated_at !== (order as any).created_at) {
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
      patient: patientRow,
      attachments,
      timeline,
    };
  });
