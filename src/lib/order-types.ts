/**
 * أنواع صارمة لطلبات المراجع في الصفحات العامة (/my-orders, /lookup, /orders/$ref).
 *
 * لماذا هنا؟ الـRPCs المرتبطة (`track_orders_by_phone`, `get_order_by_ref`) تُرجع
 * `kind: string` و`metadata: Json` (unknown-shaped). هذا الملف يوفّر:
 *   1. Unions محدّدة لأنواع الطلبات وحالاتها.
 *   2. Discriminated union لتفاصيل الطلب بحسب النوع (metadata مكتوبة).
 *   3. Parsers/type-guards تُحوّل مخرجات الـRPC غير الآمنة إلى أنواع مضمونة.
 *
 * لا تُضاف حقول جديدة إلا بعد إضافتها في الـmigration المقابل — أي وصول لحقل
 * غير مُعلن هنا يفشل عند الترجمة.
 */

export type OrderKind = "appointment" | "pharmacy" | "second_opinion" | "home_care";

export const ORDER_KINDS: readonly OrderKind[] = [
  "appointment",
  "pharmacy",
  "second_opinion",
  "home_care",
] as const;

/** كل الحالات المسموحة عبر أنواع الطلبات (اتحاد شامل). */
export type OrderStatus =
  | "new"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "in_review"
  | "answered"
  | "closed"
  | "processing"
  | "ready"
  | "delivered"
  | "in_progress";

const ORDER_STATUSES = new Set<OrderStatus>([
  "new",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
  "in_review",
  "answered",
  "closed",
  "processing",
  "ready",
  "delivered",
  "in_progress",
]);

/**
 * ملخّص طلب من `track_orders_by_phone` — لا يتضمّن id ولا metadata حسّاسة عمدًا.
 * أي وصول لـ `.id` أو `.metadata` هنا فشل ترجمة.
 */
export type OrderSummary = {
  kind: OrderKind;
  reference: string;
  title: string;
  status: OrderStatus;
  created_at: string;
  scheduled_at: string | null;
};

// ============================================================================
// Metadata مكتوبة لكل نوع طلب (Discriminated union)
// ============================================================================

export type AppointmentMetadata = {
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  reason: string | null;
  notes: string | null;
  specialty_id: string | null;
  doctor_id: string | null;
  specialty_name_ar: string | null;
  specialty_name_en: string | null;
  doctor_name_ar: string | null;
  doctor_name_en: string | null;
  reminder_24h: boolean | null;
  reminder_2h: boolean | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
};

export type PharmacyMetadata = {
  delivery_type: string | null;
  address: string | null;
  district: string | null;
  notes: string | null;
};

export type SecondOpinionMetadata = {
  specialty: string | null;
  email: string | null;
};

export type HomeCareMetadata = {
  address: string | null;
  notes: string | null;
};

// ============================================================================
// OrderDetail — Discriminated union كامل
// ============================================================================

type BaseDetail = {
  id: string;
  reference: string;
  title: string;
  status: OrderStatus;
  created_at: string;
  scheduled_at: string | null;
};

export type AppointmentDetail = BaseDetail & { kind: "appointment"; metadata: AppointmentMetadata };
export type PharmacyDetail = BaseDetail & { kind: "pharmacy"; metadata: PharmacyMetadata };
export type SecondOpinionDetail = BaseDetail & {
  kind: "second_opinion";
  metadata: SecondOpinionMetadata;
};
export type HomeCareDetail = BaseDetail & { kind: "home_care"; metadata: HomeCareMetadata };

export type OrderDetail = AppointmentDetail | PharmacyDetail | SecondOpinionDetail | HomeCareDetail;

// ============================================================================
// Parsers — تحويل مخرجات الـRPC (unknown-ish) إلى أنواع صارمة
// ============================================================================

const isKind = (v: unknown): v is OrderKind =>
  typeof v === "string" && (ORDER_KINDS as readonly string[]).includes(v);

const isStatus = (v: unknown): v is OrderStatus =>
  typeof v === "string" && ORDER_STATUSES.has(v as OrderStatus);

const asString = (v: unknown): string | null =>
  typeof v === "string" ? v : v == null ? null : String(v);

const asBool = (v: unknown): boolean | null =>
  typeof v === "boolean" ? v : v == null ? null : Boolean(v);

type SummaryRow = {
  kind: string;
  reference: string;
  title: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
};

