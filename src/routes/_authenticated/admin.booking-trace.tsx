import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { RefreshCw, Search, X, ShieldAlert, Copy, ChevronRight } from "lucide-react";
import {
  listBookingTraceEvents,
  listRecentBookingCorrelations,
} from "@/lib/admin/booking-trace.functions";
import { getMyRoles } from "@/lib/admin.functions";

type TraceSearch = {
  correlation_id?: string;
  reference?: string;
  from?: string;
  to?: string;
};

export const Route = createFileRoute("/_authenticated/admin/booking-trace")({
  head: () => ({
    meta: [
      { title: "تتبع الحجوزات (Correlation ID) | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "استكشاف أحداث الحجز عبر Correlation ID ورقم المرجع BMC لتتبع الأخطاء والتكرار.",
      },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): TraceSearch => ({
    correlation_id:
      typeof raw.correlation_id === "string" ? raw.correlation_id : undefined,
    reference: typeof raw.reference === "string" ? raw.reference : undefined,
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" ? raw.to : undefined,
  }),
  component: BookingTracePage,
});

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("ar-SA");
  } catch {
    return ts;
  }
}

function eventBadge(event: string) {
  const isErr = event.endsWith(".error");
  const isConf = event.endsWith(".conflict");
  const isSuccess = event.endsWith(".success") || event.endsWith(".replay.rpc");
  const cls = isErr
    ? "bg-red-100 text-red-800"
    : isConf
      ? "bg-amber-100 text-amber-800"
      : isSuccess
        ? "bg-emerald-100 text-emerald-800"
        : "bg-slate-100 text-slate-700";
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${cls}`}>{event}</span>
  );
}

function BookingTracePage() {
  const search = Route.useSearch();
  const rolesFn = useServerFn(getMyRoles);
  const listFn = useServerFn(listBookingTraceEvents);
  const recentFn = useServerFn(listRecentBookingCorrelations);

  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isStaff = useMemo(() => {
    const r = rolesQ.data?.roles ?? [];
    return (r as string[]).includes("admin") || (r as string[]).includes("super_admin");
  }, [rolesQ.data]);

  const [corr, setCorr] = useState(search.correlation_id ?? "");
  const [ref, setRef] = useState(search.reference ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");

  const hasFilter = !!(corr || ref || from || to);

  const events = useQuery({
    queryKey: ["booking-trace-events", corr, ref, from, to],
    queryFn: () =>
      listFn({
        data: {
          correlation_id: corr || undefined,
          reference: ref || undefined,
          from: from || undefined,
          to: to || undefined,
          limit: 300,
        },
      }),
    enabled: isStaff && hasFilter,
  });

  const recent = useQuery({
    queryKey: ["booking-trace-recent"],
    queryFn: () => recentFn({ data: { limit: 40 } }),
    enabled: isStaff && !hasFilter,
    refetchInterval: 15000,
  });

  if (rolesQ.isLoading) {
    return <div className="p-6 text-sm text-slate-500">جارِ التحقق من الصلاحيات…</div>;
  }
  if (!isStaff) {
    return (
      <div className="p-6 flex items-start gap-3 text-red-800">
        <ShieldAlert className="w-5 h-5 mt-0.5" />
        <div>ليست لديك صلاحية لعرض هذه الصفحة.</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">تتبع الحجوزات — Correlation ID</h1>
          <p className="text-sm text-slate-500">
            تتبّع كل محاولة حجز (نجاح، تعارض، تكرار، خطأ) عبر معرّف موحّد ورقم مرجع BMC.
          </p>
        </div>
        <Link
          to="/admin/audit-logs"
          className="text-sm text-slate-600 hover:text-slate-900 underline"
        >
          سجل التدقيق العام ←
        </Link>
      </header>

      <div className="rounded border bg-white p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        <input
          value={corr}
          onChange={(e) => setCorr(e.target.value.trim())}
          placeholder="Correlation ID"
          className="border rounded px-2 py-1.5 text-sm font-mono md:col-span-2"
        />
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value.trim())}
          placeholder="BMC-YYYYMMDD-XXXX"
          className="border rounded px-2 py-1.5 text-sm font-mono"
        />
        <input
          type="datetime-local"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <input
          type="datetime-local"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <div className="md:col-span-5 flex gap-2 justify-end">
          <button
            onClick={() => {
              setCorr("");
              setRef("");
              setFrom("");
              setTo("");
            }}
            className="text-sm inline-flex items-center gap-1 px-2 py-1 border rounded hover:bg-slate-50"
          >
            <X className="w-3.5 h-3.5" /> مسح
          </button>
          <button
            onClick={() => (hasFilter ? events.refetch() : recent.refetch())}
            className="text-sm inline-flex items-center gap-1 px-2 py-1 border rounded hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </button>
        </div>
      </div>

      {!hasFilter ? (
        <RecentPanel
          loading={recent.isLoading}
          rows={recent.data?.rows ?? []}
          onPick={(id) => setCorr(id)}
        />
      ) : (
        <EventsPanel
          loading={events.isLoading}
          rows={events.data?.rows ?? []}
        />
      )}
    </div>
  );
}

function RecentPanel({
  loading,
  rows,
  onPick,
}: {
  loading: boolean;
  rows: Array<{
    correlation_id: string;
    started_at: string;
    last_event: string;
    reference_number: string | null;
    events: number;
    had_error: boolean;
    had_conflict: boolean;
    total_ms: number;
  }>;
  onPick: (id: string) => void;
}) {
  return (
    <div className="rounded border bg-white overflow-hidden">
      <div className="px-3 py-2 text-sm text-slate-600 border-b flex items-center gap-2">
        <Search className="w-3.5 h-3.5" />
        آخر محاولات الحجز (اضغط على المعرّف لعرض التفاصيل)
      </div>
      {loading ? (
        <div className="p-4 text-sm text-slate-500">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">لا توجد محاولات حديثة.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-right px-3 py-2 font-medium">Correlation</th>
              <th className="text-right px-3 py-2 font-medium">المرجع</th>
              <th className="text-right px-3 py-2 font-medium">آخر حدث</th>
              <th className="text-right px-3 py-2 font-medium">أحداث</th>
              <th className="text-right px-3 py-2 font-medium">الحالة</th>
              <th className="text-right px-3 py-2 font-medium">الوقت</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.correlation_id} className="border-t hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">
                  <button
                    onClick={() => onPick(r.correlation_id)}
                    className="text-blue-700 hover:underline"
                    title={r.correlation_id}
                  >
                    {r.correlation_id.length > 20
                      ? `${r.correlation_id.slice(0, 8)}…${r.correlation_id.slice(-6)}`
                      : r.correlation_id}
                  </button>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.reference_number ?? "—"}
                </td>
                <td className="px-3 py-2">{eventBadge(r.last_event)}</td>
                <td className="px-3 py-2 text-slate-600">{r.events}</td>
                <td className="px-3 py-2">
                  {r.had_error ? (
                    <span className="text-xs text-red-700">فشل</span>
                  ) : r.had_conflict ? (
                    <span className="text-xs text-amber-700">تعارض</span>
                  ) : (
                    <span className="text-xs text-emerald-700">مكتمل</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500 text-xs">
                  {fmt(r.started_at)}
                </td>
                <td className="px-2">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EventsPanel({
  loading,
  rows,
}: {
  loading: boolean;
  rows: Array<{
    id: string;
    correlation_id: string;
    event: string;
    idempotency_key_masked: string | null;
    reference_number: string | null;
    appointment_id: string | null;
    doctor_id: string | null;
    appointment_date: string | null;
    appointment_time: string | null;
    duration_ms: number | null;
    pg_code: string | null;
    extra: unknown;
    created_at: string;
  }>;
}) {
  const ordered = [...rows].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
  );
  return (
    <div className="rounded border bg-white overflow-hidden">
      <div className="px-3 py-2 text-sm text-slate-600 border-b">
        الأحداث ({rows.length})
      </div>
      {loading ? (
        <div className="p-4 text-sm text-slate-500">جارٍ التحميل…</div>
      ) : ordered.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">لا توجد نتائج مطابقة.</div>
      ) : (
        <ol className="divide-y">
          {ordered.map((r) => (
            <li key={r.id} className="p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {eventBadge(r.event)}
                <span className="text-xs text-slate-500">{fmt(r.created_at)}</span>
                {r.duration_ms != null && (
                  <span className="text-xs text-slate-500">
                    {r.duration_ms}ms
                  </span>
                )}
                {r.pg_code && (
                  <span className="text-xs font-mono text-red-700">
                    pg:{r.pg_code}
                  </span>
                )}
                <button
                  onClick={() => navigator.clipboard?.writeText(r.correlation_id)}
                  className="ml-auto text-xs inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                  title="نسخ Correlation ID"
                >
                  <Copy className="w-3 h-3" />
                  {r.correlation_id.slice(0, 8)}…
                </button>
              </div>
              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                {r.reference_number && (
                  <span>
                    المرجع: <span className="font-mono">{r.reference_number}</span>
                  </span>
                )}
                {r.idempotency_key_masked && (
                  <span>
                    Idem: <span className="font-mono">{r.idempotency_key_masked}</span>
                  </span>
                )}
                {r.appointment_date && (
                  <span>
                    التاريخ: {r.appointment_date} {r.appointment_time ?? ""}
                  </span>
                )}
              </div>
              {r.extra &&
              typeof r.extra === "object" &&
              Object.keys(r.extra as Record<string, unknown>).length > 0 ? (
                <pre className="text-[11px] bg-slate-50 border rounded p-2 overflow-x-auto text-slate-700">
                  {JSON.stringify(r.extra, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
