/**
 * قائمة "طلباتي" — /portal/orders.
 *
 * تجميع كل الطلبات عبر الخدمات (مواعيد/بلاغات/صيدلية/زيارات منزلية/
 * استشارات/فواتير/مختبر/أشعة) في قائمة واحدة موحّدة، مع فلاتر حسب النوع
 * وربط كل صف بصفحة تفاصيل الطلب.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import {
  Inbox,
  Loader2,
  ChevronLeft,
  Filter as FilterIcon,
  RefreshCw,
  Calendar,
  MessageSquareWarning,
  Pill,
  Home as HomeIcon,
  Stethoscope,
  Receipt,
  FlaskConical,
  Scan,
} from "lucide-react";
import { getMyRecentOrders, type MyRecentOrder } from "@/lib/portal/my-orders.functions";
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

const ALL_KINDS: OrderTableKind[] = [
  "appointment",
  "complaint",
  "medicine_order",
  "home_care",
  "second_opinion",
  "invoice",
  "lab_report",
  "radiology_report",
];

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

export const Route = createFileRoute("/_authenticated/portal/orders")({
  head: () => ({
    meta: [{ title: "طلباتي | بوابة المريض" }, { name: "robots", content: "noindex" }],
  }),
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const [filter, setFilter] = useState<OrderTableKind | "all">("all");
  const fn = useServerFn(getMyRecentOrders);
  const q = useQuery({
    queryKey: ["portal", "my-orders", "all"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const all = q.data ?? [];
    return filter === "all" ? all : all.filter((o) => o.kind === filter);
  }, [q.data, filter]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: (q.data ?? []).length };
    for (const o of q.data ?? []) m[o.kind] = (m[o.kind] ?? 0) + 1;
    return m;
  }, [q.data]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-primary/10 text-primary">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">طلباتي</h1>
            <p className="text-xs text-muted-foreground">
              كل طلباتك عبر جميع خدمات باعشن الإلكترونية
            </p>
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

      <div className="bg-card border border-border rounded-2xl p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FilterIcon className="h-3.5 w-3.5" /> تصفية:
          </span>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 h-8 rounded-full border text-xs transition-colors ${
              filter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-muted"
            }`}
          >
            الكل
            <span className="ms-1 text-[10px] opacity-80">{counts.all ?? 0}</span>
          </button>
          {ALL_KINDS.map((k) => {
            const Icon = KIND_ICONS[k];
            const active = filter === k;
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:bg-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {KIND_LABELS_AR[k]}
                <span className="ms-1 text-[10px] opacity-80">{counts[k] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : q.isError ? (
        <div className="bg-card border border-red-200 rounded-2xl p-6 text-red-600 text-sm">
          تعذّر التحميل: {(q.error as Error).message}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          لا توجد طلبات مطابقة.
        </div>
      ) : (
        <ul className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {rows.map((o: MyRecentOrder) => {
            const Icon = KIND_ICONS[o.kind];
            return (
              <li key={`${o.kind}-${o.id}`}>
                <Link
                  to="/portal/orders/$kind/$id"
                  params={{ kind: o.kind, id: o.id }}
                  className="flex items-center gap-3 py-3 px-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="h-10 w-10 shrink-0 rounded-lg grid place-items-center bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{o.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(o.created_at)}
                      {o.reference ? (
                        <span className="ms-2 font-mono" dir="ltr">
                          {o.reference}
                        </span>
                      ) : null}
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
    </>
  );
}
