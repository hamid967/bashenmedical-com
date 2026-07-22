/**
 * /admin/notification-logs — Admin monitoring for per-channel delivery of
 * notifications (in-app / email / sms / whatsapp / push).
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  ChevronRight,
  Filter,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import {
  getNotificationDeliveryStats,
  listNotificationDeliveryLogs,
  type NotificationDeliveryLog,
  type NotificationDeliveryStats,
} from "@/lib/admin/notification-logs.functions";

/* ------------------------------- queries -------------------------------- */

type Filters = {
  channel: NotificationDeliveryLog["channel"] | "";
  status: NotificationDeliveryLog["status"] | "";
  q: string;
  windowHours: number;
};

const DEFAULT_FILTERS: Filters = { channel: "", status: "", q: "", windowHours: 24 * 7 };

const logsQuery = (f: Filters) =>
  queryOptions({
    queryKey: ["admin", "notif-logs", "list", f],
    queryFn: () =>
      listNotificationDeliveryLogs({
        data: {
          channel: f.channel || null,
          status: f.status || null,
          q: f.q ? f.q : null,
          windowHours: f.windowHours,
          limit: 200,
        },
      }),
    staleTime: 15_000,
  });

const statsQuery = (windowHours: number) =>
  queryOptions({
    queryKey: ["admin", "notif-logs", "stats", windowHours],
    queryFn: () => getNotificationDeliveryStats({ data: { windowHours } }),
    staleTime: 30_000,
  });

/* ------------------------------- route ---------------------------------- */

export const Route = createFileRoute("/_authenticated/admin/notification-logs")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(logsQuery(DEFAULT_FILTERS)),
      context.queryClient.ensureQueryData(statsQuery(DEFAULT_FILTERS.windowHours)),
    ]),
  head: () => ({
    meta: [
      { title: "سجلات تسليم الإشعارات | Admin" },
      {
        name: "description",
        content:
          "مراقبة تسليم الإشعارات لكل قناة: داخل التطبيق، البريد، SMS، واتساب، ودفع المتصفح.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="system.monitor">
      <NotifLogsPage />
    </RequirePermission>
  ),
  errorComponent: ErrorState,
  pendingComponent: Skeleton,
});

/* -------------------------------- page ---------------------------------- */

function NotifLogsPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const qc = useQueryClient();
  const logs = useSuspenseQuery(logsQuery(filters));
  const stats = useSuspenseQuery(statsQuery(filters.windowHours));

  const rows = logs.data;
  const s = stats.data;

  return (
    <div className="container-app py-6 space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="text-xs text-muted-foreground flex items-center gap-1">
            <Link to="/admin" className="hover:text-foreground">
              لوحة الإدارة
            </Link>
            <ChevronRight className="h-3 w-3 rotate-180" />
            <span className="text-foreground">سجلات تسليم الإشعارات</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            سجلات تسليم الإشعارات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مراقبة كل رسالة عبر جميع القنوات مع سبب الفشل عند وجوده.
          </p>
        </div>
        <button
          type="button"
          onClick={() => qc.invalidateQueries({ queryKey: ["admin", "notif-logs"] })}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 h-9 text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          تحديث
        </button>
      </header>

      <StatsRow stats={s} />

      <FiltersBar
        filters={filters}
        onChange={(next) => setFilters(next)}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />

      <LogsTable rows={rows} loading={logs.isFetching} />
    </div>
  );
}

/* -------------------------------- stats --------------------------------- */

