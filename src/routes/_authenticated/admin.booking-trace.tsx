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
  error_code?: string;
  doctor_id?: string;
  patient_name?: string;
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
    error_code:
      typeof raw.error_code === "string" ? raw.error_code : undefined,
    doctor_id: typeof raw.doctor_id === "string" ? raw.doctor_id : undefined,
    patient_name:
      typeof raw.patient_name === "string" ? raw.patient_name : undefined,
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
  const [errCode, setErrCode] = useState(search.error_code ?? "");
  const [doctorId, setDoctorId] = useState(search.doctor_id ?? "");
  const [patientName, setPatientName] = useState(search.patient_name ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");

  const hasFilter = !!(
    corr ||
    ref ||
    errCode ||
    doctorId ||
    patientName ||
    from ||
    to
  );

  const events = useQuery({
    queryKey: [
      "booking-trace-events",
      corr,
      ref,
      errCode,
      doctorId,
      patientName,
      from,
      to,
    ],
    queryFn: () =>
      listFn({
        data: {
          correlation_id: corr || undefined,
          reference: ref || undefined,
          error_code: errCode || undefined,
          doctor_id: doctorId || undefined,
          patient_name: patientName || undefined,
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

      <div className="rounded border bg-white p-3 grid grid-cols-1 md:grid-cols-6 gap-2">
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
          className="border rounded px-2 py-1.5 text-sm font-mono md:col-span-2"
        />
        <input
          value={errCode}
          onChange={(e) => setErrCode(e.target.value.trim())}
          placeholder="Error code (SLOT_TAKEN…)"
          className="border rounded px-2 py-1.5 text-sm font-mono md:col-span-2"
        />
        <input
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          placeholder="اسم المريض"
          className="border rounded px-2 py-1.5 text-sm md:col-span-2"
        />
        <input
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value.trim())}
          placeholder="Doctor ID (UUID)"
          className="border rounded px-2 py-1.5 text-sm font-mono md:col-span-2"
        />
        <div className="md:col-span-2" />
        <input
          type="datetime-local"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm md:col-span-3"
        />
        <input
          type="datetime-local"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border rounded px-2 py-1.5 text-sm md:col-span-3"
        />
        <div className="md:col-span-6 flex gap-2 justify-end">
          <button
            onClick={() => {
              setCorr("");
              setRef("");
              setErrCode("");
              setDoctorId("");
              setPatientName("");
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
        <>
          <SummaryPanel rows={events.data?.rows ?? []} />
          <EventsPanel
            loading={events.isLoading}
            rows={events.data?.rows ?? []}
          />
        </>
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
    last_error_code: string | null;
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
              <th className="text-right px-3 py-2 font-medium">Error Code</th>
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
                <td className="px-3 py-2">
                  {r.last_error_code ? (
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-red-50 text-red-800 border border-red-200">
                      {r.last_error_code}
                    </span>
                  ) : (
                    <span className="text-slate-300 text-xs">—</span>
                  )}
                </td>
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
    error_code: string | null;
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
                {r.error_code && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-800 border border-red-200">
                    {r.error_code}
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

type EventRow = {
  id: string;
  correlation_id: string;
  event: string;
  reference_number: string | null;
  appointment_id: string | null;
  duration_ms: number | null;
  created_at: string;
  error_code: string | null;
};

type RecoveryPath =
  | "direct_success"
  | "replay_fastpath"
  | "replay_rpc"
  | "alternatives_recovery"
  | "failed_conflict"
  | "failed_error"
  | "in_progress";

type CorrSummary = {
  correlation_id: string;
  path: RecoveryPath;
  final_status: "confirmed" | "conflict" | "error" | "pending";
  reference_number: string | null;
  appointment_id: string | null;
  conflicts: number;
  errors: number;
  attempts: number;
  total_ms: number;
  started_at: string;
  ended_at: string;
  last_error_code: string | null;
};

function summarize(rows: EventRow[]): CorrSummary[] {
  const byCorr = new Map<string, EventRow[]>();
  for (const r of rows) {
    if (!byCorr.has(r.correlation_id)) byCorr.set(r.correlation_id, []);
    byCorr.get(r.correlation_id)!.push(r);
  }
  const out: CorrSummary[] = [];
  for (const [corr, list] of byCorr) {
    const asc = [...list].sort((a, b) =>
      a.created_at < b.created_at ? -1 : 1,
    );
    let attempts = 0;
    let conflicts = 0;
    let errors = 0;
    let successIdx = -1;
    let lastConflictIdx = -1;
    let lastErrorIdx = -1;
    let hasFastpathReplay = false;
    let hasRpcReplay = false;
    let reference: string | null = null;
    let appointmentId: string | null = null;
    let totalMs = 0;
    let lastErrorCode: string | null = null;
    asc.forEach((r, i) => {
      if (r.event === "rpc.call") attempts++;
      if (r.event.endsWith(".conflict")) {
        conflicts++;
        lastConflictIdx = i;
        if (r.error_code) lastErrorCode = r.error_code;
      }
      if (r.event.endsWith(".error")) {
        errors++;
        lastErrorIdx = i;
        if (r.error_code) lastErrorCode = r.error_code;
      }
      if (r.event === "rpc.replay.fastpath") hasFastpathReplay = true;
      if (r.event === "rpc.replay.rpc" || r.event === "rpc.replay.race")
        hasRpcReplay = true;
      if (
        r.event === "rpc.success" ||
        r.event === "rpc.replay.rpc" ||
        r.event === "rpc.replay.fastpath"
      ) {
        successIdx = i;
      }
      if (!reference && r.reference_number) reference = r.reference_number;
      if (!appointmentId && r.appointment_id) appointmentId = r.appointment_id;
      totalMs += r.duration_ms ?? 0;
    });

    let path: RecoveryPath;
    let final_status: CorrSummary["final_status"];
    if (successIdx >= 0) {
      final_status = "confirmed";
      if (hasFastpathReplay && conflicts === 0 && errors === 0)
        path = "replay_fastpath";
      else if (hasRpcReplay && conflicts === 0 && errors === 0)
        path = "replay_rpc";
      else if (conflicts > 0 || errors > 0) path = "alternatives_recovery";
      else path = "direct_success";
    } else if (lastErrorIdx > lastConflictIdx && lastErrorIdx >= 0) {
      final_status = "error";
      path = "failed_error";
    } else if (lastConflictIdx >= 0) {
      final_status = "conflict";
      path = "failed_conflict";
    } else {
      final_status = "pending";
      path = "in_progress";
    }

    out.push({
      correlation_id: corr,
      path,
      final_status,
      reference_number: reference,
      appointment_id: appointmentId,
      conflicts,
      errors,
      attempts: Math.max(attempts, asc.length > 0 ? 1 : 0),
      total_ms: totalMs,
      started_at: asc[0]?.created_at ?? "",
      ended_at: asc[asc.length - 1]?.created_at ?? "",
      last_error_code: lastErrorCode,
    });
  }
  return out.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

const PATH_META: Record<
  RecoveryPath,
  { label: string; hint: string; cls: string }
> = {
  direct_success: {
    label: "نجاح مباشر",
    hint: "تم تأكيد الحجز من أول محاولة بدون تعارض أو إعادة.",
    cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  replay_fastpath: {
    label: "إعادة تشغيل (Fast Path)",
    hint: "تم اكتشاف idempotency-key مكرر وأُعيد نفس الحجز عبر المسار السريع.",
    cls: "bg-sky-50 text-sky-800 border-sky-200",
  },
  replay_rpc: {
    label: "إعادة تشغيل (RPC)",
    hint: "أعادت قاعدة البيانات نفس الحجز نتيجة تكرار idempotency-key.",
    cls: "bg-sky-50 text-sky-800 border-sky-200",
  },
  alternatives_recovery: {
    label: "استرداد عبر البدائل",
    hint: "وقع تعارض/خطأ في محاولة سابقة ثم نجح الحجز على وقت أو طبيب بديل.",
    cls: "bg-violet-50 text-violet-800 border-violet-200",
  },
  failed_conflict: {
    label: "فشل — تعارض غير مُسترَد",
    hint: "انتهت الجلسة بتعارض على الموعد ولم يتم تأكيد أي بديل.",
    cls: "bg-amber-50 text-amber-800 border-amber-200",
  },
  failed_error: {
    label: "فشل — خطأ خادم",
    hint: "انتهت الجلسة بخطأ من قاعدة البيانات أو الخادم دون تأكيد.",
    cls: "bg-red-50 text-red-800 border-red-200",
  },
  in_progress: {
    label: "قيد التنفيذ",
    hint: "بدأت المحاولة ولم يُرصد حدث نهائي بعد.",
    cls: "bg-slate-50 text-slate-700 border-slate-200",
  },
};

const STATUS_META: Record<
  CorrSummary["final_status"],
  { label: string; cls: string }
> = {
  confirmed: { label: "مؤكد", cls: "bg-emerald-100 text-emerald-800" },
  conflict: { label: "تعارض", cls: "bg-amber-100 text-amber-800" },
  error: { label: "خطأ", cls: "bg-red-100 text-red-800" },
  pending: { label: "معلّق", cls: "bg-slate-100 text-slate-700" },
};

function SummaryPanel({ rows }: { rows: EventRow[] }) {
  const summaries = useMemo(() => summarize(rows), [rows]);
  if (summaries.length === 0) return null;
  return (
    <div className="rounded border bg-white overflow-hidden">
      <div className="px-3 py-2 text-sm text-slate-600 border-b flex items-center gap-2">
        <Search className="w-3.5 h-3.5" />
        ملخص مسار الاسترداد لكل Correlation ID
      </div>
      <ul className="divide-y">
        {summaries.map((s) => {
          const pathMeta = PATH_META[s.path];
          const statusMeta = STATUS_META[s.final_status];
          return (
            <li key={s.correlation_id} className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    navigator.clipboard?.writeText(s.correlation_id)
                  }
                  className="text-xs font-mono inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
                  title={s.correlation_id}
                >
                  <Copy className="w-3 h-3" />
                  {s.correlation_id.length > 24
                    ? `${s.correlation_id.slice(0, 10)}…${s.correlation_id.slice(-8)}`
                    : s.correlation_id}
                </button>
                <span
                  className={`px-2 py-0.5 rounded text-xs border ${pathMeta.cls}`}
                >
                  {pathMeta.label}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs ${statusMeta.cls}`}
                >
                  {statusMeta.label}
                </span>
                {s.reference_number && (
                  <span className="text-xs font-mono text-slate-700">
                    المرجع: {s.reference_number}
                  </span>
                )}
                {s.last_error_code && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-800 border border-red-200">
                    {s.last_error_code}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">{pathMeta.hint}</p>
              <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                <span>محاولات: {s.attempts}</span>
                <span>تعارضات: {s.conflicts}</span>
                <span>أخطاء: {s.errors}</span>
                <span>الزمن الكلي: {s.total_ms}ms</span>
                <span>البداية: {fmt(s.started_at)}</span>
                <span>النهاية: {fmt(s.ended_at)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

