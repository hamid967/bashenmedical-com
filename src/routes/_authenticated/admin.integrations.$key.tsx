import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  Inbox,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Plug,
} from "lucide-react";
import {
  listIntegrationLogs,
  listIntegrationsOverview,
} from "@/lib/admin/integrations.functions";

type Search = {
  window?: 1 | 6 | 24 | 72 | 168;
  status?: "all" | "success" | "error";
  page?: number;
};

const WINDOWS = [1, 6, 24, 72, 168] as const;
const PAGE_SIZE = 50;

export const Route = createFileRoute("/_authenticated/admin/integrations/$key")({
  head: ({ params }) => ({
    meta: [
      { title: `تكامل ${params.key} | لوحة الإدارة` },
      {
        name: "description",
        content: `سجلات وتفاصيل تشغيل تكامل ${params.key} مع مؤشرات النجاح والفشل.`,
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): Search => {
    const w = Number(raw.window);
    const status = raw.status;
    return {
      window: (WINDOWS as readonly number[]).includes(w) ? (w as 1 | 6 | 24 | 72 | 168) : undefined,
      status:
        status === "success" || status === "error" || status === "all"
          ? (status as Search["status"])
          : undefined,
      page: typeof raw.page === "number" ? raw.page : Number(raw.page) || undefined,
    };
  },
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل السجلات</h2>
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
    <div className="container-app py-16 text-center text-muted-foreground">
      لا توجد بيانات لهذا التكامل.
    </div>
  ),
  component: IntegrationDrillDown,
});

const STATUS_TONE = (status: string) => {
  const s = status.toLowerCase();
  if (["ok", "success", "succeeded", "200", "201"].includes(s))
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  return "bg-red-500/10 text-red-700 dark:text-red-400";
};

function IntegrationDrillDown() {
  const { key } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const window = search.window ?? 24;
  const status = search.status ?? "all";
  const page = search.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const listFn = useServerFn(listIntegrationLogs);
  const overviewFn = useServerFn(listIntegrationsOverview);

  const overview = useQuery({
    queryKey: ["admin-integration-summary", key, window],
    queryFn: () => overviewFn({ data: { since_hours: window } }),
    select: (d) => d.integrations.find((i) => i.integration_key === key) ?? null,
  });

  const logs = useQuery({
    queryKey: ["admin-integration-logs", key, window, status, page],
    queryFn: () =>
      listFn({
        data: {
          integration_key: key,
          status,
          since_hours: window,
          limit: PAGE_SIZE,
          offset,
        },
      }),
  });

  const rows = logs.data?.rows ?? [];
  const total = logs.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summary = overview.data;

  return (
    <div className="container-app py-6 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/integrations" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="h-4 w-4" /> التكاملات
        </Link>
        <span>/</span>
        <span className="text-foreground font-mono">{key}</span>
      </div>

      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Plug className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold font-mono">{key}</h1>
            <p className="text-sm text-muted-foreground">
              سجلات التنفيذ لآخر {window} ساعة
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={window}
            onChange={(e) =>
              navigate({
                search: { ...search, window: Number(e.target.value) as Search["window"], page: 1 },
              })
            }
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            aria-label="نافذة الزمن"
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                آخر {w} ساعة
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) =>
              navigate({
                search: { ...search, status: e.target.value as Search["status"], page: 1 },
              })
            }
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            aria-label="فلترة الحالة"
          >
            <option value="all">الكل</option>
            <option value="success">نجاح فقط</option>
            <option value="error">فشل فقط</option>
          </select>
          <button
            type="button"
            onClick={() => {
              logs.refetch();
              overview.refetch();
            }}
            disabled={logs.isFetching}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${logs.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </header>

      {summary && (
        <section className="grid gap-3 sm:grid-cols-4">
          <Metric label="استدعاءات" value={summary.total.toString()} />
          <Metric
            label="نجاح"
            value={summary.success.toString()}
            tone="text-emerald-600 dark:text-emerald-400"
          />
          <Metric
            label="فشل"
            value={summary.errors.toString()}
            tone="text-red-600 dark:text-red-400"
          />
          <Metric
            label="متوسط الزمن"
            value={summary.avg_duration_ms != null ? `${summary.avg_duration_ms} ms` : "—"}
          />
        </section>
      )}

      {summary?.last_error_message && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
          <div className="font-medium text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> آخر رسالة فشل
          </div>
          <div className="mt-1 font-mono text-xs whitespace-pre-wrap break-words">
            {summary.last_error_message}
          </div>
          {summary.last_error_at && (
            <div className="mt-1 text-xs text-muted-foreground">
              {new Date(summary.last_error_at).toLocaleString("ar-SA")}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        {logs.isLoading ? (
          <div className="p-4 space-y-3" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : logs.isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
            {(logs.error as Error)?.message ?? "تعذّر التحميل"}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Inbox className="mx-auto h-10 w-10 mb-3" />
            <p className="text-sm">لا توجد سجلات مطابقة.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-3 font-medium">الوقت</th>
                  <th className="p-3 font-medium">العملية</th>
                  <th className="p-3 font-medium">الحالة</th>
                  <th className="p-3 font-medium">الزمن</th>
                  <th className="p-3 font-medium">Mock</th>
                  <th className="p-3 font-medium">الرسالة</th>
                  <th className="p-3 font-medium sr-only">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("ar-SA")}
                    </td>
                    <td className="p-3 font-mono text-xs">{r.operation}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS_TONE(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {r.duration_ms != null ? `${r.duration_ms} ms` : "—"}
                    </td>
                    <td className="p-3 text-xs">{r.is_mock ? "نعم" : "—"}</td>
                    <td className="p-3 text-xs max-w-[280px] truncate" title={r.error_message ?? ""}>
                      {r.error_message ?? "—"}
                    </td>
                    <td className="p-3 text-left">
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className="text-primary hover:underline text-sm"
                      >
                        عرض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            صفحة {page} من {totalPages} · إجمالي {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                navigate({ search: { ...search, page: Math.max(1, page - 1) } })
              }
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </button>
            <button
              type="button"
              onClick={() =>
                navigate({ search: { ...search, page: Math.min(totalPages, page + 1) } })
              }
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-50"
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {selectedId && <LogDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function LogDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  // Lazy-import to keep the drawer isolated
  const { getIntegrationLog } = require("@/lib/admin/integrations.functions") as typeof import(
    "@/lib/admin/integrations.functions"
  );
  const fn = useServerFn(getIntegrationLog);
  const q = useQuery({
    queryKey: ["admin-integration-log", id],
    queryFn: () => fn({ data: { id } }),
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-background border-l overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-background border-b p-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">تفاصيل السجل</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
          >
            إغلاق
          </button>
        </header>
        <div className="p-4 space-y-4 text-sm">
          {q.isLoading ? (
            <div className="h-40 rounded-md bg-muted/50 animate-pulse" />
          ) : q.isError ? (
            <div className="text-destructive text-sm">
              <AlertTriangle className="inline h-4 w-4 mr-1" />
              {(q.error as Error).message}
            </div>
          ) : q.data ? (
            <>
              <Row label="التكامل" value={q.data.integration_key} mono />
              <Row label="العملية" value={q.data.operation} mono />
              <Row label="الحالة" value={q.data.status} />
              <Row
                label="الزمن"
                value={q.data.duration_ms != null ? `${q.data.duration_ms} ms` : "—"}
              />
              <Row label="Mock" value={q.data.is_mock ? "نعم" : "—"} />
              <Row
                label="التاريخ"
                value={new Date(q.data.created_at).toLocaleString("ar-SA")}
              />
              {q.data.error_message && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">رسالة الخطأ</div>
                  <pre className="rounded-md border bg-red-500/5 border-red-500/30 p-3 text-xs whitespace-pre-wrap break-words">
                    {q.data.error_message}
                  </pre>
                </div>
              )}
              <JsonBlock label="Request" value={q.data.request_data} />
              <JsonBlock label="Response" value={q.data.response_data} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  let pretty = "";
  try {
    pretty = JSON.stringify(value, null, 2);
  } catch {
    pretty = String(value);
  }
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <pre className="rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words max-h-80 overflow-auto">
        {pretty}
      </pre>
    </div>
  );
}