function StatsRow({ stats }: { stats: NotificationDeliveryStats }) {
  const byChannel = useMemo(() => {
    const map = new Map<string, { total: number; failed: number }>();
    for (const t of stats.totals) {
      const cur = map.get(t.channel) ?? { total: 0, failed: 0 };
      cur.total += t.count;
      if (t.status === "failed" || t.status === "bounced") cur.failed += t.count;
      map.set(t.channel, cur);
    }
    return Array.from(map.entries());
  }, [stats.totals]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      <Kpi label="إجمالي المحاولات" value={stats.totalCount.toLocaleString("ar")} />
      <Kpi
        label="فشل"
        value={stats.failedCount.toLocaleString("ar")}
        tone={stats.failedCount > 0 ? "danger" : "muted"}
      />
      <Kpi
        label="معدل الفشل"
        value={`${(stats.failureRate * 100).toFixed(1)}%`}
        tone={stats.failureRate > 0.05 ? "danger" : "ok"}
      />
      {byChannel.map(([ch, v]) => (
        <Kpi
          key={ch}
          label={channelLabel(ch as any)}
          value={v.total.toLocaleString("ar")}
          hint={v.failed > 0 ? `${v.failed} فشل` : "بدون فشل"}
          tone={v.failed > 0 ? "danger" : "ok"}
        />
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "danger" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-700" : tone === "danger" ? "text-rose-700" : "text-foreground";
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-bold ${toneCls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

/* ------------------------------ filters --------------------------------- */

function FiltersBar({
  filters,
  onChange,
  onReset,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 grid gap-3 md:grid-cols-5">
      <label className="block md:col-span-2">
        <span className="mb-1 block text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
          <Search className="h-3 w-3" /> بحث (المستلم / القالب / السبب)
        </span>
        <input
          className="w-full h-9 rounded-lg border px-3 text-sm"
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder="مثال: patient@... أو timeout"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">القناة</span>
        <select
          className="w-full h-9 rounded-lg border px-2 text-sm bg-white"
          value={filters.channel}
          onChange={(e) => onChange({ ...filters, channel: e.target.value as Filters["channel"] })}
        >
          <option value="">الكل</option>
          <option value="in_app">داخل التطبيق</option>
          <option value="push">Push</option>
          <option value="email">البريد</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">واتساب</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">الحالة</span>
        <select
          className="w-full h-9 rounded-lg border px-2 text-sm bg-white"
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value as Filters["status"] })}
        >
          <option value="">الكل</option>
          <option value="pending">قيد الإرسال</option>
          <option value="sent">مُرسل</option>
          <option value="delivered">تم التسليم</option>
          <option value="failed">فشل</option>
          <option value="bounced">مرتد</option>
          <option value="skipped">متجاوز</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
          <Filter className="h-3 w-3" /> الفترة
        </span>
        <select
          className="w-full h-9 rounded-lg border px-2 text-sm bg-white"
          value={filters.windowHours}
          onChange={(e) => onChange({ ...filters, windowHours: Number(e.target.value) })}
        >
          <option value={24}>آخر 24 ساعة</option>
          <option value={24 * 7}>آخر 7 أيام</option>
          <option value={24 * 30}>آخر 30 يوم</option>
        </select>
      </label>
      <div className="md:col-span-5 flex justify-end">
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          إعادة تعيين الفلاتر
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- table --------------------------------- */

function LogsTable({ rows, loading }: { rows: NotificationDeliveryLog[]; loading: boolean }) {
  if (loading && rows.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-8 grid place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-sm text-muted-foreground">
        لا توجد سجلات في هذه الفترة/الفلاتر.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-start px-3 py-2">التاريخ</th>
              <th className="text-start px-3 py-2">القناة</th>
              <th className="text-start px-3 py-2">القالب</th>
              <th className="text-start px-3 py-2">المستلم</th>
              <th className="text-start px-3 py-2">الحالة</th>
              <th className="text-start px-3 py-2">المحاولة</th>
              <th className="text-start px-3 py-2">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ar")}
                </td>
                <td className="px-3 py-2">
                  <ChannelBadge channel={r.channel} />
                </td>
                <td className="px-3 py-2 text-xs">{r.template ?? "—"}</td>
                <td
                  className="px-3 py-2 text-xs font-mono max-w-[220px] truncate"
                  title={r.recipient ?? ""}
                >
                  {r.recipient ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2 text-xs">{r.attempt}</td>
                <td className="px-3 py-2 text-xs max-w-[280px]">
                  {r.error_message ? (
                    <span className="text-rose-700" title={r.error_message}>
                      {truncate(r.error_message, 60)}
                    </span>
                  ) : r.subject ? (
                    <span className="text-muted-foreground" title={r.subject}>
                      {truncate(r.subject, 60)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function channelLabel(ch: NotificationDeliveryLog["channel"]) {
  return (
    {
      in_app: "داخل التطبيق",
      push: "Push",
      email: "البريد",
      sms: "SMS",
      whatsapp: "واتساب",
    } as const
  )[ch];
}

function ChannelBadge({ channel }: { channel: NotificationDeliveryLog["channel"] }) {
  const map = {
    in_app: { Icon: Bell, cls: "bg-slate-100 text-slate-700" },
    push: { Icon: BellRing, cls: "bg-indigo-100 text-indigo-700" },
    email: { Icon: Mail, cls: "bg-sky-100 text-sky-700" },
    sms: { Icon: MessageSquare, cls: "bg-amber-100 text-amber-700" },
    whatsapp: { Icon: MessageCircle, cls: "bg-emerald-100 text-emerald-700" },
  } as const;
  const { Icon, cls } = map[channel];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {channelLabel(channel)}
    </span>
  );
}

function StatusBadge({ status }: { status: NotificationDeliveryLog["status"] }) {
  const map: Record<NotificationDeliveryLog["status"], { cls: string; label: string }> = {
    pending: { cls: "bg-slate-100 text-slate-700", label: "قيد الإرسال" },
    sent: { cls: "bg-blue-100 text-blue-700", label: "مُرسل" },
    delivered: { cls: "bg-emerald-100 text-emerald-700", label: "مُسلَّم" },
    failed: { cls: "bg-rose-100 text-rose-700", label: "فشل" },
    bounced: { cls: "bg-rose-100 text-rose-700", label: "مرتد" },
    skipped: { cls: "bg-amber-100 text-amber-700", label: "متجاوز" },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

/* ------------------------------ boundaries ------------------------------ */

function Skeleton() {
  return (
    <div className="container-app py-6 space-y-4" dir="rtl">
      <div className="h-8 w-64 rounded-lg bg-slate-200/60 animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-200/50 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-slate-200/40 animate-pulse" />
    </div>
  );
}

function ErrorState({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="container-app py-10 grid place-items-center" dir="rtl">
      <div className="rounded-2xl border bg-white max-w-md w-full p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500 mb-2" />
        <h2 className="text-lg font-bold">تعذّر تحميل سجلات الإشعارات</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" /> حاول مجددًا
        </button>
      </div>
    </div>
  );
}
