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
  Pill,
  Plus,
  Trash2,
  Printer,
  FlaskConical,
  Scan,
} from "lucide-react";
import {
  listMyTodayAppointments,
  startVisit,
  saveVisit,
  holdFollowUp,
  listPatientHistory,
  listVisitPrescriptions,
  addPrescription,
  cancelPrescription,
  listVisitLabOrders,
  addLabOrder,
  cancelLabOrder,
  listVisitRadOrders,
  addRadOrder,
  cancelRadOrder,
} from "@/lib/admin/doctor-today.functions";
import { SOAP_TEMPLATES, getTemplate } from "@/lib/clinical/soap-templates";

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
  const [templateId, setTemplateId] = useState<string>(initial?.templateId ?? "");
  const [templateNote, setTemplateNote] = useState<string>("");

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
    const snapshot = { chief, s, o, a, p, followUp, templateId };
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

  const allSoapEmpty = !s.trim() && !o.trim() && !a.trim() && !p.trim();

  function applyTemplate(id: string, mode: "fill-empty" | "replace") {
    const tpl = getTemplate(id);
    if (!tpl) return;
    setTemplateId(id);
    const apply = (cur: string, next: string) =>
      mode === "replace" ? next : cur.trim() ? cur : next;
    setS((v) => apply(v, tpl.subjective));
    setO((v) => apply(v, tpl.objective));
    setA((v) => apply(v, tpl.assessment));
    setP((v) => apply(v, tpl.plan));
    setTemplateNote(
      mode === "replace"
        ? `تم استبدال حقول SOAP بقالب «${tpl.label_ar}».`
        : `تم تطبيق قالب «${tpl.label_ar}» على الحقول الفارغة فقط.`,
    );
    window.setTimeout(() => setTemplateNote(""), 4000);
  }

  return (
    <DialogShell title={`زيارة — ${appt.patient_name ?? "المريض"}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded-md border bg-muted/30 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium">قالب سريع للكشف</span>
            {templateId ? (
              <span className="text-[11px] text-muted-foreground">
                القالب الحالي: {getTemplate(templateId)?.label_ar}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SOAP_TEMPLATES.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    applyTemplate(t.id, allSoapEmpty ? "fill-empty" : "fill-empty")
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-background"
                  }`}
                  title={t.label_en}
                >
                  {t.label_ar}
                </button>
              );
            })}
            {templateId ? (
              <button
                type="button"
                onClick={() => applyTemplate(templateId, "replace")}
                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300"
                title="استبدال الحقول بمحتوى القالب"
              >
                استبدال بالقالب الحالي
              </button>
            ) : null}
          </div>
          {templateNote ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{templateNote}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-end text-xs" aria-live="polite">
          <AutosaveIndicator state={autoState} savedAt={savedAt} />
        </div>
        <FieldArea label="الشكوى الرئيسية" value={chief} onChange={setChief} rows={2} max={500} />
        <FieldArea label="Subjective — الأعراض من المريض" value={s} onChange={setS} rows={3} max={4000} />
        <FieldArea label="Objective — الفحص السريري" value={o} onChange={setO} rows={3} max={4000} />
        <FieldArea label="Assessment — التشخيص" value={a} onChange={setA} rows={3} max={4000} />
        <FieldArea label="Plan — الخطة العلاجية" value={p} onChange={setP} rows={3} max={4000} />

        <RxSection appt={appt} />
        <OrdersSection appt={appt} />

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

/* ------------------------------ Rx section --------------------------- */

type RxRow = {
  id: string;
  medication: string;
  dosage: string | null;
  instructions: string | null;
  start_date: string | null;
  end_date: string | null;
  refills_remaining: number;
  status: string;
  notes: string | null;
  created_at: string;
};

function RxSection({ appt }: { appt: ApptRow }) {
  const listFn = useServerFn(listVisitPrescriptions);
  const addFn = useServerFn(addPrescription);
  const cancelFn = useServerFn(cancelPrescription);
  const qc = useQueryClient();
  const qk = ["doctor", "rx", appt.id];

  const query = useQuery({
    queryKey: qk,
    queryFn: () => listFn({ data: { appointment_id: appt.id } }),
    enabled: !!appt.patient_id,
    staleTime: 15_000,
  });
  const rows: RxRow[] = (query.data?.rows as any) ?? [];

  const [showForm, setShowForm] = useState(false);
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>("");
  const [refills, setRefills] = useState<number>(0);

  const reset = () => {
    setMedication("");
    setDosage("");
    setInstructions("");
    setEndDate("");
    setRefills(0);
    setShowForm(false);
  };

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          appointment_id: appt.id,
          medication: medication.trim(),
          dosage: dosage.trim() || null,
          instructions: instructions.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          refills_remaining: Number.isFinite(refills) ? refills : 0,
        },
      }),
    onSuccess: () => {
      reset();
      qc.invalidateQueries({ queryKey: qk });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { prescription_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return (
    <section className="rounded-md border bg-muted/30 p-2.5">
      <header className="mb-2 flex items-center gap-2">
        <Pill className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold">الوصفات الطبية</h3>
        <span className="text-[11px] text-muted-foreground">({rows.length})</span>
        <div className="ms-auto flex gap-1">
          {rows.some((r) => r.status === "active") ? (
            <button
              type="button"
              onClick={() => printRxSheet(appt, rows.filter((r) => r.status === "active"))}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-background"
            >
              <Printer className="h-3 w-3" />
              طباعة
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-background"
          >
            <Plus className="h-3 w-3" />
            {showForm ? "إخفاء" : "إضافة"}
          </button>
        </div>
      </header>

      {!appt.patient_id ? (
        <p className="text-[11px] text-muted-foreground">لا يمكن إصدار وصفات قبل ربط المريض بالحجز.</p>
      ) : null}

      {showForm && appt.patient_id ? (
        <div className="mb-2 space-y-2 rounded-md border bg-background p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[11px]">الدواء *</span>
              <input
                value={medication}
                onChange={(e) => setMedication(e.target.value)}
                maxLength={200}
                placeholder="مثال: Paracetamol 500mg"
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px]">الجرعة</span>
              <input
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                maxLength={120}
                placeholder="1 قرص كل 8 ساعات"
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px]">تاريخ البدء</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px]">تاريخ الانتهاء</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px]">التعبئات المتبقية</span>
              <input
                type="number"
                min={0}
                max={12}
                value={refills}
                onChange={(e) => setRefills(parseInt(e.target.value, 10) || 0)}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[11px]">تعليمات للمريض</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={1000}
              rows={2}
              className="w-full rounded-md border bg-background p-2 text-xs"
            />
          </label>
          {add.isError ? (
            <p className="text-[11px] text-destructive">{(add.error as Error).message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={!medication.trim() || add.isPending}
              onClick={() => add.mutate()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
            >
              {add.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              حفظ الوصفة
            </button>
          </div>
        </div>
      ) : null}

      {query.isLoading ? (
        <p className="text-[11px] text-muted-foreground">جاري التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          لا توجد وصفات لهذا المريض من قِبَلك.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((rx) => (
            <li
              key={rx.id}
              className={`rounded-md border p-2 text-xs ${
                rx.status === "cancelled" ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="truncate">{rx.medication}</strong>
                    {rx.dosage ? (
                      <span className="text-muted-foreground">— {rx.dosage}</span>
                    ) : null}
                    <span
                      className={`rounded px-1 text-[10px] ${
                        rx.status === "active"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : rx.status === "cancelled"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {rx.status === "active"
                        ? "نشط"
                        : rx.status === "cancelled"
                          ? "ملغي"
                          : "منجز"}
                    </span>
                  </div>
                  {rx.instructions ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {rx.instructions}
                    </p>
                  ) : null}
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {rx.start_date ? <span>من {rx.start_date}</span> : null}
                    {rx.end_date ? <span>إلى {rx.end_date}</span> : null}
                    {rx.refills_remaining > 0 ? (
                      <span>تعبئات: {rx.refills_remaining}</span>
                    ) : null}
                  </div>
                </div>
                {rx.status === "active" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("إلغاء هذه الوصفة؟")) cancel.mutate(rx.id);
                    }}
                    disabled={cancel.isPending}
                    className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                    aria-label="إلغاء الوصفة"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function printRxSheet(appt: ApptRow, rows: RxRow[]) {
  const today = new Date().toLocaleDateString("ar-SA");
  const branch = appt.branch?.name_ar ?? appt.branch?.name_en ?? "";
  const items = rows
    .map(
      (r, i) => `
        <li>
          <div class="med">${i + 1}. ${escapeHtml(r.medication)}${
            r.dosage ? ` — <span class="muted">${escapeHtml(r.dosage)}</span>` : ""
          }</div>
          ${r.instructions ? `<div class="ins">${escapeHtml(r.instructions)}</div>` : ""}
          <div class="meta">
            ${r.start_date ? `من ${r.start_date}` : ""}
            ${r.end_date ? ` — إلى ${r.end_date}` : ""}
            ${r.refills_remaining > 0 ? ` — تعبئات: ${r.refills_remaining}` : ""}
          </div>
        </li>`,
    )
    .join("");
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>وصفة طبية — ${escapeHtml(appt.patient_name ?? "")}</title>
<style>
  body{font-family:-apple-system,'Segoe UI',Tahoma,sans-serif;padding:24px;color:#111;}
  h1{margin:0 0 4px;font-size:18px}
  .sub{color:#555;font-size:12px;margin-bottom:16px}
  .patient{border:1px solid #ddd;padding:10px;border-radius:6px;font-size:13px;margin-bottom:14px}
  ol{padding-inline-start:0;list-style:none}
  li{border-bottom:1px dashed #ccc;padding:8px 0}
  .med{font-weight:600;font-size:14px}
  .ins{font-size:12px;margin-top:2px}
  .meta{font-size:11px;color:#666;margin-top:2px}
  .muted{color:#666;font-weight:400}
  .sig{margin-top:32px;display:flex;justify-content:space-between;font-size:12px;color:#333}
  @media print{.no-print{display:none}}
</style></head><body>
  <h1>مجمع باعشن الطبي</h1>
  <div class="sub">${escapeHtml(branch)} · وصفة طبية · ${today}</div>
  <div class="patient">
    <div><strong>المريض:</strong> ${escapeHtml(appt.patient_name ?? "—")}</div>
    <div><strong>الجوال:</strong> ${escapeHtml(appt.patient_phone ?? "—")}</div>
    <div><strong>المرجع:</strong> ${escapeHtml(appt.reference_number ?? "—")}</div>
  </div>
  <ol>${items}</ol>
  <div class="sig"><span>توقيع الطبيب: ______________</span><span>الختم</span></div>
  <script>window.onload=()=>window.print();</script>
</body></html>`;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function printOrderTicket(
  appt: ApptRow,
  kind: "lab" | "rad",
  order: {
    title: string;
    subtitle?: string | null;
    notes?: string | null;
    status?: string | null;
    released?: boolean;
    date?: string | null;
    id: string;
  },
) {
  const today = new Date().toLocaleString("ar-SA");
  const branch = appt.branch?.name_ar ?? appt.branch?.name_en ?? "";
  const kindLabel = kind === "lab" ? "طلب مختبر / Lab Order" : "طلب أشعة / Radiology Order";
  const statusLabel = order.released
    ? "صادر"
    : order.status === "cancelled"
      ? "ملغي"
      : order.status === "in_progress"
        ? "قيد التنفيذ"
        : "قيد الانتظار";
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${escapeHtml(kindLabel)} — ${escapeHtml(appt.patient_name ?? "")}</title>
<style>
  @page { size: A5; margin: 12mm; }
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',Tahoma,sans-serif;color:#111;margin:0;padding:16px;font-size:12px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
  .brand{font-size:16px;font-weight:700}
  .kind{background:#111;color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .sub{color:#555;font-size:11px;margin-top:2px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;border:1px solid #ccc;border-radius:6px;padding:10px;margin-bottom:12px}
  .grid div{font-size:11px}
  .grid strong{display:block;color:#555;font-weight:500;font-size:10px;margin-bottom:2px}
  .order{border:1px solid #111;border-radius:6px;padding:12px;margin-bottom:12px}
  .order h2{margin:0 0 6px;font-size:14px}
  .order .st{display:inline-block;background:#eee;padding:2px 8px;border-radius:10px;font-size:10px;margin-bottom:6px}
  .notes{border-top:1px dashed #ccc;margin-top:8px;padding-top:8px;font-size:11px;white-space:pre-wrap}
  .sig{margin-top:24px;display:flex;justify-content:space-between;font-size:11px;color:#333}
  .foot{margin-top:14px;text-align:center;color:#888;font-size:10px}
  .ref{font-family:monospace;font-size:10px;color:#666}
  @media print { .no-print{display:none} body{padding:0} }
</style></head><body>
  <div class="head">
    <div>
      <div class="brand">مجمع باعشن الطبي</div>
      <div class="sub">${escapeHtml(branch)} · ${today}</div>
    </div>
    <div class="kind">${escapeHtml(kindLabel)}</div>
  </div>
  <div class="grid">
    <div><strong>المريض</strong>${escapeHtml(appt.patient_name ?? "—")}</div>
    <div><strong>الجوال</strong>${escapeHtml(appt.patient_phone ?? "—")}</div>
    <div><strong>مرجع الزيارة</strong>${escapeHtml(appt.reference_number ?? "—")}</div>
    <div><strong>الفرع</strong>${escapeHtml(branch || "—")}</div>

  </div>
  <div class="order">
    <span class="st">${escapeHtml(statusLabel)}</span>
    <h2>${escapeHtml(order.title)}</h2>
    ${order.subtitle ? `<div class="sub">${escapeHtml(order.subtitle)}</div>` : ""}
    ${order.notes ? `<div class="notes">${escapeHtml(order.notes)}</div>` : ""}
    <div class="ref" style="margin-top:8px">Order ID: ${escapeHtml(order.id)}${order.date ? ` · ${escapeHtml(order.date)}` : ""}</div>
  </div>
  <div class="sig"><span>توقيع الطبيب: ______________</span><span>ختم المنشأة</span></div>
  <div class="foot">تُقدَّم هذه التذكرة في قسم ${kind === "lab" ? "المختبر" : "الأشعة"} لإتمام الإجراء.</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),80);</script>
</body></html>`;
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}


/* ---------------------------- Orders (Lab/Rad) --------------------------- */

type LabOrderRow = {
  id: string;
  title: string | null;
  test_type: string | null;
  summary: string | null;
  status: string | null;
  report_date: string | null;
  released_at: string | null;
  created_at: string;
};
type RadOrderRow = {
  id: string;
  modality: string | null;
  body_part: string | null;
  findings: string | null;
  status: string | null;
  report_date: string | null;
  released_at: string | null;
  created_at: string;
};

const LAB_CATALOG = [
  "CBC — تعداد الدم الكامل",
  "Fasting Blood Sugar",
  "HbA1c",
  "Lipid Profile",
  "Liver Function (LFT)",
  "Kidney Function (KFT)",
  "TSH",
  "Vitamin D",
  "Urinalysis",
  "CRP",
];
const RAD_CATALOG = [
  "X-Ray — أشعة سينية",
  "Ultrasound — موجات صوتية",
  "CT — مقطعية",
  "MRI — رنين مغناطيسي",
  "Mammography",
  "DEXA — كثافة العظام",
];

function OrdersSection({ appt }: { appt: ApptRow }) {
  const [tab, setTab] = useState<"lab" | "rad">("lab");
  return (
    <section className="rounded-md border bg-muted/30 p-2.5">
      <header className="mb-2 flex items-center gap-2">
        {tab === "lab" ? (
          <FlaskConical className="h-4 w-4 text-primary" />
        ) : (
          <Scan className="h-4 w-4 text-primary" />
        )}
        <h3 className="text-xs font-semibold">طلبات المختبر والأشعة</h3>
        <div className="ms-auto inline-flex rounded-md border bg-background p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setTab("lab")}
            className={`rounded px-2 py-0.5 ${tab === "lab" ? "bg-primary text-primary-foreground" : ""}`}
          >
            مختبر
          </button>
          <button
            type="button"
            onClick={() => setTab("rad")}
            className={`rounded px-2 py-0.5 ${tab === "rad" ? "bg-primary text-primary-foreground" : ""}`}
          >
            أشعة
          </button>
        </div>
      </header>

      {!appt.patient_id ? (
        <p className="text-[11px] text-muted-foreground">
          لا يمكن إصدار طلبات قبل ربط المريض بالحجز.
        </p>
      ) : tab === "lab" ? (
        <LabOrdersPanel appt={appt} />
      ) : (
        <RadOrdersPanel appt={appt} />
      )}
    </section>
  );
}

function LabOrdersPanel({ appt }: { appt: ApptRow }) {
  const listFn = useServerFn(listVisitLabOrders);
  const addFn = useServerFn(addLabOrder);
  const cancelFn = useServerFn(cancelLabOrder);
  const qc = useQueryClient();
  const qk = ["doctor", "lab-orders", appt.id];

  const query = useQuery({
    queryKey: qk,
    queryFn: () => listFn({ data: { appointment_id: appt.id } }),
    enabled: !!appt.patient_id,
    staleTime: 15_000,
  });
  const rows: LabOrderRow[] = (query.data?.rows as any) ?? [];

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [testType, setTestType] = useState("");
  const [summary, setSummary] = useState("");

  const reset = () => {
    setTitle("");
    setTestType("");
    setSummary("");
    setShowForm(false);
  };
  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          appointment_id: appt.id,
          title: title.trim(),
          test_type: testType.trim() || null,
          summary: summary.trim() || null,
        },
      }),
    onSuccess: () => {
      reset();
      qc.invalidateQueries({ queryKey: qk });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {query.isLoading ? "جاري التحميل…" : `${rows.length} طلب`}
        </span>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted"
        >
          <Plus className="h-3 w-3" />
          {showForm ? "إخفاء" : "طلب فحص"}
        </button>
      </div>
      {showForm ? (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <label className="block space-y-1">
            <span className="text-[11px]">اسم الفحص *</span>
            <input
              list="lab-catalog"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="اختر من القائمة أو اكتب"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
            <datalist id="lab-catalog">
              {LAB_CATALOG.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px]">النوع/القسم</span>
            <input
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              maxLength={120}
              placeholder="مثال: Hematology"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px]">ملاحظات سريرية</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full rounded-md border bg-background p-2 text-xs"
            />
          </label>
          {add.isError ? (
            <p className="text-[11px] text-destructive">{(add.error as Error).message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={!title.trim() || add.isPending}
              onClick={() => add.mutate()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
            >
              {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              حفظ الطلب
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 && !query.isLoading ? (
        <p className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          لا توجد طلبات مختبر لهذا المريض من قِبَلك.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-md border p-2 text-xs ${r.status === "cancelled" ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="truncate">{r.title ?? "—"}</strong>
                    {r.test_type ? (
                      <span className="text-muted-foreground">— {r.test_type}</span>
                    ) : null}
                    <OrderStatusPill status={r.status} released={!!r.released_at} />
                  </div>
                  {r.summary ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {r.summary}
                    </p>
                  ) : null}
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {r.report_date ?? new Date(r.created_at).toISOString().slice(0, 10)}
                  </div>
                </div>
                {r.status !== "cancelled" && !r.released_at ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("إلغاء هذا الطلب؟")) cancel.mutate(r.id);
                    }}
                    disabled={cancel.isPending}
                    className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                    aria-label="إلغاء الطلب"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RadOrdersPanel({ appt }: { appt: ApptRow }) {
  const listFn = useServerFn(listVisitRadOrders);
  const addFn = useServerFn(addRadOrder);
  const cancelFn = useServerFn(cancelRadOrder);
  const qc = useQueryClient();
  const qk = ["doctor", "rad-orders", appt.id];

  const query = useQuery({
    queryKey: qk,
    queryFn: () => listFn({ data: { appointment_id: appt.id } }),
    enabled: !!appt.patient_id,
    staleTime: 15_000,
  });
  const rows: RadOrderRow[] = (query.data?.rows as any) ?? [];

  const [showForm, setShowForm] = useState(false);
  const [modality, setModality] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [findings, setFindings] = useState("");

  const reset = () => {
    setModality("");
    setBodyPart("");
    setFindings("");
    setShowForm(false);
  };
  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          appointment_id: appt.id,
          modality: modality.trim(),
          body_part: bodyPart.trim() || null,
          findings: findings.trim() || null,
        },
      }),
    onSuccess: () => {
      reset();
      qc.invalidateQueries({ queryKey: qk });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {query.isLoading ? "جاري التحميل…" : `${rows.length} طلب`}
        </span>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-muted"
        >
          <Plus className="h-3 w-3" />
          {showForm ? "إخفاء" : "طلب أشعة"}
        </button>
      </div>
      {showForm ? (
        <div className="space-y-2 rounded-md border bg-background p-2">
          <label className="block space-y-1">
            <span className="text-[11px]">نوع الأشعة *</span>
            <input
              list="rad-catalog"
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              maxLength={80}
              placeholder="اختر من القائمة أو اكتب"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
            <datalist id="rad-catalog">
              {RAD_CATALOG.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px]">المنطقة</span>
            <input
              value={bodyPart}
              onChange={(e) => setBodyPart(e.target.value)}
              maxLength={120}
              placeholder="مثال: الصدر، الركبة اليمنى"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px]">ملاحظات سريرية</span>
            <textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full rounded-md border bg-background p-2 text-xs"
            />
          </label>
          {add.isError ? (
            <p className="text-[11px] text-destructive">{(add.error as Error).message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md border px-2 py-1 text-[11px] hover:bg-muted"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={!modality.trim() || add.isPending}
              onClick={() => add.mutate()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
            >
              {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              حفظ الطلب
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 && !query.isLoading ? (
        <p className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
          لا توجد طلبات أشعة لهذا المريض من قِبَلك.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`rounded-md border p-2 text-xs ${r.status === "cancelled" ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="truncate">{r.modality ?? "—"}</strong>
                    {r.body_part ? (
                      <span className="text-muted-foreground">— {r.body_part}</span>
                    ) : null}
                    <OrderStatusPill status={r.status} released={!!r.released_at} />
                  </div>
                  {r.findings ? (
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {r.findings}
                    </p>
                  ) : null}
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {r.report_date ?? new Date(r.created_at).toISOString().slice(0, 10)}
                  </div>
                </div>
                {r.status !== "cancelled" && !r.released_at ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("إلغاء هذا الطلب؟")) cancel.mutate(r.id);
                    }}
                    disabled={cancel.isPending}
                    className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                    aria-label="إلغاء الطلب"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderStatusPill({ status, released }: { status: string | null; released: boolean }) {
  const cls = released
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : status === "cancelled"
      ? "bg-destructive/15 text-destructive"
      : status === "in_progress"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "bg-muted text-muted-foreground";
  const label = released
    ? "صادر"
    : status === "cancelled"
      ? "ملغي"
      : status === "in_progress"
        ? "قيد التنفيذ"
        : "قيد الانتظار";
  return <span className={`rounded px-1 text-[10px] ${cls}`}>{label}</span>;
}
