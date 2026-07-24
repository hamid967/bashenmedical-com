import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  AlertTriangle,
  Inbox,
  Plug,
  CheckCircle2,
  XCircle,
  Beaker,
  Clock,
} from "lucide-react";
import { listIntegrationsOverview } from "@/lib/admin/integrations.functions";

type IntegrationsSearch = { window?: 1 | 6 | 24 | 72 | 168 };
const WINDOWS = [1, 6, 24, 72, 168] as const;

export const Route = createFileRoute("/_authenticated/admin/integrations")({
  head: () => ({
    meta: [
      { title: "التكاملات | لوحة الإدارة" },
      {
        name: "description",
        content:
          "مراقبة التكاملات الخارجية: معدل النجاح والفشل، سجلات التنفيذ، وحفر إلى تفاصيل كل تكامل.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): IntegrationsSearch => {
    const w = Number(raw.window);
    return {
      window: (WINDOWS as readonly number[]).includes(w) ? (w as 1 | 6 | 24 | 72 | 168) : undefined,
    };
  },
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل التكاملات</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-muted-foreground">لا توجد بيانات.</div>
  ),
  component: AdminIntegrationsRoute,
});

const WINDOW_LABEL: Record<number, string> = {
  1: "آخر ساعة",
  6: "آخر 6 ساعات",
  24: "آخر 24 ساعة",
  72: "آخر 3 أيام",
  168: "آخر 7 أيام",
};

const STATUS_CLASS: Record<string, { label: string; className: string }> = {
  healthy: { label: "سليم", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  degraded: { label: "متذبذب", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  failing: { label: "فاشل", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
  idle: { label: "خامل", className: "bg-muted text-muted-foreground" },
};

function AdminIntegrationsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const window = search.window ?? 24;
  const fn = useServerFn(listIntegrationsOverview);

  const query = useQuery({
    queryKey: ["admin-integrations-overview", window],
    queryFn: () => fn({ data: { since_hours: window } }),
    refetchInterval: 30_000,
  });

  const totals = query.data?.totals ?? { total: 0, success: 0, errors: 0 };
  const items = query.data?.integrations ?? [];

  return (
    <div className="container-app py-6 space-y-4">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Plug className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">التكاملات</h1>
            <p className="text-sm text-muted-foreground">
              {items.length > 0
                ? `${items.length} تكاملات نشطة · ${WINDOW_LABEL[window]}`
                : "مراقبة الاتصال بالأنظمة الخارجية"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={window}
            onChange={(e) =>
              navigate({ search: { window: Number(e.target.value) as 1 | 6 | 24 | 72 | 168 } })
            }
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            aria-label="فترة المراقبة"
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {WINDOW_LABEL[w]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="إجمالي الاستدعاءات"
          value={totals.total.toLocaleString("ar-SA")}
          icon={Clock}
          tone="default"
        />
        <SummaryCard
          label="نجاح"
          value={totals.success.toLocaleString("ar-SA")}
          icon={CheckCircle2}
          tone="success"
        />
        <SummaryCard
          label="فشل"
          value={totals.errors.toLocaleString("ar-SA")}
          icon={XCircle}
          tone="error"
        />
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">حالة التكاملات</h2>
      </div>


      <div className="rounded-lg border bg-card overflow-hidden">
        {query.isLoading ? (
          <SkeletonRows />
        ) : query.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
            {(query.error as Error)?.message ?? "تعذّر التحميل"}
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Inbox className="mx-auto h-10 w-10 mb-3" aria-hidden="true" />
            <p className="text-sm">لا توجد استدعاءات مسجّلة في هذه الفترة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-3 font-medium">التكامل</th>
                  <th className="p-3 font-medium">الحالة</th>
                  <th className="p-3 font-medium">استدعاءات</th>
                  <th className="p-3 font-medium">نجاح</th>
                  <th className="p-3 font-medium">فشل</th>
                  <th className="p-3 font-medium">معدل الفشل</th>
                  <th className="p-3 font-medium">متوسط الزمن</th>
                  <th className="p-3 font-medium">آخر تشغيل</th>
                  <th className="p-3 font-medium sr-only">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((g) => {
                  const badge = STATUS_CLASS[g.status_class] ?? STATUS_CLASS.idle;
                  return (
                    <tr key={g.integration_key} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="font-mono">{g.integration_key}</span>
                          {g.mock > 0 && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 text-[10px]"
                              title="يحتوي على استدعاءات وهمية (mock)"
                            >
                              <Beaker className="h-3 w-3" /> mock {g.mock}
                            </span>
                          )}
                        </div>
                        {g.last_error_message && (
                          <div
                            className="mt-1 truncate max-w-[320px] text-xs text-destructive"
                            title={g.last_error_message}
                          >
                            {g.last_error_message}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{g.total}</td>
                      <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400">
                        {g.success}
                      </td>
                      <td className="p-3 font-mono text-red-600 dark:text-red-400">{g.errors}</td>
                      <td className="p-3 font-mono">{(g.error_rate * 100).toFixed(1)}%</td>
                      <td className="p-3 font-mono">
                        {g.avg_duration_ms != null ? `${g.avg_duration_ms} ms` : "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {g.last_run_at ? new Date(g.last_run_at).toLocaleString("ar-SA") : "—"}
                      </td>
                      <td className="p-3 text-left">
                        <Link
                          to="/admin/integrations/$key"
                          params={{ key: g.integration_key }}
                          className="text-primary hover:underline text-sm"
                        >
                          تفاصيل
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {query.data?.truncated && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ⚠︎ تم اقتطاع البيانات عند 5000 سجل — قلّص الفترة للحصول على إحصاءات كاملة.
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "success" | "error";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "error"
        ? "text-red-600 dark:text-red-400"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="p-4 space-y-3" aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />
      ))}
    </div>
  );
}
