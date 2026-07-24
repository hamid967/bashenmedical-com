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
  getNotificationDeliveryKpis,
  getNotificationDeliveryLogDetail,
  listNotificationDeliveryLogs,
  retryNotificationDeliveryLog,
  exportNotificationDeliveryLogsCsv,
  type NotificationDeliveryLog,
  type NotificationDeliveryLogDetail,
  type NotificationDeliveryStats,
  type NotificationDeliveryKpis,
} from "@/lib/admin/notification-logs.functions";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, FlaskConical, RotateCw, Download } from "lucide-react";
import { toast } from "sonner";

/* ------------------------------- queries -------------------------------- */

type Filters = {
  channel: NotificationDeliveryLog["channel"] | "";
  status: NotificationDeliveryLog["status"] | "";
  q: string;
  windowHours: number;
  testOnly: boolean;
};

const DEFAULT_FILTERS: Filters = {
  channel: "",
  status: "",
  q: "",
  windowHours: 24 * 7,
  testOnly: false,
};

const logsQuery = (f: Filters) =>
  queryOptions({
    queryKey: ["admin", "notif-logs", "list", f],
    queryFn: () =>
      listNotificationDeliveryLogs({
        data: {
          channel: f.channel || null,
          status: f.status || null,
          q: f.q ? f.q : null,
          testOnly: f.testOnly || null,
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

const kpisQuery = () =>
  queryOptions({
    queryKey: ["admin", "notif-logs", "kpis-24h"],
    queryFn: () => getNotificationDeliveryKpis({ data: { windowHours: 24 } }),
    staleTime: 30_000,
  });

/* ------------------------------- route ---------------------------------- */

export const Route = createFileRoute("/_authenticated/admin/notification-logs")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(logsQuery(DEFAULT_FILTERS)),
      context.queryClient.ensureQueryData(statsQuery(DEFAULT_FILTERS.windowHours)),
      context.queryClient.ensureQueryData(kpisQuery()),
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilters((f) => ({ ...f, testOnly: !f.testOnly }))}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 h-9 text-xs font-semibold border ${
              filters.testOnly
                ? "bg-amber-100 text-amber-800 border-amber-300"
                : "bg-white text-muted-foreground hover:text-foreground"
            }`}
            title="عرض الاختبارات فقط"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            اختبارات فقط
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await exportNotificationDeliveryLogsCsv({
                  data: {
                    channel: filters.channel || null,
                    status: filters.status || null,
                    q: filters.q ? filters.q : null,
                    testOnly: filters.testOnly || null,
                    windowHours: filters.windowHours,
                    limit: 5000,
                  },
                });
                const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = res.filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                toast.success(`تم تصدير ${res.count.toLocaleString("ar")} سجل.`);
              } catch (e) {
                toast.error((e as Error)?.message || "تعذّر التصدير.");
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border px-3 h-9 text-xs font-semibold hover:bg-slate-50"
            title="تصدير السجلات المطابقة للفلاتر الحالية إلى ملف CSV"
          >
            <Download className="h-3.5 w-3.5" />
            تصدير CSV
          </button>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "notif-logs"] })}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 h-9 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </button>
        </div>
      </header>

      <StatsRow stats={s} />

      <FiltersBar
        filters={filters}
        onChange={(next) => setFilters(next)}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />

      <LogsTable rows={rows} loading={logs.isFetching} onOpen={setSelectedId} />

      {selectedId && (
        <LogDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

/* --------------------------- detail drawer ------------------------------ */

function LogDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin", "notif-logs", "detail", id],
    queryFn: () => getNotificationDeliveryLogDetail({ data: { id } }),
    staleTime: 30_000,
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <aside
        className="absolute inset-y-0 start-0 w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="sticky top-0 z-10 bg-white border-b px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">تفاصيل محاولة التسليم</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {q.isLoading ? (
          <div className="p-6 grid place-items-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : q.isError ? (
          <div className="p-6 text-sm text-rose-700">
            {(q.error as Error)?.message ?? "تعذّر تحميل التفاصيل"}
          </div>
        ) : q.data ? (
          <LogDetailBody detail={q.data} />
        ) : null}
      </aside>
    </div>
  );
}

function LogDetailBody({ detail }: { detail: NotificationDeliveryLogDetail }) {
  const n = detail.notification;
  const qc = useQueryClient();
  const canRetry = ["failed", "bounced", "skipped"].includes(detail.status);
  const retry = useMutation({
    mutationFn: () => retryNotificationDeliveryLog({ data: { id: detail.id } }),
    onSuccess: (res) => {
      toast.success(
        res.reused
          ? "تم استخدام محاولة إعادة موجودة مسبقًا (idempotent)."
          : "تم إدراج محاولة تسليم جديدة بحالة pending.",
      );
      qc.invalidateQueries({ queryKey: ["admin", "notif-logs"] });
    },
    onError: (e: Error) => toast.error(e.message || "تعذّر إعادة المحاولة."),
  });
  return (
    <div className="p-5 space-y-5 text-sm">
      <section className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ChannelBadge channel={detail.channel} />
          <StatusBadge status={detail.status} />
          {detail.is_test && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-semibold">
              <FlaskConical className="h-3 w-3" /> اختبار
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            محاولة #{detail.attempt}
          </span>
          {canRetry && (
            <button
              type="button"
              onClick={() => retry.mutate()}
              disabled={retry.isPending}
              className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 h-8 text-xs font-semibold disabled:opacity-60"
              title="إعادة إدراج محاولة تسليم جديدة (idempotent)"
            >
              {retry.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="h-3.5 w-3.5" />
              )}
              إعادة المحاولة
            </button>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">التاريخ</dt>
          <dd className="col-span-2">
            {new Date(detail.created_at).toLocaleString("ar")}
          </dd>
          <dt className="text-muted-foreground">آخر تحديث</dt>
          <dd className="col-span-2">
            {new Date(detail.updated_at).toLocaleString("ar")}
          </dd>
          <dt className="text-muted-foreground">القالب</dt>
          <dd className="col-span-2">{detail.template ?? "—"}</dd>
          <dt className="text-muted-foreground">المزود</dt>
          <dd className="col-span-2">{detail.provider ?? "—"}</dd>
          <dt className="text-muted-foreground">المستلم</dt>
          <dd className="col-span-2 font-mono break-all">
            {detail.recipient ?? "—"}
          </dd>
          <dt className="text-muted-foreground">الموضوع</dt>
          <dd className="col-span-2">{detail.subject ?? "—"}</dd>
        </dl>
      </section>

      {detail.error_message && (
        <section>
          <h3 className="text-xs font-semibold text-rose-700 mb-1">
            سبب الفشل
          </h3>
          <pre className="rounded-lg bg-rose-50 text-rose-800 text-xs p-3 whitespace-pre-wrap break-words border border-rose-200">
            {detail.error_message}
          </pre>
        </section>
      )}

      {n && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">
            الرسالة الأصلية
          </h3>
          <div className="rounded-xl border p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                kind: {n.kind ?? "—"}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                audience: {n.audience ?? "—"}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                {n.send_status ?? "—"}
              </span>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">العنوان</div>
              <div className="text-sm font-semibold">{n.title ?? "—"}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">النص</div>
              <pre className="text-xs whitespace-pre-wrap break-words bg-slate-50 p-2 rounded border">
                {n.body ?? "—"}
              </pre>
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">
          البيانات الوصفية (metadata)
        </h3>
        <pre className="rounded-lg bg-slate-50 border text-[11px] p-3 whitespace-pre-wrap break-words max-h-64 overflow-auto">
          {JSON.stringify(detail.metadata ?? {}, null, 2)}
        </pre>
      </section>
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

function LogsTable({
  rows,
  loading,
  onOpen,
}: {
  rows: NotificationDeliveryLog[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
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
              <tr
                key={r.id}
                className="border-t hover:bg-muted/30 cursor-pointer"
                onClick={() => onOpen(r.id)}
              >
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ar")}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <ChannelBadge channel={r.channel} />
                    {r.is_test && (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold"
                        title="إرسال اختباري"
                      >
                        <FlaskConical className="h-3 w-3" />
                      </span>
                    )}
                  </div>
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
