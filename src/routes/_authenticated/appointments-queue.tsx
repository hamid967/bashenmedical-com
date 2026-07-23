import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Copy,
  Download,
  Filter,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  User,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import { listAppointments, updateAppointmentStatus } from "@/lib/admin.functions";
import { listAppointmentTraces } from "@/lib/admin/booking-trace.functions";


export const Route = createFileRoute("/_authenticated/appointments-queue")({
  head: () => ({
    meta: [
      { title: "لوحة الحجوزات — لوحة الإدارة" },
      {
        name: "description",
        content:
          "لوحة إدارة الحجوزات القادمة والمرشّحة مع حالة كل حجز وإجراءات التأكيد والإلغاء والتعديل.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppointmentsQueuePage,
});

type Status = "new" | "confirmed" | "completed" | "cancelled" | "no_show";

type Row = {
  id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string;
  appointment_time: string;
  status: Status;
  reason: string | null;
  notes: string | null;
  created_at?: string | null;
  doctors?: { name_ar?: string | null } | null;
  specialties?: { name_ar?: string | null } | null;
};

type Scope = "upcoming" | "pending" | "today" | "past" | "all";

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  new: { label: "جديد", cls: "bg-teal-500/15 text-teal-700" },
  confirmed: { label: "مؤكّد", cls: "bg-emerald-500/15 text-emerald-700" },
  completed: { label: "مكتمل", cls: "bg-primary/15 text-primary" },
  cancelled: { label: "ملغى", cls: "bg-rose-500/15 text-rose-700" },
  no_show: { label: "لم يحضر", cls: "bg-amber-500/15 text-amber-700" },
};

const STATUS_FILTERS: (Status | "all")[] = [
  "all",
  "new",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

const SCOPE_META: Record<Scope, { label: string; desc: string }> = {
  upcoming: { label: "القادمة", desc: "من اليوم فما بعد، عدا الملغاة والمكتملة." },
  pending: { label: "المرشّحة", desc: "طلبات جديدة بانتظار التأكيد." },
  today: { label: "اليوم", desc: "مواعيد اليوم فقط." },
  past: { label: "المنقضية", desc: "قبل اليوم." },
  all: { label: "الكل", desc: "جميع الطلبات دون فلترة زمنية." },
};

const SCOPES: Scope[] = ["upcoming", "pending", "today", "past", "all"];

function shortRef(id: string) {
  return "BAA-" + id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("ar-SA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function scopePredicate(scope: Scope, r: Row): boolean {
  const today = todayIso();
  switch (scope) {
    case "upcoming":
      return (
        r.appointment_date >= today &&
        r.status !== "cancelled" &&
        r.status !== "completed" &&
        r.status !== "no_show"
      );
    case "pending":
      return r.status === "new";
    case "today":
      return r.appointment_date === today;
    case "past":
      return r.appointment_date < today;
    case "all":
      return true;
  }
}

function AppointmentsQueuePage() {
  const list = useServerFn(listAppointments);
  const tracesFn = useServerFn(listAppointmentTraces);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin", "appointments-queue"],
    queryFn: () => list(),
    staleTime: 30_000,
  });

  const [scope, setScope] = useState<Scope>("upcoming");
  const [status, setStatus] = useState<Status | "all">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const rows = (data ?? []) as Row[];

  const traceQ = useQuery({
    queryKey: [
      "admin",
      "appointments-queue",
      "traces",
      rows.map((r) => r.id).sort().join(","),
    ],
    queryFn: () =>
      tracesFn({
        data: { appointment_ids: rows.slice(0, 200).map((r) => r.id) },
      }),
    enabled: rows.length > 0,
    staleTime: 60_000,
  });
  const traces: Record<
    string,
    { correlation_id: string; error_code: string | null }
  > = traceQ.data?.traces ?? {};


  // Rows filtered by the current scope only — used both for the visible list
  // (after status + query) and for the scope counters.
  const scopedRows = useMemo(() => rows.filter((r) => scopePredicate(scope, r)), [rows, scope]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return scopedRows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!query) return true;
      return (
        r.patient_name.toLowerCase().includes(query) ||
        r.patient_phone.includes(query) ||
        shortRef(r.id).toLowerCase().includes(query) ||
        (r.reason ?? "").toLowerCase().includes(query)
      );
    });
  }, [scopedRows, status, q]);

  const scopeCounts = useMemo(() => {
    const acc: Record<Scope, number> = {
      upcoming: 0,
      pending: 0,
      today: 0,
      past: 0,
      all: rows.length,
    };
    for (const r of rows) {
      if (scopePredicate("upcoming", r)) acc.upcoming++;
      if (scopePredicate("pending", r)) acc.pending++;
      if (scopePredicate("today", r)) acc.today++;
      if (scopePredicate("past", r)) acc.past++;
    }
    return acc;
  }, [rows]);

  const statusCounts = useMemo(() => {
    const acc: Record<string, number> = { all: scopedRows.length };
    for (const r of scopedRows) acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, [scopedRows]);

  function exportVisibleCsv() {
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = [
      "رقم الحجز",
      "المراجع",
      "الجوال",
      "التاريخ",
      "الوقت",
      "التخصص",
      "الطبيب",
      "الحالة",
    ];
    const lines = filtered.map((r) => [
      shortRef(r.id),
      r.patient_name,
      r.patient_phone,
      r.appointment_date,
      r.appointment_time?.slice(0, 5),
      r.specialties?.name_ar,
      r.doctors?.name_ar,
      STATUS_META[r.status].label,
    ]);
    const csv = "\uFEFF" + [header, ...lines].map((line) => line.map(quote).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `baashen-appointments-${todayIso()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${filtered.length} حجز`);
  }

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-black">لوحة الحجوزات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {SCOPE_META[scope].desc} — {filtered.length} حجز معروض من أصل {rows.length}.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportVisibleCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> تصدير
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            لوحة الإدارة
          </Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QueueMetric label="مواعيد اليوم" value={scopeCounts.today} tone="text-primary" />
        <QueueMetric label="بانتظار التأكيد" value={scopeCounts.pending} tone="text-teal-600" />
        <QueueMetric label="القادمة" value={scopeCounts.upcoming} tone="text-emerald-600" />
        <QueueMetric
          label="لم يحضر"
          value={rows.filter((r) => r.status === "no_show").length}
          tone="text-amber-600"
        />
      </div>

      {/* Scope tabs — the primary lens for the queue. */}
      <div className="rounded-2xl border border-border bg-card p-2 mb-3 grid grid-cols-2 sm:grid-cols-5 gap-1">
        {SCOPES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition text-start ${
              scope === s ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span>{SCOPE_META[s].label}</span>
              <span className={`text-xs font-mono ${scope === s ? "opacity-90" : "opacity-60"}`}>
                {scopeCounts[s]}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatus(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                status === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f === "all" ? "الكل" : STATUS_META[f].label}
              <span className="ms-1.5 opacity-70">({statusCounts[f] ?? 0})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم، الجوال، رقم الطلب، أو سبب الزيارة…"
            className="w-full ps-9 pe-3 py-2.5 rounded-md border border-input bg-background text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive mb-4">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            لا توجد حجوزات مطابقة في هذا النطاق.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-start p-3 font-semibold">رقم الطلب</th>
                  <th className="text-start p-3 font-semibold">المريض</th>
                  <th className="text-start p-3 font-semibold">الجوال</th>
                  <th className="text-start p-3 font-semibold">الموعد</th>
                  <th className="text-start p-3 font-semibold">التخصص/الطبيب</th>
                  <th className="text-start p-3 font-semibold">الحالة</th>
                  <th className="text-start p-3 font-semibold">التتبع</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const tr = traces[r.id];
                  return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="border-t border-border cursor-pointer hover:bg-muted/40 transition"
                  >
                    <td className="p-3 font-mono text-xs font-bold">{shortRef(r.id)}</td>
                    <td className="p-3 font-semibold">{r.patient_name}</td>
                    <td className="p-3 font-mono text-xs" dir="ltr">
                      {r.patient_phone}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{formatDate(r.appointment_date)}</div>
                      <div className="text-muted-foreground font-mono" dir="ltr">
                        {r.appointment_time?.slice(0, 5)}
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      <div>{r.specialties?.name_ar ?? "—"}</div>
                      <div className="text-muted-foreground">{r.doctors?.name_ar ?? "—"}</div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_META[r.status].cls}`}
                      >
                        {STATUS_META[r.status].label}
                      </span>
                    </td>
                    <td className="p-3 text-xs" onClick={(e) => e.stopPropagation()}>
                      {tr ? (
                        <div className="flex flex-col gap-1 items-start">
                          <Link
                            to="/admin/booking-trace"
                            search={{ correlation_id: tr.correlation_id }}
                            className="font-mono text-[11px] text-primary hover:underline"
                            title={tr.correlation_id}
                            dir="ltr"
                          >
                            {tr.correlation_id.slice(0, 8)}…
                          </Link>
                          {tr.error_code && (
                            <span
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 border border-rose-500/20"
                              title="آخر رمز خطأ لوحظ خلال هذه المحاولة"
                            >
                              {tr.error_code}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}

              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <DetailDrawer
          row={selected}
          trace={traces[selected.id] ?? null}
          onClose={() => setSelected(null)}
          onChanged={() => {
            void refetch();
          }}
        />
      )}

    </div>
  );
}

function QueueMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

/* ============================ Detail drawer ============================ */

type ActionKey = "confirm" | "cancel" | "complete" | "no_show";

const ACTIONS: Record<
  ActionKey,
  {
    label: string;
    target: Status;
    icon: typeof Check;
    cls: string;
    requireReason: boolean;
    // Which current statuses this action is valid from (UI hint; server also enforces).
    from: Status[];
  }
> = {
  confirm: {
    label: "تأكيد",
    target: "confirmed",
    icon: Check,
    cls: "bg-emerald-600 text-white hover:bg-emerald-700",
    requireReason: false,
    from: ["new"],
  },
  complete: {
    label: "إتمام",
    target: "completed",
    icon: Check,
    cls: "bg-primary text-primary-foreground hover:bg-primary/90",
    requireReason: false,
    from: ["confirmed", "new"],
  },
  no_show: {
    label: "لم يحضر",
    target: "no_show",
    icon: UserX,
    cls: "bg-amber-500 text-white hover:bg-amber-600",
    requireReason: true,
    from: ["confirmed", "new"],
  },
  cancel: {
    label: "إلغاء",
    target: "cancelled",
    icon: XCircle,
    cls: "bg-rose-600 text-white hover:bg-rose-700",
    requireReason: true,
    from: ["new", "confirmed"],
  },
};

function DetailDrawer({
  row,
  onClose,
  onChanged,
}: {
  row: Row;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ref = shortRef(row.id);
  const updateStatus = useServerFn(updateAppointmentStatus);
  const qc = useQueryClient();
  const [pendingAction, setPendingAction] = useState<ActionKey | null>(null);
  const [reasonText, setReasonText] = useState("");

  const mutation = useMutation({
    mutationFn: async (input: { action: ActionKey; reason: string | null }) => {
      const meta = ACTIONS[input.action];
      return updateStatus({
        data: {
          id: row.id,
          status: meta.target,
          reason: input.reason,
        },
      });
    },
    onSuccess: (_res, vars) => {
      toast.success(`تم تحديث الحجز إلى: ${STATUS_META[ACTIONS[vars.action].target].label}`);
      setPendingAction(null);
      setReasonText("");
      qc.invalidateQueries({ queryKey: ["admin", "appointments-queue"] });
      onChanged();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "تعذّر التحديث";
      toast.error(msg);
    },
  });

  const runAction = (key: ActionKey) => {
    const meta = ACTIONS[key];
    if (meta.requireReason) {
      setPendingAction(key);
      setReasonText("");
    } else {
      mutation.mutate({ action: key, reason: null });
    }
  };

  const submitPending = () => {
    if (!pendingAction) return;
    const reason = reasonText.trim();
    if (reason.length < 3) {
      toast.error("يرجى كتابة سبب واضح (٣ أحرف على الأقل).");
      return;
    }
    mutation.mutate({ action: pendingAction, reason });
  };

  const availableActions = (Object.keys(ACTIONS) as ActionKey[]).filter((k) =>
    ACTIONS[k].from.includes(row.status),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl bg-background border border-border shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">تفاصيل الحجز</h2>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-accent/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">رقم الطلب</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(ref).then(
                    () => toast.success("تم نسخ رقم الطلب"),
                    () => toast.error("تعذّر النسخ"),
                  );
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Copy className="h-3 w-3" /> نسخ
              </button>
            </div>
            <div className="mt-1 text-xl font-mono font-black tracking-wider">{ref}</div>
            <div className="mt-2">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_META[row.status].cls}`}
              >
                {STATUS_META[row.status].label}
              </span>
            </div>
          </div>

          <dl className="grid gap-2 text-sm">
            <InfoRow label="المريض" icon={<User className="h-4 w-4" />} value={row.patient_name} />
            <InfoRow
              label="الجوال"
              icon={<Phone className="h-4 w-4" />}
              value={row.patient_phone}
              mono
            />
            <InfoRow
              label="الموعد"
              icon={<CalendarDays className="h-4 w-4" />}
              value={`${formatDate(row.appointment_date)} — ${row.appointment_time?.slice(0, 5)}`}
            />
            <InfoRow label="التخصص" value={row.specialties?.name_ar ?? "—"} />
            <InfoRow label="الطبيب" value={row.doctors?.name_ar ?? "—"} />
          </dl>

          {row.reason && (
            <div>
              <div className="text-xs font-semibold mb-1">سبب الزيارة / التصنيف</div>
              <p className="rounded-md bg-muted/60 p-3 text-sm whitespace-pre-wrap">{row.reason}</p>
            </div>
          )}
          {row.notes && (
            <div>
              <div className="text-xs font-semibold mb-1">ملاحظات المسؤول</div>
              <p className="rounded-md bg-muted/60 p-3 text-sm whitespace-pre-wrap">{row.notes}</p>
            </div>
          )}

          {/* Reason capture for destructive transitions. */}
          {pendingAction && ACTIONS[pendingAction].requireReason && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
              <label className="text-xs font-semibold">
                سبب {ACTIONS[pendingAction].label} (مطلوب للسجل)
              </label>
              <textarea
                autoFocus
                rows={3}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="اكتب سبباً واضحاً…"
                className="w-full rounded-md border border-input bg-background p-2 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction(null);
                    setReasonText("");
                  }}
                  className="rounded-md border border-input px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={submitPending}
                  disabled={mutation.isPending}
                  className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${ACTIONS[pendingAction].cls} disabled:opacity-60`}
                >
                  {mutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  تأكيد
                </button>
              </div>
            </div>
          )}

          {/* Action row — only shown when NOT in reason capture mode. */}
          {!pendingAction && (
            <div className="space-y-2 pt-1">
              {availableActions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableActions.map((key) => {
                    const meta = ACTIONS[key];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => runAction(key)}
                        disabled={mutation.isPending}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold ${meta.cls} disabled:opacity-60`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Link
                  to="/lookup"
                  search={{ ref, phone: row.patient_phone, action: "reschedule" }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  تعديل الموعد
                </Link>
                <a
                  href={`tel:${row.patient_phone}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-xs font-semibold hover:bg-muted"
                >
                  <Phone className="h-3.5 w-3.5" />
                  اتصال
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-1.5 last:border-none">
      <dt className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd
        className={`text-sm font-semibold text-end ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
