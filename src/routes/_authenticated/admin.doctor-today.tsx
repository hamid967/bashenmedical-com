/**
 * Batch A2 — Doctor Console (`/admin/doctor-today`)
 *
 * Signed-in doctor's day: list today's appointments, start a visit, save the
 * SOAP note, finalize the appointment, and hold a follow-up slot. Data is
 * always scoped to the caller's own `doctor_id` on the server.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Stethoscope,
  Play,
  Save,
  CheckCircle2,
  CalendarPlus,
  Loader2,
  X,
} from "lucide-react";


import {
  listMyTodayAppointments,
  startVisit,
  saveVisit,
  holdFollowUp,
} from "@/lib/admin/doctor-today.functions";

export const Route = createFileRoute("/_authenticated/admin/doctor-today")({
  head: () => ({
    meta: [
      { title: "شاشة الطبيب — اليوم | باعشن الطبي" },
      { name: "description", content: "قائمة مواعيد اليوم للطبيب، بدء الكشف، توثيق الزيارة، وحجز متابعة." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DoctorTodayPage,
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

function DoctorTodayPage() {
  const listFn = useServerFn(listMyTodayAppointments);
  const query = useQuery({
    queryKey: ["admin", "doctor-today"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });

  const [openVisit, setOpenVisit] = useState<{ appt: ApptRow; visit_id: string } | null>(null);
  const [openFollowUp, setOpenFollowUp] = useState<ApptRow | null>(null);

  return (
    <AdminShellV2 title="شاشة الطبيب — اليوم" description="قائمة مواعيدك اليوم مع تدفق الكشف والزيارات.">
      <div className="space-y-4">
        <header className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">مواعيدي اليوم</h1>
          <span className="text-xs text-muted-foreground">
            {query.data ? `${query.data.rows.length} حجز` : ""}
          </span>
        </header>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">جاري التحميل…</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            تعذّر التحميل: {(query.error as Error).message}
          </p>
        ) : (query.data?.rows.length ?? 0) === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
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
                  <th className="p-2 text-start">الحالة</th>
                  <th className="p-2 text-start">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {query.data!.rows.map((r) => (
                  <DoctorRow
                    key={r.id}
                    row={r as ApptRow}
                    onStarted={(visit_id) => setOpenVisit({ appt: r as ApptRow, visit_id })}
                    onFollowUp={() => setOpenFollowUp(r as ApptRow)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    </AdminShellV2>
  );
}

function DoctorRow({
  row,
  onStarted,
  onFollowUp,
}: {
  row: ApptRow;
  onStarted: (visit_id: string) => void;
  onFollowUp: () => void;
}) {
  const startFn = useServerFn(startVisit);
  const qc = useQueryClient();
  const start = useMutation({
    mutationFn: () => startFn({ data: { appointment_id: row.id } }),
    onSuccess: (r: any) => {
      onStarted(r.visit_id);
      qc.invalidateQueries({ queryKey: ["admin", "doctor-today"] });
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
      <td className="p-2">
        <StatusBadge status={row.status} />
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          {canStart ? (
            <ActionBtn
              onClick={() => start.mutate()}
              icon={start.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
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
              variant="default"
              disabled={start.isPending}
            />
          ) : null}
          {!completed ? (
            <ActionBtn
              onClick={onFollowUp}
              icon={<CalendarPlus className="h-3 w-3" />}
              label="متابعة"
              variant="default"
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
  const [chief, setChief] = useState(appt.chief_complaint ?? "");
  const [s, setS] = useState("");
  const [o, setO] = useState("");
  const [a, setA] = useState("");
  const [p, setP] = useState("");
  const [followUp, setFollowUp] = useState("");

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
      qc.invalidateQueries({ queryKey: ["admin", "doctor-today"] });
      if (r.finalized) onClose();
    },
  });

  return (
    <DialogShell title={`زيارة — ${appt.patient_name ?? "المريض"}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <FieldArea label="الشكوى الرئيسية" value={chief} onChange={setChief} rows={2} max={500} />
        <FieldArea label="Subjective" value={s} onChange={setS} rows={3} max={4000} />
        <FieldArea label="Objective" value={o} onChange={setO} rows={3} max={4000} />
        <FieldArea label="Assessment" value={a} onChange={setA} rows={3} max={4000} />
        <FieldArea label="Plan" value={p} onChange={setP} rows={3} max={4000} />
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
            {mutate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ
          </button>
          <button
            type="button"
            disabled={mutate.isPending}
            onClick={() => mutate.mutate(true)}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {mutate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            إنهاء الكشف
          </button>
        </div>
      </div>
    </DialogShell>
  );
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
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs">إلى تاريخ</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs">ملاحظات</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} className="w-full rounded-md border bg-background p-2 text-sm" />
        </label>
        {mutate.isError ? (
          <p className="text-xs text-destructive">{(mutate.error as Error).message}</p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            إلغاء
          </button>
          <button
            type="button"
            disabled={mutate.isPending || !from || !to}
            onClick={() => mutate.mutate()}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {mutate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
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
    in_consultation: { label: "قيد الكشف", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    completed: { label: "منجز", cls: "bg-emerald-600/20 text-emerald-800 dark:text-emerald-200" },
    cancelled: { label: "ملغي", cls: "bg-destructive/15 text-destructive" },
    no_show: { label: "لم يحضر", cls: "bg-destructive/15 text-destructive" },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-muted text-foreground" };
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-xs ${cfg.cls}`}>{cfg.label}</span>;
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
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
