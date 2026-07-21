/**
 * لوحة تحكم المريض — /portal/dashboard.
 *
 * ملخص سريع لجميع طلباتي واستفساراتي مع حالة كل استفسار بعد اكتمال التحقق.
 * تعتمد على دوال السيرفر الموجودة: getMyRecentOrders + listMyInquiries.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import {
  LayoutDashboard,
  Loader2,
  Inbox,
  MessageSquareWarning,
  ChevronLeft,
  Calendar,
  Pill,
  Home as HomeIcon,
  Stethoscope,
  Receipt,
  FlaskConical,
  Scan,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
} from "lucide-react";
import {
  getMyRecentOrders,
  type MyRecentOrder,
} from "@/lib/portal/my-orders.functions";
import {
  listMyInquiries,
  type MyInquiry,
} from "@/lib/portal/inquiries.functions";
import type { OrderTableKind } from "@/lib/unified-status";

const KIND_LABELS_AR: Record<OrderTableKind, string> = {
  appointment: "المواعيد",
  complaint: "البلاغات",
  medicine_order: "الأدوية",
  home_care: "الزيارات المنزلية",
  second_opinion: "الرأي الثاني",
  invoice: "الفواتير",
  lab_report: "المختبر",
  radiology_report: "الأشعة",
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

const INQUIRY_STATUS_LABELS: Record<string, string> = {
  new: "جديد",
  in_progress: "قيد المعالجة",
  contacted: "تم التواصل",
  scheduled: "مجدول",
  completed: "مكتمل",
  closed: "مغلق",
  cancelled: "ملغي",
};

const INQUIRY_STATUS_STYLES: Record<string, string> = {
  new: "bg-sky-50 text-sky-700 border-sky-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  contacted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  scheduled: "bg-violet-50 text-violet-700 border-violet-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-neutral-100 text-neutral-600 border-neutral-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-SA-u-nu-latn", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function InquiryStatusBadge({ status }: { status: string }) {
  const label = INQUIRY_STATUS_LABELS[status] ?? status;
  const style =
    INQUIRY_STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}
    >
      {label}
    </span>
  );
}

export const Route = createFileRoute("/_authenticated/portal/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | بوابة المريض" },
      {
        name: "description",
        content: "ملخص طلباتي واستفساراتي وحالتها الحالية في بوابة باعشن للخدمات الطبية.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalDashboardPage,
});

function PortalDashboardPage() {
  const ordersFn = useServerFn(getMyRecentOrders);
  const inquiriesFn = useServerFn(listMyInquiries);

  const ordersQ = useQuery({
    queryKey: ["portal", "my-orders", "all"],
    queryFn: () => ordersFn(),
    staleTime: 30_000,
  });

  const inquiriesQ = useQuery({
    queryKey: ["portal", "my-inquiries"],
    queryFn: () => inquiriesFn(),
    staleTime: 30_000,
  });

  const orders = ordersQ.data ?? [];
  const inquiries = inquiriesQ.data ?? [];

  const orderCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) m[o.kind] = (m[o.kind] ?? 0) + 1;
    return m;
  }, [orders]);

  const orderStatusBuckets = useMemo(() => {
    // مجاميع سريعة لأهم الحالات
    let open = 0;
    let done = 0;
    let cancelled = 0;
    for (const o of orders) {
      const s = (o.status ?? "").toLowerCase();
      if (["completed", "done", "closed", "paid"].some((k) => s.includes(k))) done++;
      else if (["cancel", "reject"].some((k) => s.includes(k))) cancelled++;
      else open++;
    }
    return { open, done, cancelled };
  }, [orders]);

  const inquiryStatusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of inquiries) m[i.internal_status] = (m[i.internal_status] ?? 0) + 1;
    return m;
  }, [inquiries]);

  const loading = ordersQ.isLoading || inquiriesQ.isLoading;
  const refetching = ordersQ.isFetching || inquiriesQ.isFetching;

  return (
    <PortalShell>
      <PortalPageHeader
        title="لوحة التحكم"
        description="نظرة سريعة على طلباتك واستفساراتك وحالتها"
        breadcrumbs={[{ label: "الرئيسية", to: "/portal" }, { label: "لوحة التحكم" }]}
        actions={
          <button
            onClick={() => {
              ordersQ.refetch();
              inquiriesQ.refetch();
            }}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)] hover:bg-[color:var(--portal-surface-2)] text-sm portal-focus-ring"
            aria-label="تحديث البيانات"
          >
            <RefreshCw className={`h-4 w-4 ${refetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        }
      />


      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiTile
              icon={<Inbox className="h-4 w-4" />}
              label="إجمالي طلباتي"
              value={orders.length}
              to="/portal/orders"
              tone="primary"
            />
            <KpiTile
              icon={<Clock className="h-4 w-4" />}
              label="قيد المعالجة"
              value={orderStatusBuckets.open}
              tone="amber"
            />
            <KpiTile
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="مكتملة"
              value={orderStatusBuckets.done}
              tone="emerald"
            />
            <KpiTile
              icon={<XCircle className="h-4 w-4" />}
              label="ملغاة/مرفوضة"
              value={orderStatusBuckets.cancelled}
              tone="rose"
            />
          </div>

          {/* Orders by kind */}
          <section className="bg-card border border-border rounded-2xl p-4 md:p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" />
                طلباتي حسب النوع
              </h2>
              <Link
                to="/portal/orders"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                عرض الكل
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                لا توجد طلبات بعد.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(KIND_LABELS_AR) as OrderTableKind[]).map((k) => {
                  const Icon = KIND_ICONS[k];
                  const n = orderCounts[k] ?? 0;
                  return (
                    <div
                      key={k}
                      className="flex items-center gap-2 p-3 rounded-xl border border-border bg-background"
                    >
                      <div className="h-8 w-8 rounded-lg grid place-items-center bg-primary/10 text-primary shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-muted-foreground truncate">
                          {KIND_LABELS_AR[k]}
                        </div>
                        <div className="text-lg font-bold leading-tight">{n}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent orders */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold">أحدث الطلبات</h2>
              <Link
                to="/portal/orders"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                عرض الكل
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                لم تقم بأي طلب بعد.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {orders.slice(0, 5).map((o: MyRecentOrder) => {
                  const Icon = KIND_ICONS[o.kind];
                  return (
                    <li key={`${o.kind}-${o.id}`}>
                      <Link
                        to="/portal/orders/$kind/$id"
                        params={{ kind: o.kind, id: o.id }}
                        className="flex items-center gap-3 py-3 px-4 hover:bg-muted/40 transition-colors"
                      >
                        <div className="h-9 w-9 shrink-0 rounded-lg grid place-items-center bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{o.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(o.created_at)}
                          </p>
                        </div>
                        <OrderStatusBadge kind={o.kind} status={o.status} raw />
                        <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Inquiries */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <MessageSquareWarning className="h-4 w-4 text-primary" />
                  استفساراتي وحالتها
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  تظهر جميع استفساراتك المرتبطة بحسابك بعد اكتمال التحقق
                </p>
              </div>
              <Link
                to="/portal/inquiries"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                عرض الكل
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>

            {inquiries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                لا توجد استفسارات مرتبطة بحسابك.
              </p>
            ) : (
              <>
                {/* Inquiry status summary */}
                <div className="flex flex-wrap gap-2 p-4 border-b border-border bg-muted/20">
                  {Object.entries(inquiryStatusCounts).map(([status, count]) => (
                    <div
                      key={status}
                      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-card text-xs"
                    >
                      <InquiryStatusBadge status={status} />
                      <span className="font-semibold tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>

                <ul className="divide-y divide-border">
                  {inquiries.slice(0, 6).map((i: MyInquiry) => (
                    <li key={i.id}>
                      <Link
                        to="/portal/inquiries"
                        search={{ ref: i.request_number }}
                        className="flex items-center gap-3 py-3 px-4 hover:bg-muted/40 transition-colors"
                      >
                        <div className="h-9 w-9 shrink-0 rounded-lg grid place-items-center bg-primary/10 text-primary">
                          <MessageSquareWarning className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {i.service_label ?? "استفسار عن خدمة"}
                            {i.branch_name ? (
                              <span className="text-muted-foreground font-normal">
                                {" "}
                                — {i.branch_name}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(i.created_at)}
                            <span className="ms-2 font-mono" dir="ltr">
                              {i.request_number}
                            </span>
                          </p>
                        </div>
                        <InquiryStatusBadge status={i.internal_status} />
                        <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </PortalShell>
  );
}

type Tone = "primary" | "amber" | "emerald" | "rose";
const TONE_STYLES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
};

function KpiTile({
  icon,
  label,
  value,
  to,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  to?: string;
  tone: Tone;
}) {
  const inner = (
    <div className="bg-card border border-border rounded-2xl p-4 h-full flex items-start gap-3 hover:border-primary/30 transition-colors">
      <div
        className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${TONE_STYLES[tone]}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-2xl font-bold leading-tight tabular-nums mt-0.5">
          {value}
        </div>
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