/** خطأ مخصّص يُرفع عندما تصل بيانات لا تطابق الأنواع المُعلنة. */
export class OrderParseError extends Error {
  readonly kind: string | null;
  readonly status: string | null;
  readonly reference: string | null;
  constructor(
    message: string,
    opts: { kind?: string | null; status?: string | null; reference?: string | null } = {},
  ) {
    super(message);
    this.name = "OrderParseError";
    this.kind = opts.kind ?? null;
    this.status = opts.status ?? null;
    this.reference = opts.reference ?? null;
  }
}

/**
 * يحوّل صفوف الملخّص إلى `OrderSummary[]`. يرفع `OrderParseError` عند أول صف
 * يحمل نوعًا أو حالة غير معروفة — بدل الابتلاع الصامت — كي تستطيع الواجهة إخبار
 * المستخدم بأن هناك سجلًا لا يمكن عرضه.
 */
export function parseOrderSummaries(
  rows: readonly SummaryRow[] | null | undefined,
): OrderSummary[] {
  if (!rows) return [];
  const out: OrderSummary[] = [];
  for (const r of rows) {
    if (!isKind(r.kind)) {
      throw new OrderParseError(`نوع طلب غير معروف: ${r.kind}`, {
        kind: r.kind,
        reference: r.reference ?? null,
      });
    }
    if (!isStatus(r.status)) {
      throw new OrderParseError(`حالة طلب غير معروفة: ${r.status}`, {
        kind: r.kind,
        status: r.status,
        reference: r.reference ?? null,
      });
    }
    out.push({
      kind: r.kind,
      reference: r.reference,
      title: r.title,
      status: r.status,
      created_at: r.created_at,
      scheduled_at: r.scheduled_at,
    });
  }
  return out;
}

type DetailRow = {
  kind: string;
  id: string;
  reference: string;
  title: string;
  status: string;
  created_at: string;
  scheduled_at: string | null;
  metadata: unknown;
};

/** يحوّل صف تفاصيل الطلب إلى `OrderDetail` مكتوب — يُرجع null عند نوع/حالة غير معروفة. */
export function parseOrderDetail(row: DetailRow | null | undefined): OrderDetail | null {
  if (!row) return null;
  if (!isKind(row.kind)) {
    throw new OrderParseError(`نوع طلب غير معروف: ${row.kind}`, {
      kind: row.kind,
      reference: row.reference ?? null,
    });
  }
  if (!isStatus(row.status)) {
    throw new OrderParseError(`حالة طلب غير معروفة: ${row.status}`, {
      kind: row.kind,
      status: row.status,
      reference: row.reference ?? null,
    });
  }

  const m = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<
    string,
    unknown
  >;
  const base: BaseDetail = {
    id: row.id,
    reference: row.reference,
    title: row.title,
    status: row.status,
    created_at: row.created_at,
    scheduled_at: row.scheduled_at,
  };
  switch (row.kind) {
    case "appointment":
      return {
        ...base,
        kind: "appointment",
        metadata: {
          patient_name: asString(m.patient_name) ?? "",
          patient_phone: asString(m.patient_phone) ?? "",
          appointment_date: asString(m.appointment_date) ?? "",
          appointment_time: asString(m.appointment_time) ?? "",
          reason: asString(m.reason),
          notes: asString(m.notes),
          specialty_id: asString(m.specialty_id),
          doctor_id: asString(m.doctor_id),
          specialty_name_ar: asString(m.specialty_name_ar),
          specialty_name_en: asString(m.specialty_name_en),
          doctor_name_ar: asString(m.doctor_name_ar),
          doctor_name_en: asString(m.doctor_name_en),
          reminder_24h: asBool(m.reminder_24h),
          reminder_2h: asBool(m.reminder_2h),
          cancel_reason: asString(m.cancel_reason),
          cancelled_at: asString(m.cancelled_at),
        },
      };
    case "pharmacy":
      return {
        ...base,
        kind: "pharmacy",
        metadata: {
          delivery_type: asString(m.delivery_type),
          address: asString(m.address),
          district: asString(m.district),
          notes: asString(m.notes),
        },
      };
    case "second_opinion":
      return {
        ...base,
        kind: "second_opinion",
        metadata: {
          specialty: asString(m.specialty),
          email: asString(m.email),
        },
      };
    case "home_care":
      return {
        ...base,
        kind: "home_care",
        metadata: {
          address: asString(m.address),
          notes: asString(m.notes),
        },
      };
  }
}

/** حالات نهائية تُستخدم لإيقاف polling. */
export const FINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  "cancelled",
  "completed",
  "delivered",
  "closed",
  "answered",
  "no_show",
] as const;

export function isFinalStatus(s: string | null | undefined): boolean {
  return !!s && (FINAL_ORDER_STATUSES as readonly string[]).includes(s);
}
