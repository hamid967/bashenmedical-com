/**
 * /doctor/workspace — the signed-in doctor's day.
 *
 * Lists today's appointments for the caller (server enforces doctor_id
 * ownership), and drives the SOAP visit workflow and follow-up hold.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Stethoscope,
  Play,
  Save,
  CheckCircle2,
  CalendarPlus,
  Loader2,
  X,
  RefreshCw,
  History,
} from "lucide-react";
import {
  listMyTodayAppointments,
  startVisit,
  saveVisit,
  holdFollowUp,
  listPatientHistory,
} from "@/lib/admin/doctor-today.functions";

export const Route = createFileRoute("/_authenticated/doctor/workspace")({
  head: () => ({
    meta: [
      { title: "مواعيد اليوم — شاشة الطبيب" },
      { name: "description", content: "قائمة مواعيد اليوم للطبيب وتوثيق الزيارات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DoctorWorkspacePage,
});

type ApptRow = {
  id: string;
  reference_number: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  status: string;
  chief_complaint: string | null;
  notes: string | null;
  branch: { id: string; name_ar: string | null; name_en: string | null } | null;
};

function DoctorWorkspacePage() {
  const listFn = useServerFn(listMyTodayAppointments);
  const query = useQuery({
    queryKey: ["doctor", "workspace", "today"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });

  const [openVisit, setOpenVisit] = useState<{ appt: ApptRow; visit_id: string } | null>(null);
  const [openFollowUp, setOpenFollowUp] = useState<ApptRow | null>(null);
  const [openHistory, setOpenHistory] = useState<ApptRow | null>(null);

  const rows: ApptRow[] = (query.data?.rows as unknown as ApptRow[]) ?? [];
  const counts = summarize(rows);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="إجمالي اليوم" value={rows.length} />
        <StatTile label="بالانتظار" value={counts.waiting} tone="warn" />
        <StatTile label="قيد الكشف" value={counts.inConsult} tone="ok" />
        <StatTile label="منجزة" value={counts.done} tone="muted" />
      </section>

      <div className="flex items-center gap-2">
        <Stethoscope className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">مواعيدي اليوم</h2>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="ms-auto inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">جاري التحميل…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">تعذّر التحميل: {(query.error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا توجد مواعيد لك اليوم.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 text-start">الوقت</th>
                <th className="p-2 text-start">المرجع</th>
                <th className="p-2 text-start">المريض</th>
                <th className="p-2 text-start">الشكوى</th>
                <th className="p-2 text-start">الحالة</th>
                <th className="p-2 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <DoctorRow
                  key={r.id}
                  row={r}
                  onStarted={(visit_id) => setOpenVisit({ appt: r, visit_id })}
                  onFollowUp={() => setOpenFollowUp(r)}
                  onHistory={() => setOpenHistory(r)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openVisit ? (
        <VisitDialog
          appt={openVisit.appt}
          visitId={openVisit.visit_id}
          onClose={() => setOpenVisit(null)}
        />
      ) : null}
      {openFollowUp ? (
        <FollowUpDialog appt={openFollowUp} onClose={() => setOpenFollowUp(null)} />
      ) : null}
      {openHistory ? (
        <HistoryDialog appt={openHistory} onClose={() => setOpenHistory(null)} />
      ) : null}
    </div>
  );
}

function summarize(rows: ApptRow[]) {
  let waiting = 0;
  let inConsult = 0;
  let done = 0;
  for (const r of rows) {
    if (r.status === "in_consultation") inConsult++;
    else if (r.status === "completed") done++;
    else if (["arrived", "checked_in", "waiting", "called", "confirmed", "new"].includes(r.status))
      waiting++;
  }
  return { waiting, inConsult, done };
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : tone === "muted"
          ? "border-muted-foreground/20 bg-muted/40 text-muted-foreground"
          : "border-primary/30 bg-primary/5 text-primary";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function DoctorRow({
  row,
  onStarted,
  onFollowUp,
  onHistory,
}: {
  row: ApptRow;
  onStarted: (visit_id: string) => void;
  onFollowUp: () => void;
  onHistory: () => void;
}) {
  const startFn = useServerFn(startVisit);
  const qc = useQueryClient();
  const start = useMutation({
    mutationFn: () => startFn({ data: { appointment_id: row.id } }),
    onSuccess: (r: any) => {
      onStarted(r.visit_id);
      qc.invalidateQueries({ queryKey: ["doctor", "workspace", "today"] });
    },
  });

  const canStart = ["arrived", "checked_in", "waiting", "called"].includes(row.status);
  const inConsult = row.status === "in_consultation";
  const completed = row.status === "completed";

  return (
    <tr className="border-t align-middle">
      <td className="p-2 font-mono">{(row.appointment_time ?? "").slice(0, 5)}</td>
      <td className="p-2 font-mono text-xs">{row.reference_number ?? "—"}</td>
      <td className="p-2">
        <div className="font-medium">{row.patient_name ?? "—"}</div>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {row.patient_phone ?? ""}
        </div>
      </td>
      <td className="max-w-[220px] p-2 text-xs text-muted-foreground">
        <div className="truncate" title={row.chief_complaint ?? ""}>
          {row.chief_complaint ?? "—"}
        </div>
      </td>
      <td className="p-2">
        <StatusBadge status={row.status} />
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          {canStart ? (
            <ActionBtn
              onClick={() => start.mutate()}
              icon={
                start.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )
              }
              label="بدء الكشف"
              variant="success"
              disabled={start.isPending}
            />
          ) : null}
          {inConsult ? (
            <ActionBtn
              onClick={() => start.mutate()}
              icon={<Play className="h-3 w-3" />}
              label="متابعة الكشف"
              disabled={start.isPending}
            />
          ) : null}
          {!completed ? (
            <ActionBtn
              onClick={onFollowUp}
              icon={<CalendarPlus className="h-3 w-3" />}
              label="متابعة"
            />
          ) : null}
          {row.patient_id ? (
            <ActionBtn
              onClick={onHistory}
              icon={<History className="h-3 w-3" />}
              label="السجل"
            />
          ) : null}
        </div>
        {start.isError ? (
          <p className="mt-1 text-xs text-destructive">{(start.error as Error).message}</p>
        ) : null}
      </td>
    </tr>
  );
}

/* --------------------------- Visit dialog --------------------------- */

