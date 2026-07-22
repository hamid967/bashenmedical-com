/**
 * نظام حالات موحّد للعرض في الواجهة (Bashen Medical eServices).
 *
 * الفكرة: قواعد البيانات تحتفظ بحالاتها الخاصة لكل جدول (appointments, complaints,
 * medicine_orders, home_care_requests, second_opinion_requests, invoices,
 * lab_reports, radiology_reports). هذا الملف يوفّر طبقة **عرض** موحّدة:
 *   1. مفردات موحّدة مطابقة لملف المتطلبات:
 *      draft | submitted | under_review | waiting_patient | approved | rejected
 *      | scheduled | completed | cancelled.
 *   2. تسميات عربية.
 *   3. ألوان (Tailwind classes).
 *   4. ترتيب خطوة (0..N) على مسار تقدّم افتراضي حسب نوع الطلب.
 *
 * لا يعدّل قواعد البيانات؛ فقط يحوّل عند العرض. أي حالة غير معروفة تعود
 * "submitted" بشكل آمن مع تحذير في وحدة التحكّم بدلاً من كسر الواجهة.
 */

export type UnifiedStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "waiting_patient"
  | "approved"
  | "rejected"
  | "scheduled"
  | "completed"
  | "cancelled";

export const UNIFIED_STATUS_LABELS_AR: Record<UnifiedStatus, string> = {
  draft: "مسودة",
  submitted: "تم الإرسال",
  under_review: "تحت المراجعة",
  waiting_patient: "بانتظار إجراء من المريض",
  approved: "مقبول",
  rejected: "مرفوض",
  scheduled: "مجدول",
  completed: "مكتمل",
  cancelled: "ملغي",
};

/** أصناف Tailwind للـbadge (خلفية/نص/حدود متناسقة مع الثيم الطبي). */
export const UNIFIED_STATUS_STYLES: Record<UnifiedStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  submitted: "bg-sky-50 text-sky-700 border-sky-200",
  under_review: "bg-amber-50 text-amber-700 border-amber-200",
  waiting_patient: "bg-orange-50 text-orange-700 border-orange-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  scheduled: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed: "bg-teal-50 text-teal-700 border-teal-200",
  cancelled: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

/** ✅ الحالات النهائية (لا تقدّم بعدها). */
export const FINAL_UNIFIED_STATUSES: readonly UnifiedStatus[] = [
  "completed",
  "cancelled",
  "rejected",
] as const;

export function isFinalUnifiedStatus(s: UnifiedStatus): boolean {
  return (FINAL_UNIFIED_STATUSES as readonly string[]).includes(s);
}

// ============================================================================
// أنواع الطلبات المدعومة
// ============================================================================

export type OrderTableKind =
  | "appointment"
  | "complaint"
  | "medicine_order"
  | "home_care"
  | "second_opinion"
  | "invoice"
  | "lab_report"
  | "radiology_report";

// ============================================================================
// خرائط تحويل: حالة الجدول → حالة موحّدة
// ============================================================================

// appointments.status
const APPOINTMENT_MAP: Record<string, UnifiedStatus> = {
  new: "submitted",
  pending: "submitted",
  confirmed: "scheduled",
  in_progress: "under_review",
  completed: "completed",
  cancelled: "cancelled",
  no_show: "cancelled",
  rescheduled: "scheduled",
};

// complaints.status
const COMPLAINT_MAP: Record<string, UnifiedStatus> = {
  submitted: "submitted",
  under_review: "under_review",
  waiting_patient: "waiting_patient",
  resolved: "completed",
  closed: "completed",
  rejected: "rejected",
  cancelled: "cancelled",
};

// medicine_orders.status
const MEDICINE_MAP: Record<string, UnifiedStatus> = {
  new: "submitted",
  received: "submitted",
  under_review: "under_review",
  needs_prescription: "waiting_patient",
  ready: "approved",
  out_for_delivery: "approved",
  delivered: "completed",
  completed: "completed",
  cancelled: "cancelled",
  rejected: "rejected",
};

// home_care_requests.status
const HOME_CARE_MAP: Record<string, UnifiedStatus> = {
  new: "submitted",
  submitted: "submitted",
  in_review: "under_review",
  under_review: "under_review",
  scheduled: "scheduled",
  in_progress: "under_review",
  completed: "completed",
  cancelled: "cancelled",
  rejected: "rejected",
};

// second_opinion_requests.status
const SECOND_OPINION_MAP: Record<string, UnifiedStatus> = {
  new: "submitted",
  in_review: "under_review",
  under_review: "under_review",
  answered: "completed",
  closed: "completed",
  cancelled: "cancelled",
  rejected: "rejected",
};

// invoices.status
const INVOICE_MAP: Record<string, UnifiedStatus> = {
  draft: "draft",
  issued: "submitted",
  unpaid: "waiting_patient",
  partial: "waiting_patient",
  partially_refunded: "completed",
  paid: "completed",
  refunded: "completed",
  cancelled: "cancelled",
  void: "cancelled",
};

// lab_reports.status
const LAB_MAP: Record<string, UnifiedStatus> = {
  requested: "submitted",
  in_progress: "under_review",
  processing: "under_review",
  ready: "completed",
  final: "completed",
  needs_doctor_review: "waiting_patient",
  cancelled: "cancelled",
};

// radiology_reports.status
const RADIOLOGY_MAP: Record<string, UnifiedStatus> = {
  requested: "submitted",
  in_progress: "under_review",
  processing: "under_review",
  ready: "completed",
  final: "completed",
  needs_doctor_review: "waiting_patient",
  cancelled: "cancelled",
};

