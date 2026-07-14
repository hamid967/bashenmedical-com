import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  Inbox,
  Pill,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import {
  listMyNotifications,
  markMyNotificationsRead,
  type PatientNotification,
} from "@/lib/portal/notifications.functions";
import { supabase } from "@/integrations/supabase/client";

/* ----------------------------- query --------------------------------- */

const notificationsQuery = queryOptions({
  queryKey: ["portal", "my-notifications"],
  queryFn: () => listMyNotifications({ data: { limit: 100 } }),
  staleTime: 15_000,
});

export const Route = createFileRoute("/_authenticated/portal/notifications")({
  loader: ({ context }) => context.queryClient.ensureQueryData(notificationsQuery),
  head: () => ({
    meta: [
      { title: "الإشعارات | بوابة المريض" },
      { name: "description", content: "إشعارات المواعيد والتقارير والفواتير الخاصة بك." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
  errorComponent: ErrorState,
  notFoundComponent: () => null,
  pendingComponent: SkeletonState,
});

/* ----------------------------- helpers ------------------------------- */

type Filter = "all" | "unread";

function iconForKind(kind: string) {
  const k = kind.toLowerCase();
  if (k.startsWith("reminder_") || k.includes("appointment"))
    return { Icon: CalendarDays, cls: "bg-teal-50 text-teal-600 border-teal-100" };
  if (k.includes("report") || k.includes("record"))
    return { Icon: FileText, cls: "bg-teal-50 text-teal-600 border-teal-100" };
  if (k.includes("lab")) return { Icon: FlaskConical, cls: "bg-teal-50 text-teal-600 border-teal-100" };
  if (k.includes("prescription") || k.includes("pharmacy"))
    return { Icon: Pill, cls: "bg-emerald-50 text-emerald-600 border-emerald-100" };
  if (k.includes("invoice") || k.includes("payment") || k.includes("refund"))
    return { Icon: CreditCard, cls: "bg-amber-50 text-amber-600 border-amber-100" };
  if (k.includes("insurance") || k.includes("approval"))
    return { Icon: ShieldCheck, cls: "bg-teal-50 text-teal-600 border-teal-100" };
  if (k.includes("doctor") || k.includes("visit"))
    return { Icon: Stethoscope, cls: "bg-rose-50 text-rose-600 border-rose-100" };
  if (k.includes("complaint") || k.includes("support"))
    return { Icon: ClipboardList, cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return { Icon: Sparkles, cls: "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100" };
}

/** Same-locale relative time formatter (Arabic). */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const abs = Math.abs(diff);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (abs < min) return "الآن";
  if (abs < hr) return `قبل ${Math.floor(abs / min)} دقيقة`;
  if (abs < day) return `قبل ${Math.floor(abs / hr)} ساعة`;
  if (abs < 7 * day) return `قبل ${Math.floor(abs / day)} يوم`;
  return new Date(iso).toLocaleDateString("ar-SA-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Deep-link into other portal areas from the notification metadata. */
function actionFor(n: PatientNotification): { to: string; label: string } | null {
  const meta = (n.metadata ?? {}) as Record<string, unknown>;
  const k = n.kind.toLowerCase();
  if (n.appointment_id || k.includes("appointment") || k.startsWith("reminder_")) {
    return { to: "/portal/appointments", label: "عرض المواعيد" };
  }
  if (k.includes("report") || k.includes("record"))
    return { to: "/portal/reports", label: "عرض التقارير" };
  if (k.includes("lab")) return { to: "/portal/laboratory", label: "نتائج المختبر" };
  if (k.includes("radiology")) return { to: "/portal/radiology", label: "نتائج الأشعة" };
  if (k.includes("prescription")) return { to: "/portal/prescriptions", label: "الوصفات الطبية" };
  if (k.includes("invoice") || k.includes("payment"))
    return { to: "/portal/invoices", label: "الفواتير" };
  if (k.includes("refund")) return { to: "/portal/refunds", label: "طلبات الاسترداد" };
  const ref = meta["ref"] ?? meta["reference"];
  if (typeof ref === "string" && ref) return { to: "/portal/orders", label: "طلباتي" };
  return null;
}

/* ----------------------------- page ---------------------------------- */

function NotificationsPage() {
  const q = useSuspenseQuery(notificationsQuery);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const items = q.data;
  const unreadIds = useMemo(
    () => items.filter((n) => !n.read_at).map((n) => n.id),
    [items],
  );
  const filtered = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.read_at) : items),
    [items, filter],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["portal", "my-notifications"] });
  };

  const markMut = useMutation({
    mutationFn: (ids?: string[]) => markMyNotificationsRead({ data: { ids } }),
    onSuccess: (r) => {
      invalidate();
      if (r.updated > 0) toast.success(`تم تعليم ${r.updated} إشعار كمقروء`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر التحديث"),
  });

  // Realtime: refetch when a new notification arrives for the current user
  useEffect(() => {
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      userId = data.user?.id ?? null;
      if (!userId) return;
      channel = supabase
        .channel(`portal-notifications-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => invalidate(),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-2xl grid place-items-center text-white"
              style={{ background: "var(--portal-gradient)" }}
              aria-hidden
            >
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[color:var(--portal-ink)]">
                الإشعارات
              </h1>
              <p className="text-xs sm:text-sm text-[color:var(--portal-ink-2)]">
                تنبيهاتك حول المواعيد والتقارير والفواتير
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => invalidate()}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[color:var(--portal-border)] bg-white text-sm text-[color:var(--portal-ink)] hover:bg-slate-50"
              aria-label="تحديث القائمة"
            >
              <RefreshCw className="h-4 w-4" />
              تحديث
            </button>
            <button
              type="button"
              disabled={unreadIds.length === 0 || markMut.isPending}
              onClick={() => markMut.mutate(undefined)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--portal-gradient)" }}
            >
              <CheckCheck className="h-4 w-4" />
              تعليم الكل كمقروء
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="تصنيف الإشعارات"
          className="mb-4 inline-flex rounded-full border border-[color:var(--portal-border)] bg-white p-1 text-sm"
        >
          {(
            [
              { k: "all" as const, label: `الكل (${items.length})` },
              { k: "unread" as const, label: `غير مقروءة (${unreadIds.length})` },
            ]
          ).map((t) => {
            const active = filter === t.k;
            return (
              <button
                key={t.k}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(t.k)}
                className={`px-4 h-8 rounded-full transition ${
                  active
                    ? "text-white shadow-sm"
                    : "text-[color:var(--portal-ink-2)] hover:text-[color:var(--portal-ink)]"
                }`}
                style={active ? { background: "var(--portal-gradient)" } : undefined}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="space-y-3">
            {filtered.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                onMarkRead={() => markMut.mutate([n.id])}
                markingDisabled={markMut.isPending}
              />
            ))}
          </ul>
        )}

        {/* Legend */}
        <p className="mt-8 text-center text-[11px] text-[color:var(--portal-ink-2)]">
          يتم تحديث الإشعارات لحظيًا عند وصول تنبيه جديد.
        </p>
      </main>
    </div>
  );
}

/* ----------------------------- row ----------------------------------- */

function NotificationRow({
  n,
  onMarkRead,
  markingDisabled,
}: {
  n: PatientNotification;
  onMarkRead: () => void;
  markingDisabled: boolean;
}) {
  const { Icon, cls } = iconForKind(n.kind);
  const unread = !n.read_at;
  const action = actionFor(n);

  return (
    <li
      className={`glass-card p-4 sm:p-5 flex gap-3 sm:gap-4 items-start transition ${
        unread ? "ring-1 ring-[color:var(--portal-primary)]/25" : ""
      }`}
    >
      <div className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center border ${cls}`} aria-hidden>
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm sm:text-base font-semibold text-[color:var(--portal-ink)] leading-tight break-words">
            {n.title}
            {unread ? (
              <span
                className="inline-block ms-2 h-2 w-2 rounded-full align-middle"
                style={{ background: "var(--portal-primary)" }}
                aria-label="غير مقروء"
              />
            ) : null}
          </h3>
          <time
            title={fullDate(n.created_at)}
            dateTime={n.created_at}
            className="shrink-0 text-[11px] sm:text-xs text-[color:var(--portal-ink-2)] whitespace-nowrap"
          >
            {timeAgo(n.created_at)}
          </time>
        </div>

        {n.body ? (
          <p className="mt-1 text-sm text-[color:var(--portal-ink-2)] leading-relaxed break-words whitespace-pre-wrap">
            {n.body}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {action ? (
            <Link
              to={action.to}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold text-white"
              style={{ background: "var(--portal-gradient)" }}
            >
              {action.label}
            </Link>
          ) : null}
          {unread ? (
            <button
              type="button"
              onClick={onMarkRead}
              disabled={markingDisabled}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[color:var(--portal-border)] bg-white text-xs text-[color:var(--portal-ink)] hover:bg-slate-50 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              تعليم كمقروء
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] text-[color:var(--portal-ink-2)]">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              مقروء
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/* --------------------------- ux states ------------------------------- */

function EmptyState({ filter }: { filter: Filter }) {
  const isUnread = filter === "unread";
  return (
    <div className="glass-card p-8 sm:p-10 text-center">
      <div
        className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-white border border-[color:var(--portal-border)] text-[color:var(--portal-primary)]"
        aria-hidden
      >
        {isUnread ? <CheckCheck className="h-7 w-7" /> : <BellOff className="h-7 w-7" />}
      </div>
      <h2 className="mt-4 text-lg font-bold text-[color:var(--portal-ink)]">
        {isUnread ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات بعد"}
      </h2>
      <p className="mt-1 text-sm text-[color:var(--portal-ink-2)] max-w-sm mx-auto">
        {isUnread
          ? "لقد اطّلعت على جميع تنبيهاتك — رائع!"
          : "سنقوم بتنبيهك هنا عند تحديث موعدك، أو جاهزية تقاريرك، أو استحقاق فاتورة."}
      </p>
      <Link
        to="/portal"
        className="mt-6 inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-sm font-semibold text-white"
        style={{ background: "var(--portal-gradient)" }}
      >
        العودة إلى لوحة البوابة
      </Link>
    </div>
  );
}

function SkeletonState() {
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh" dir="rtl">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 h-11 w-64 rounded-2xl bg-slate-200/60 animate-pulse" />
        <div className="mb-4 h-10 w-56 rounded-full bg-slate-200/60 animate-pulse" />
        <ul className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="glass-card p-4 sm:p-5 flex gap-4 items-start">
              <div className="h-10 w-10 rounded-xl bg-slate-200/60 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-slate-200/60 animate-pulse" />
                <div className="h-3 w-full rounded bg-slate-200/50 animate-pulse" />
                <div className="h-3 w-4/5 rounded bg-slate-200/50 animate-pulse" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh grid place-items-center p-6" dir="rtl">
      <div className="glass-card max-w-md w-full p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4" aria-hidden>
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-[color:var(--portal-ink)]">تعذّر تحميل الإشعارات</h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)] break-words">
          {error.message || "حدث خطأ غير متوقع أثناء جلب الإشعارات."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold text-white"
            style={{ background: "var(--portal-gradient)" }}
          >
            <RefreshCw className="h-4 w-4" />
            حاول مجددًا
          </button>
          <Link
            to="/portal"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold border border-[color:var(--portal-border)] bg-white"
          >
            <Inbox className="h-4 w-4" />
            العودة إلى البوابة
          </Link>
        </div>
      </div>
    </div>
  );
}
