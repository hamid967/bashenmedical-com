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

import {
  PortalPageHeader,
  PortalStatCard,
  PortalCard,
  PortalCardHeader,
  PortalEmptyState,
} from "@/components/portal/ui";

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
  FileText,
  AlertTriangle,
  CreditCard,
  CalendarClock,
} from "lucide-react";
import {
  getMyRecentOrders,
  type MyRecentOrder,
} from "@/lib/portal/my-orders.functions";
import {
  listMyInquiries,
  type MyInquiry,
} from "@/lib/portal/inquiries.functions";
import { getPortalQuickSnapshot } from "@/lib/portal/snapshot.functions";
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
  const snapshotFn = useServerFn(getPortalQuickSnapshot);

  const snapshotQ = useQuery({
    queryKey: ["portal", "quick-snapshot"],
    queryFn: () => snapshotFn(),
    staleTime: 15_000,
  });

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
  const snap = snapshotQ.data;

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
    <>
      <PortalPageHeader

        title="لوحة التحكم"
        description="نظرة سريعة على طلباتك واستفساراتك وحالتها"
        breadcrumbs={[{ label: "الرئيسية", to: "/portal" }, { label: "لوحة التحكم" }]}
        actions={
          <button
            onClick={() => {
              snapshotQ.refetch();
              ordersQ.refetch();
              inquiriesQ.refetch();
            }}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)] hover:bg-[color:var(--portal-surface-2)] text-sm portal-focus-ring"
            aria-label="تحديث البيانات"
          >
            <RefreshCw className={`h-4 w-4 ${refetching || snapshotQ.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        }
      />

      {/* لقطة سريعة — 4 بطاقات مباشرة من قاعدة البيانات */}
      <QuickSnapshotGrid data={snap} loading={snapshotQ.isLoading} />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Link to="/portal/orders" className="block portal-focus-ring rounded-[var(--portal-radius-lg)]">
              <PortalStatCard
                icon={<Inbox className="h-5 w-5" />}
                label="إجمالي طلباتي"
                value={orders.length}
                tone="primary"
              />
            </Link>
            <PortalStatCard
              icon={<Clock className="h-5 w-5" />}
              label="قيد المعالجة"
              value={orderStatusBuckets.open}
              tone="warning"
            />
            <PortalStatCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="مكتملة"
              value={orderStatusBuckets.done}
              tone="success"
            />
            <PortalStatCard
              icon={<XCircle className="h-5 w-5" />}
              label="ملغاة/مرفوضة"
              value={orderStatusBuckets.cancelled}
              tone="error"
            />
          </div>

          {/* Orders by kind */}
          <PortalCard as="section" className="mb-6">
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-[color:var(--portal-primary)]" />
                  طلباتي حسب النوع
                </span>
              }
              action={
                <Link
                  to="/portal/orders"
                  className="text-xs text-[color:var(--portal-primary)] hover:underline inline-flex items-center gap-1"
                >
                  عرض الكل
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {orders.length === 0 ? (
                <p className="text-sm text-[color:var(--portal-ink-3)] py-4 text-center">
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
                        className="flex items-center gap-2 p-3 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)]"
                      >
                        <div className="h-8 w-8 rounded-lg grid place-items-center bg-[color:var(--portal-primary-50)] text-[color:var(--portal-primary)] shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-[color:var(--portal-ink-3)] truncate">
                            {KIND_LABELS_AR[k]}
                          </div>
                          <div className="text-lg font-bold leading-tight">{n}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </PortalCard>

          {/* Recent orders */}
          <PortalCard as="section" className="overflow-hidden mb-6">
            <PortalCardHeader
              title="أحدث الطلبات"
              action={
                <Link
                  to="/portal/orders"
                  className="text-xs text-[color:var(--portal-primary)] hover:underline inline-flex items-center gap-1"
                >
                  عرض الكل
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Link>
              }
            />
            {orders.length === 0 ? (
              <div className="px-5 pb-5">
                <PortalEmptyState
                  icon={<Inbox className="h-6 w-6" />}
                  title="لم تقم بأي طلب بعد"
                />
              </div>
            ) : (
              <ul className="divide-y divide-[color:var(--portal-border)]">
                {orders.slice(0, 5).map((o: MyRecentOrder) => {
                  const Icon = KIND_ICONS[o.kind];
                  return (
                    <li key={`${o.kind}-${o.id}`}>
                      <Link
                        to="/portal/orders/$kind/$id"
                        params={{ kind: o.kind, id: o.id }}
                        className="flex items-center gap-3 py-3 px-5 hover:bg-[color:var(--portal-surface-2)] transition-colors"
                      >
                        <div className="h-9 w-9 shrink-0 rounded-lg grid place-items-center bg-[color:var(--portal-primary-50)] text-[color:var(--portal-primary)]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{o.title}</p>
                          <p className="text-xs text-[color:var(--portal-ink-3)]">
                            {formatDate(o.created_at)}
                          </p>
                        </div>
                        <OrderStatusBadge kind={o.kind} status={o.status} raw />
                        <ChevronLeft className="h-4 w-4 text-[color:var(--portal-ink-3)] shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </PortalCard>

          {/* Inquiries */}
          <PortalCard as="section" className="overflow-hidden">
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  <MessageSquareWarning className="h-4 w-4 text-[color:var(--portal-primary)]" />
                  استفساراتي وحالتها
                </span>
              }
              description="تظهر جميع استفساراتك المرتبطة بحسابك بعد اكتمال التحقق"
              action={
                <Link
                  to="/portal/inquiries"
                  className="text-xs text-[color:var(--portal-primary)] hover:underline inline-flex items-center gap-1"
                >
                  عرض الكل
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Link>
              }
            />

            {inquiries.length === 0 ? (
              <div className="px-5 pb-5">
                <PortalEmptyState
                  icon={<MessageSquareWarning className="h-6 w-6" />}
                  title="لا توجد استفسارات مرتبطة بحسابك"
                />
              </div>
            ) : (
              <>
                {/* Inquiry status summary */}
                <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-surface-2)]">
                  {Object.entries(inquiryStatusCounts).map(([status, count]) => (
                    <div
                      key={status}
                      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)] text-xs"
                    >
                      <InquiryStatusBadge status={status} />
                      <span className="font-semibold tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>

                <ul className="divide-y divide-[color:var(--portal-border)]">
                  {inquiries.slice(0, 6).map((i: MyInquiry) => (
                    <li key={i.id}>
                      <Link
                        to="/portal/inquiries"
                        search={{ ref: i.request_number }}
                        className="flex items-center gap-3 py-3 px-5 hover:bg-[color:var(--portal-surface-2)] transition-colors"
                      >
                        <div className="h-9 w-9 shrink-0 rounded-lg grid place-items-center bg-[color:var(--portal-primary-50)] text-[color:var(--portal-primary)]">
                          <MessageSquareWarning className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {i.service_label ?? "استفسار عن خدمة"}
                            {i.branch_name ? (
                              <span className="text-[color:var(--portal-ink-3)] font-normal">
                                {" "}
                                — {i.branch_name}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-[color:var(--portal-ink-3)]">
                            {formatDate(i.created_at)}
                            <span className="ms-2 font-mono" dir="ltr">
                              {i.request_number}
                            </span>
                          </p>
                        </div>
                        <InquiryStatusBadge status={i.internal_status} />
                        <ChevronLeft className="h-4 w-4 text-[color:var(--portal-ink-3)] shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </PortalCard>
        </>
      )}
    </>
  );
}