const MAPS: Record<OrderTableKind, Record<string, UnifiedStatus>> = {
  appointment: APPOINTMENT_MAP,
  complaint: COMPLAINT_MAP,
  medicine_order: MEDICINE_MAP,
  home_care: HOME_CARE_MAP,
  second_opinion: SECOND_OPINION_MAP,
  invoice: INVOICE_MAP,
  lab_report: LAB_MAP,
  radiology_report: RADIOLOGY_MAP,
};

/**
 * يحوّل حالة خام من الجدول إلى الحالة الموحّدة للعرض.
 * أي قيمة غير معروفة تُرجع "submitted" لتفادي كسر الواجهة.
 */
export function toUnifiedStatus(
  kind: OrderTableKind,
  raw: string | null | undefined,
): UnifiedStatus {
  if (!raw) return "submitted";
  const mapped = MAPS[kind]?.[raw];
  if (mapped) return mapped;
  if ((raw as UnifiedStatus) in UNIFIED_STATUS_LABELS_AR) {
    return raw as UnifiedStatus;
  }
  if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(`[unified-status] حالة غير معروفة لـ ${kind}: "${raw}"`);
  }
  return "submitted";
}

// ============================================================================
// خطوات التقدّم لكل نوع طلب (مسار مبسّط للمستخدم)
// ============================================================================

export type ProgressStep = {
  key: UnifiedStatus;
  label: string;
};

const APPOINTMENT_STEPS: ProgressStep[] = [
  { key: "submitted", label: "تم الإرسال" },
  { key: "scheduled", label: "مؤكد/مجدول" },
  { key: "under_review", label: "قيد التنفيذ" },
  { key: "completed", label: "مكتمل" },
];

const COMPLAINT_STEPS: ProgressStep[] = [
  { key: "submitted", label: "تم الإرسال" },
  { key: "under_review", label: "تحت المراجعة" },
  { key: "waiting_patient", label: "بانتظار المريض" },
  { key: "completed", label: "مغلقة" },
];

const MEDICINE_STEPS: ProgressStep[] = [
  { key: "submitted", label: "تم الاستلام" },
  { key: "under_review", label: "مراجعة الصيدلي" },
  { key: "approved", label: "جاهز / قيد التوصيل" },
  { key: "completed", label: "مكتمل" },
];

const HOME_CARE_STEPS: ProgressStep[] = [
  { key: "submitted", label: "تم الإرسال" },
  { key: "under_review", label: "تحت المراجعة" },
  { key: "scheduled", label: "مجدول" },
  { key: "completed", label: "مكتمل" },
];

const SECOND_OPINION_STEPS: ProgressStep[] = [
  { key: "submitted", label: "تم الإرسال" },
  { key: "under_review", label: "قيد المراجعة" },
  { key: "completed", label: "تم الرد" },
];

const INVOICE_STEPS: ProgressStep[] = [
  { key: "submitted", label: "صادرة" },
  { key: "waiting_patient", label: "بانتظار الدفع" },
  { key: "completed", label: "مدفوعة" },
];

const LAB_STEPS: ProgressStep[] = [
  { key: "submitted", label: "استُلمت العينة" },
  { key: "under_review", label: "قيد المعالجة" },
  { key: "waiting_patient", label: "تحتاج مراجعة طبيب" },
  { key: "completed", label: "جاهزة" },
];

const RADIOLOGY_STEPS: ProgressStep[] = [
  { key: "submitted", label: "طلب الفحص" },
  { key: "under_review", label: "قيد التقرير" },
  { key: "waiting_patient", label: "تحتاج مراجعة طبيب" },
  { key: "completed", label: "التقرير جاهز" },
];

const STEPS_BY_KIND: Record<OrderTableKind, ProgressStep[]> = {
  appointment: APPOINTMENT_STEPS,
  complaint: COMPLAINT_STEPS,
  medicine_order: MEDICINE_STEPS,
  home_care: HOME_CARE_STEPS,
  second_opinion: SECOND_OPINION_STEPS,
  invoice: INVOICE_STEPS,
  lab_report: LAB_STEPS,
  radiology_report: RADIOLOGY_STEPS,
};

export function getProgressSteps(kind: OrderTableKind): ProgressStep[] {
  return STEPS_BY_KIND[kind];
}

/**
 * يُرجع فهرس الخطوة الحالية (0-based) على مسار التقدّم للنوع المعطى.
 * الحالات النهائية غير-completed (rejected/cancelled) تُرجع -1 (مسار مقطوع).
 */
export function getCurrentStepIndex(kind: OrderTableKind, status: UnifiedStatus): number {
  if (status === "rejected" || status === "cancelled") return -1;
  const steps = STEPS_BY_KIND[kind];
  const idx = steps.findIndex((s) => s.key === status);
  if (idx >= 0) return idx;
  // fallback: draft قبل submitted، أي غير مطابق => أول خطوة
  if (status === "draft") return 0;
  if (status === "approved") {
    const approvedIdx = steps.findIndex((s) => s.key === "approved");
    if (approvedIdx >= 0) return approvedIdx;
    // إن لم يكن approved جزءاً من الخط، اعتبره قبل completed
    const completedIdx = steps.findIndex((s) => s.key === "completed");
    return completedIdx > 0 ? completedIdx - 1 : 0;
  }
  return 0;
}
