import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Inbox,
  Calendar,
  MessageSquareWarning,
  Pill,
  Home,
  Stethoscope,
  Receipt,
  FlaskConical,
  Scan,
  ChevronLeft,
} from "lucide-react";
import { getMyRecentOrders, type MyRecentOrder } from "@/lib/portal/my-orders.functions";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import type { OrderTableKind } from "@/lib/unified-status";

const ICONS: Record<MyRecentOrder["kind"], typeof Calendar> = {
  appointment: Calendar,
  complaint: MessageSquareWarning,
  medicine_order: Pill,
  home_care: Home,
  second_opinion: Stethoscope,
  invoice: Receipt,
  lab_report: FlaskConical,
  radiology_report: Scan,
};

const KIND_TO_UNIFIED: Record<MyRecentOrder["kind"], OrderTableKind> = {
  appointment: "appointment",
  complaint: "complaint",
  medicine_order: "medicine_order",
  home_care: "home_care",
  second_opinion: "second_opinion",
  invoice: "invoice",
  lab_report: "lab_report",
  radiology_report: "radiology_report",
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

/**
 * قسم "طلباتي الأخيرة" الموحّد للوحة المريض.
 * يعرض أحدث الطلبات عبر كل الخدمات (مواعيد/بلاغات/صيدلية/زيارة/استشارة/فواتير/مختبر/أشعة).
 */
export function MyRecentOrders({ limit = 8 }: { limit?: number }) {
  const fn = useServerFn(getMyRecentOrders);
  const q = useQuery({
    queryKey: ["portal", "my-recent-orders"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl grid place-items-center bg-primary/10 text-primary">
            <Inbox className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">طلباتي الأخيرة</h2>
            <p className="text-xs text-muted-foreground">
              أحدث طلباتك عبر جميع خدمات باعشن الإلكترونية
            </p>
          </div>
        </div>
        <Link
          to="/portal/orders"
          className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
        >
          عرض الكل
          <ChevronLeft className="h-3.5 w-3.5" />
        </Link>
      </div>

      {q.isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : q.isError ? (
        <div className="text-sm text-red-600 py-4">
          تعذّر تحميل الطلبات — {(q.error as Error).message}
        </div>
      ) : !q.data || q.data.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          لا توجد طلبات بعد. ابدأ باستخدام خدمة من الأعلى.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {q.data.slice(0, limit).map((o) => {
            const Icon = ICONS[o.kind];
            return (
              <li key={`${o.kind}-${o.id}`}>
                <Link
                  to="/portal/orders/$kind/$id"
                  params={{ kind: o.kind, id: o.id }}
                  className="flex items-center gap-3 py-3 hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="h-9 w-9 shrink-0 rounded-lg grid place-items-center bg-muted text-foreground/70">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(o.created_at)}</p>
                  </div>
                  <OrderStatusBadge kind={KIND_TO_UNIFIED[o.kind]} status={o.status} />
                  <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
