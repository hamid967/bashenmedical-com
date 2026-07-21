/**
 * تفاصيل طلب المريض (Portal) — /portal/orders/$kind/$id.
 *
 * صفحة للمريض تعرض حالة الطلب مع خط تقدّم، بيانات الطلب،
 * المرفقات المرتبطة بالمريض، والخط الزمني للأحداث.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal/PortalShell";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { OrderProgressSteps } from "@/components/OrderProgressSteps";
import {
  ArrowRight,
  Paperclip,
  Clock,
  RefreshCw,
  FileText,
  ExternalLink,
  Calendar,
  MessageSquareWarning,
  Pill,
  Home as HomeIcon,
  Stethoscope,
  Receipt,
  FlaskConical,
  Scan,
} from "lucide-react";
import type { OrderTableKind } from "@/lib/unified-status";
import { getMyOrderDetails } from "@/lib/portal/order-details.functions";

const KINDS = [
  "appointment",
  "complaint",
  "medicine_order",
  "home_care",
  "second_opinion",
  "invoice",
  "lab_report",
  "radiology_report",
] as const;

const KIND_LABELS_AR: Record<OrderTableKind, string> = {
  appointment: "موعد",
  complaint: "بلاغ",
  medicine_order: "طلب دواء",
  home_care: "زيارة منزلية",
  second_opinion: "رأي طبي ثانٍ",
  invoice: "فاتورة",
  lab_report: "نتيجة مختبر",
  radiology_report: "تقرير أشعة",
};

const KIND_ICONS: Record<OrderTableKind, React.ComponentType<{ className?: string }>> = {
  appointment: Calendar,
  complaint: MessageSquareWarning,
  medicine_order: Pill,
  home_care: HomeIcon,
  second_opinion: Stethoscope,
  invoice: Receipt,
  lab_report: FlaskConical,
  radiology_report: Scan,
};

const DISPLAY_FIELDS: Record<OrderTableKind, string[]> = {
  appointment: [
    "appointment_date",
    "appointment_time",
    "specialty",
    "reason",
    "notes",
  ],
  complaint: ["reference", "category", "message", "response"],
  medicine_order: ["delivery_type", "delivery_address", "total_amount", "notes"],
  home_care: ["service_type", "preferred_date", "preferred_time", "address", "notes"],
  second_opinion: ["specialty", "case_summary", "case_description"],
  invoice: ["invoice_number", "amount", "total_amount", "due_date"],
  lab_report: ["title", "test_type", "result_summary", "reported_at"],
  radiology_report: ["modality", "body_part", "findings", "reported_at"],
};

const FIELD_LABELS_AR: Record<string, string> = {
  appointment_date: "التاريخ",
  appointment_time: "الوقت",
  specialty: "التخصص",
  reason: "السبب",
  notes: "ملاحظات",
  reference: "المرجع",
  category: "التصنيف",
  message: "رسالتك",
  response: "الرد من الفريق",
  delivery_type: "نوع التوصيل",
  delivery_address: "عنوان التوصيل",
  total_amount: "الإجمالي",
  amount: "المبلغ",
  service_type: "نوع الخدمة",
  preferred_date: "التاريخ المفضّل",
  preferred_time: "الوقت المفضّل",
  address: "العنوان",
  case_summary: "ملخّص الحالة",
  case_description: "وصف الحالة",
  invoice_number: "رقم الفاتورة",
  due_date: "تاريخ الاستحقاق",
  title: "العنوان",
  test_type: "نوع الفحص",
  result_summary: "ملخّص النتيجة",
  reported_at: "تاريخ التقرير",
  modality: "نوع الأشعة",
  body_part: "العضو",
  findings: "الاستنتاج",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export const Route = createFileRoute("/_authenticated/portal/orders/$kind/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الطلب | بوابة المريض" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyOrderDetailsPage,
});

function MyOrderDetailsPage() {
  const { kind, id } = Route.useParams();
  const kindTyped = (KINDS as readonly string[]).includes(kind)
    ? (kind as OrderTableKind)
    : null;

  const call = useServerFn(getMyOrderDetails);
  const q = useQuery({
    queryKey: ["portal-order-details", kind, id],
    queryFn: () => call({ data: { kind: kindTyped!, id } }),
    enabled: !!kindTyped,
    staleTime: 15_000,
  });

  if (!kindTyped) {
    return (
      <div className="text-center py-10">
        <p className="text-red-600">نوع طلب غير معروف.</p>
        <Link to="/portal/orders" className="text-primary underline mt-4 inline-block">
          العودة إلى طلباتي
        </Link>
      </div>
    );

  }

  const Icon = KIND_ICONS[kindTyped];

  return (
    <PortalShell>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            to="/portal/orders"
            className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <ArrowRight className="h-4 w-4" />
            طلباتي
          </Link>
          <h1 className="text-xl md:text-2xl mt-1 flex items-center gap-2 font-bold">
            <Icon className="h-5 w-5 text-primary" />
            {KIND_LABELS_AR[kindTyped]}
          </h1>
          <div className="text-xs text-muted-foreground mt-1 font-mono" dir="ltr">
            #{id.slice(0, 8)}
          </div>
        </div>
        <button
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-2 px-3 h-9 rounded-lg border border-border bg-card hover:bg-muted text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {q.isLoading && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
          جارٍ التحميل…
        </div>
      )}
      {q.isError && (
        <div className="bg-card border border-red-200 rounded-2xl p-6 text-red-600">
          تعذّر التحميل: {(q.error as Error).message}
        </div>
      )}

      {q.data && (
        <div className="space-y-4">
          <section className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-bold">حالة الطلب</h2>
              <OrderStatusBadge kind={kindTyped} status={q.data.order.status} raw />
            </div>
            <OrderProgressSteps kind={kindTyped} status={q.data.order.status} raw />
          </section>

          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              تفاصيل الطلب
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {DISPLAY_FIELDS[kindTyped].map((k) => {
                const v = q.data.order[k];
                if (v === null || v === undefined || v === "") return null;
                const isLong = typeof v === "string" && (v.length > 60 || v.includes("\n"));
                return (
                  <div key={k} className={isLong ? "sm:col-span-2" : ""}>
                    <dt className="text-xs text-muted-foreground mb-0.5">
                      {FIELD_LABELS_AR[k] ?? k}
                    </dt>
                    <dd className="text-foreground whitespace-pre-wrap break-words">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" />
              مرفقاتي
              <span className="text-xs text-muted-foreground font-normal">
                ({q.data.attachments.length})
              </span>
            </h2>
            {q.data.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مرفقات.</p>
            ) : (
              <ul className="divide-y divide-border">
                {q.data.attachments.map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {a.file_name ?? "ملف بدون اسم"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.mime_type ?? "—"} · {fmt(a.created_at)}
                      </div>
                    </div>
                    {a.file_url && (
                      <a
                        href={a.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        فتح
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              الخط الزمني
            </h2>
            {q.data.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أحداث مسجّلة.</p>
            ) : (
              <ol className="relative border-s-2 border-border ps-4 space-y-4">
                {q.data.timeline.map((ev, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -start-[22px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                    <div className="text-xs text-muted-foreground">{fmt(ev.at)}</div>
                    <div className="text-sm font-semibold">{ev.title}</div>
                    {ev.detail && (
                      <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        {ev.detail}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </PortalShell>
  );
}