function VisitDialog({
  appt,
  visitId,
  onClose,
}: {
  appt: ApptRow;
  visitId: string;
  onClose: () => void;
}) {
  const saveFn = useServerFn(saveVisit);
  const qc = useQueryClient();
  const draftKey = `doctor:visit-draft:${visitId}`;

  // Restore any locally-saved draft (from a prior session or a failed save)
  // so a page reload / crash doesn't lose the doctor's typing.
  const initial = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as Record<string, string>) : null;
    } catch {
      return null;
    }
  })();

  const [chief, setChief] = useState(initial?.chief ?? appt.chief_complaint ?? "");
  const [s, setS] = useState(initial?.s ?? "");
  const [o, setO] = useState(initial?.o ?? "");
  const [a, setA] = useState(initial?.a ?? "");
  const [p, setP] = useState(initial?.p ?? "");
  const [followUp, setFollowUp] = useState(initial?.followUp ?? "");

  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const skipFirstRef = useRef(true);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);

  const mutate = useMutation({
    mutationFn: (finalize: boolean) =>
      saveFn({
        data: {
          visit_id: visitId,
          appointment_id: appt.id,
          chief_complaint: chief.trim() || null,
          subjective: s.trim() || null,
          objective: o.trim() || null,
          assessment: a.trim() || null,
          plan: p.trim() || null,
          follow_up_date: followUp || null,
          finalize,
        },
      }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["doctor", "workspace", "today"] });
      if (r?.finalized) {
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
        onClose();
      }
    },
  });

  // Autosave (debounced) — writes silently to the server as finalize=false
  // and mirrors the current draft to localStorage as an offline safety net.
  useEffect(() => {
    if (skipFirstRef.current) {
      skipFirstRef.current = false;
      return;
    }
    const snapshot = { chief, s, o, a, p, followUp };
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(snapshot));
    } catch {
      /* ignore quota */
    }
    setAutoState("idle");
    const t = window.setTimeout(async () => {
      if (savingRef.current) {
        pendingRef.current = true;
        return;
      }
      const run = async () => {
        savingRef.current = true;
        setAutoState("saving");
        try {
          await saveFn({
            data: {
              visit_id: visitId,
              appointment_id: appt.id,
              chief_complaint: chief.trim() || null,
              subjective: s.trim() || null,
              objective: o.trim() || null,
              assessment: a.trim() || null,
              plan: p.trim() || null,
              follow_up_date: followUp || null,
              finalize: false,
            },
          });
          setAutoState("saved");
          setSavedAt(new Date());
          try {
            window.localStorage.removeItem(draftKey);
          } catch {
            /* ignore */
          }
        } catch {
          setAutoState("error");
        } finally {
          savingRef.current = false;
          if (pendingRef.current) {
            pendingRef.current = false;
            void run();
          }
        }
      };
      void run();
    }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chief, s, o, a, p, followUp]);

  return (
    <DialogShell title={`زيارة — ${appt.patient_name ?? "المريض"}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-end text-xs" aria-live="polite">
          <AutosaveIndicator state={autoState} savedAt={savedAt} />
        </div>
        <FieldArea label="الشكوى الرئيسية" value={chief} onChange={setChief} rows={2} max={500} />
        <FieldArea label="Subjective — الأعراض من المريض" value={s} onChange={setS} rows={3} max={4000} />
        <FieldArea label="Objective — الفحص السريري" value={o} onChange={setO} rows={3} max={4000} />
        <FieldArea label="Assessment — التشخيص" value={a} onChange={setA} rows={3} max={4000} />
        <FieldArea label="Plan — الخطة العلاجية" value={p} onChange={setP} rows={3} max={4000} />
        <label className="block space-y-1">
          <span className="text-xs">تاريخ المتابعة (اختياري)</span>
          <input
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          />
        </label>
        {mutate.isError ? (
          <p className="text-xs text-destructive">{(mutate.error as Error).message}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            إغلاق
          </button>
          <button
            type="button"
            disabled={mutate.isPending}
            onClick={() => mutate.mutate(false)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
          >
            {mutate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ
          </button>
          <button
            type="button"
            disabled={mutate.isPending}
            onClick={() => mutate.mutate(true)}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {mutate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            إنهاء الكشف
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

function AutosaveIndicator({
  state,
  savedAt,
}: {
  state: "idle" | "saving" | "saved" | "error";
  savedAt: Date | null;
}) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> جارٍ الحفظ التلقائي…
      </span>
    );
  if (state === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> تم الحفظ
        {savedAt ? ` ${savedAt.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </span>
    );
  if (state === "error")
    return (
      <span className="text-destructive">تعذّر الحفظ التلقائي — سيُعاد المحاولة عند التعديل</span>
    );
  return <span className="text-muted-foreground">التغييرات تُحفظ تلقائيًا</span>;
}

/* -------------------------- Follow-up dialog -------------------------- */

function FollowUpDialog({ appt, onClose }: { appt: ApptRow; onClose: () => void }) {
  const holdFn = useServerFn(holdFollowUp);
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeks = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(twoWeeks);
  const [notes, setNotes] = useState("");

  const mutate = useMutation({
    mutationFn: () =>
      holdFn({
        data: {
          appointment_id: appt.id,
          preferred_from: from,
          preferred_to: to,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: () => onClose(),
  });

  return (
    <DialogShell title="حجز متابعة" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          للمريض: <strong>{appt.patient_name ?? "—"}</strong>
        </p>
        <label className="block space-y-1">
          <span className="text-xs">من تاريخ</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs">إلى تاريخ</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs">ملاحظات</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
        </label>
        {mutate.isError ? (
          <p className="text-xs text-destructive">{(mutate.error as Error).message}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={mutate.isPending || !from || !to}
            onClick={() => mutate.mutate()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {mutate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="h-4 w-4" />
            )}
            تسجيل الطلب
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

/* ---------------------------- Primitives ---------------------------- */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new: { label: "جديد", cls: "bg-muted text-foreground" },
    confirmed: { label: "مؤكد", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
    arrived: { label: "حضر", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    checked_in: { label: "مسجّل", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    waiting: { label: "بالانتظار", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    called: { label: "نودي", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    in_consultation: {
      label: "قيد الكشف",
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    completed: { label: "منجز", cls: "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200" },
    cancelled: { label: "ملغي", cls: "bg-destructive/15 text-destructive" },
    no_show: { label: "لم يحضر", cls: "bg-destructive/15 text-destructive" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-muted text-foreground" };
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs ${cfg.cls}`}>{cfg.label}</span>
  );
}

function ActionBtn({
  onClick,
  icon,
  label,
  disabled,
  variant = "default",
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  variant?: "default" | "success";
}) {
  const tone =
    variant === "success"
      ? "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
      : "hover:bg-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-40 ${tone}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function FieldArea({
  label,
  value,
  onChange,
  rows,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  max: number;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={max}
        className="w-full rounded-md border bg-background p-2 text-sm"
      />
    </label>
  );
}

function DialogShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between border-b pb-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/* --------------------------- History dialog --------------------------- */

type HistoryAppt = {
  id: string;
  reference_number: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  status: string;
  chief_complaint: string | null;
  doctor: { id: string; name_ar: string | null; name_en: string | null } | null;
  branch: { id: string; name_ar: string | null; name_en: string | null } | null;
};

type HistoryVisit = {
  id: string;
  visit_date: string | null;
  chief_complaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  follow_up_date: string | null;
  appointment_id: string | null;
};

function HistoryDialog({ appt, onClose }: { appt: ApptRow; onClose: () => void }) {
  const historyFn = useServerFn(listPatientHistory);
  const enabled = !!appt.patient_id;
  const query = useQuery({
    queryKey: ["doctor", "patient-history", appt.patient_id],
    queryFn: () => historyFn({ data: { patient_id: appt.patient_id as string } }),
    enabled,
    staleTime: 30_000,
  });
  const [tab, setTab] = useState<"visits" | "appointments">("visits");
  const appointments: HistoryAppt[] = (query.data?.appointments as any) ?? [];
  const visits: HistoryVisit[] = (query.data?.visits as any) ?? [];

  return (
    <DialogShell title={`سجل المريض — ${appt.patient_name ?? "—"}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex gap-2 border-b">
          <TabBtn active={tab === "visits"} onClick={() => setTab("visits")}>
            الفحوصات ({visits.length})
          </TabBtn>
          <TabBtn active={tab === "appointments"} onClick={() => setTab("appointments")}>
            المواعيد السابقة ({appointments.length})
          </TabBtn>
        </div>

        {!enabled ? (
          <p className="text-xs text-muted-foreground">لا يوجد ملف مريض مرتبط.</p>
        ) : query.isLoading ? (
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> جاري التحميل…
          </p>
        ) : query.isError ? (
          <p className="text-xs text-destructive">
            تعذّر التحميل: {(query.error as Error).message}
          </p>
        ) : tab === "visits" ? (
          visits.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              لا توجد زيارات سابقة مسجّلة لك مع هذا المريض.
            </p>
          ) : (
            <ul className="space-y-2">
              {visits.map((v) => (
                <li key={v.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono">{v.visit_date ?? "—"}</span>
                    {v.follow_up_date ? (
                      <span className="text-muted-foreground">متابعة: {v.follow_up_date}</span>
                    ) : null}
                  </div>
                  {v.chief_complaint ? (
                    <p className="mt-1 text-xs">
                      <strong>الشكوى:</strong> {v.chief_complaint}
                    </p>
                  ) : null}
                  <SoapBlock label="S" text={v.subjective} />
                  <SoapBlock label="O" text={v.objective} />
                  <SoapBlock label="A" text={v.assessment} />
                  <SoapBlock label="P" text={v.plan} />
                </li>
              ))}
            </ul>
          )
        ) : appointments.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            لا توجد مواعيد سابقة.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-start">التاريخ</th>
                  <th className="p-2 text-start">المرجع</th>
                  <th className="p-2 text-start">الطبيب</th>
                  <th className="p-2 text-start">الفرع</th>
                  <th className="p-2 text-start">الشكوى</th>
                  <th className="p-2 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 font-mono">
                      {r.appointment_date ?? "—"}
                      {r.appointment_time ? ` ${r.appointment_time.slice(0, 5)}` : ""}
                    </td>
                    <td className="p-2 font-mono">{r.reference_number ?? "—"}</td>
                    <td className="p-2">{r.doctor?.name_ar ?? r.doctor?.name_en ?? "—"}</td>
                    <td className="p-2">{r.branch?.name_ar ?? r.branch?.name_en ?? "—"}</td>
                    <td className="max-w-[180px] p-2 text-muted-foreground">
                      <span className="line-clamp-2">{r.chief_complaint ?? "—"}</span>
                    </td>
                    <td className="p-2">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DialogShell>
  );
}

function SoapBlock({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-1 whitespace-pre-wrap text-xs">
      <strong className="text-muted-foreground">{label}:</strong> {text}
    </p>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-1.5 text-xs transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
