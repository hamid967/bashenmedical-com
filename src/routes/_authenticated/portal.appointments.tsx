import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CalendarDays, CalendarPlus, CheckCircle2, ChevronLeft,
  Clock, Filter, Loader2, LogIn, MapPin, Phone, Printer, RefreshCw, Repeat,
  Search, Stethoscope, User2, XCircle,
} from "lucide-react";
import {
  listMyAppointments,
  confirmMyAttendance,
  cancelMyAppointment,
  reschedulePatientAppointment,
  requestFollowUp,
  performSelfCheckIn,
} from "@/lib/portal/appointments.functions";

type Scope = "upcoming" | "past";
type ApptStatus =
  | "new"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "held"
  | "pending_verification"
  | "pending_payment"
  | "checked_in"
  | "in_progress";

const appointmentsQuery = (scope: Scope) =>
  queryOptions({
    queryKey: ["portal", "my-appointments", scope],
    queryFn: () => listMyAppointments({ data: { scope, limit: 100 } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_authenticated/portal/appointments")({
  loader: ({ context }) => context.queryClient.ensureQueryData(appointmentsQuery("upcoming")),
  head: () => ({
    meta: [
      { title: "مواعيدي | بوابة المريض" },
      { name: "description", content: "إدارة مواعيدك القادمة والسابقة في مجمع باعشن الطبي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyAppointmentsPage,
  errorComponent: ErrorState,
  notFoundComponent: () => null,
});

/* ------------------------------- helpers --------------------------------- */

const hhmm = (t: string) => String(t).slice(0, 5);
const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("ar-SA-u-nu-latn", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

function statusMeta(s: ApptStatus) {
  const m: Record<ApptStatus, { label: string; cls: string }> = {
    new: { label: "جديد", cls: "bg-teal-50 text-teal-700 border-teal-200" },
    confirmed: { label: "مؤكّد", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    completed: { label: "مكتمل", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    cancelled: { label: "ملغى", cls: "bg-red-50 text-red-700 border-red-200" },
    no_show: { label: "لم يحضر", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    held: { label: "محجوز مؤقتًا", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    pending_verification: { label: "بانتظار التحقق", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    pending_payment: { label: "بانتظار الدفع", cls: "bg-orange-50 text-orange-700 border-orange-200" },
    checked_in: { label: "تم الحضور", cls: "bg-cyan-50 text-cyan-700 border-cyan-200" },
    in_progress: { label: "قيد الكشف", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  };
  return m[s] ?? { label: s, cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

/* ------------------------------- page ------------------------------------ */

function MyAppointmentsPage() {
  const [scope, setScope] = useState<Scope>("upcoming");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApptStatus>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [reschedFor, setReschedFor] = useState<null | { id: string; date: string; time: string; doctor?: string | null }>(null);
  const [cancelFor, setCancelFor] = useState<null | { id: string; doctor?: string | null; date: string; time: string }>(null);
  const [followFor, setFollowFor] = useState<null | { id: string; doctor?: string | null }>(null);

  const q = useSuspenseQuery(appointmentsQuery(scope));
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["portal", "my-appointments"] });

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmMyAttendance({ data: { id } }),
    onSuccess: (r) => {
      invalidate();
      toast.success(r.alreadyConfirmed ? "الموعد مؤكّد مسبقًا" : "تم تأكيد الحضور");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (v: { id: string; reason?: string }) => cancelMyAppointment({ data: v }),
    onSuccess: () => { invalidate(); toast.success("تم إلغاء الموعد"); setCancelFor(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reschedMut = useMutation({
    mutationFn: (v: { id: string; date: string; time: string }) =>
      reschedulePatientAppointment({ data: v }),
    onSuccess: () => { invalidate(); toast.success("تمت إعادة الجدولة"); setReschedFor(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const followMut = useMutation({
    mutationFn: (v: { fromAppointmentId: string; preferredDate: string; preferredTime: string; reason?: string }) =>
      requestFollowUp({ data: v }),
    onSuccess: () => { invalidate(); toast.success("تم إنشاء طلب المتابعة"); setFollowFor(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const checkInMut = useMutation({
    mutationFn: (id: string) => performSelfCheckIn({ data: { id } }),
    onSuccess: (r) => {
      invalidate();
      const num = r.queue_number ? ` — رقمك في الدور: ${r.queue_number}` : "";
      toast.success((r.already ? "أنت مسجّل بالفعل" : "تم تسجيل حضورك") + num);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = q.data.items;
  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (dateFrom && a.appointment_date < dateFrom) return false;
      if (dateTo && a.appointment_date > dateTo) return false;
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const hay =
          `${a.reason ?? ""} ${a.doctor?.name_ar ?? ""} ${a.doctor?.name_en ?? ""} ${a.branch?.name_ar ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [items, statusFilter, search, dateFrom, dateTo]);

  const hasActiveFilters =
    !!search.trim() || statusFilter !== "all" || !!dateFrom || !!dateTo;
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const counts = useMemo(() => {
    const c: Record<ApptStatus, number> = {
      new: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0,
      held: 0, pending_verification: 0, pending_payment: 0, checked_in: 0, in_progress: 0,
    };
    items.forEach((a) => { c[a.status as ApptStatus] = (c[a.status as ApptStatus] ?? 0) + 1; });
    return c;
  }, [items]);

  return (
    <div dir="rtl" className="space-y-6 print:space-y-3">
      {/* Header */}
      <header className="flex flex-wrap items-start gap-3 print:hidden">
        <div className="h-11 w-11 rounded-2xl grid place-items-center bg-[color:var(--portal-gradient-soft)] text-[color:var(--portal-primary)]">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl font-bold text-[color:var(--portal-ink)]">مواعيدي</h1>
          <p className="text-sm text-[color:var(--portal-ink-2)]">
            تابع مواعيدك القادمة والسابقة، أكّد الحضور، أعِد الجدولة، أو اطلب متابعة.
          </p>
        </div>
        <Link
          to="/portal/book"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-white text-sm font-semibold shadow"
          style={{ background: "var(--portal-gradient)" }}
        >
          <CalendarPlus className="h-4 w-4" /> حجز موعد جديد
        </Link>
      </header>

      {/* Tabs + filters */}
      <div className="glass-card p-3 sm:p-4 flex flex-wrap items-center gap-3 print:hidden">
        <div className="inline-flex rounded-full bg-white border border-[color:var(--portal-border)] p-1">
          <TabBtn active={scope === "upcoming"} onClick={() => setScope("upcoming")}>
            القادمة
          </TabBtn>
          <TabBtn active={scope === "past"} onClick={() => setScope("past")}>
            السابقة
          </TabBtn>
        </div>

        <div className="flex-1 min-w-[180px] flex items-center gap-2 h-10 rounded-full bg-white border border-[color:var(--portal-border)] px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالطبيب، الفرع، أو سبب الزيارة..."
            className="bg-transparent outline-none text-sm flex-1"
          />
        </div>

        <label className="inline-flex items-center gap-2 h-10 rounded-full bg-white border border-[color:var(--portal-border)] px-3 text-sm">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            className="bg-transparent outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="فلترة بالحالة"
          >
            <option value="all">كل الحالات</option>
            <option value="new">جديد</option>
            <option value="confirmed">مؤكّد</option>
            <option value="completed">مكتمل</option>
            <option value="cancelled">ملغى</option>
            <option value="no_show">لم يحضر</option>
          </select>
        </label>

        <label className="inline-flex items-center gap-2 h-10 rounded-full bg-white border border-[color:var(--portal-border)] px-3 text-sm">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span className="text-[11px] text-[color:var(--portal-ink-3)]">من</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            max={dateTo || undefined}
            aria-label="من تاريخ"
            className="bg-transparent outline-none text-sm tabular-nums"
          />
        </label>

        <label className="inline-flex items-center gap-2 h-10 rounded-full bg-white border border-[color:var(--portal-border)] px-3 text-sm">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <span className="text-[11px] text-[color:var(--portal-ink-3)]">إلى</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || undefined}
            aria-label="إلى تاريخ"
            className="bg-transparent outline-none text-sm tabular-nums"
          />
        </label>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-full bg-white border border-[color:var(--portal-border)] text-xs font-semibold text-[color:var(--portal-ink-2)] hover:bg-slate-50"
            aria-label="مسح كل الفلاتر"
          >
            <XCircle className="h-3.5 w-3.5" /> مسح الفلاتر
          </button>
        )}

        <button
          onClick={() => q.refetch()}
          className="inline-grid place-items-center h-10 w-10 rounded-full bg-white border border-[color:var(--portal-border)] hover:bg-slate-50"
          aria-label="تحديث"
        >
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Results summary */}
      {hasActiveFilters && (
        <div className="text-xs text-[color:var(--portal-ink-2)] px-1 print:hidden">
          عرض <b className="tabular-nums text-[color:var(--portal-ink)]">{filtered.length}</b> من {items.length} موعد
        </div>
      )}

      {/* Summary counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 print:hidden">
        <StatCard label="جديد" value={counts.new} tone="sky" />
        <StatCard label="مؤكّد" value={counts.confirmed} tone="emerald" />
        <StatCard label="مكتمل" value={counts.completed} tone="slate" />
        <StatCard label="ملغى" value={counts.cancelled} tone="red" />
        <StatCard label="لم يحضر" value={counts.no_show} tone="amber" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState scope={scope} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((a) => (
            <AppointmentCard
              key={a.id}
              a={a}
              scope={scope}
              onConfirm={() => confirmMut.mutate(a.id)}
              onCancel={() =>
                setCancelFor({
                  id: a.id,
                  doctor: a.doctor?.name_ar ?? null,
                  date: a.appointment_date,
                  time: hhmm(a.appointment_time),
                })
              }
              onReschedule={() =>
                setReschedFor({
                  id: a.id,
                  date: a.appointment_date,
                  time: hhmm(a.appointment_time),
                  doctor: a.doctor?.name_ar ?? null,
                })
              }
              onFollowUp={() =>
                setFollowFor({ id: a.id, doctor: a.doctor?.name_ar ?? null })
              }
              pending={confirmMut.isPending || cancelMut.isPending || reschedMut.isPending}
            />
          ))}
        </ul>
      )}

      {/* Dialogs */}
      {reschedFor && (
        <RescheduleDialog
          target={reschedFor}
          pending={reschedMut.isPending}
          onClose={() => setReschedFor(null)}
          onSubmit={(date, time) => reschedMut.mutate({ id: reschedFor.id, date, time })}
        />
      )}
      {cancelFor && (
        <CancelDialog
          target={cancelFor}
          pending={cancelMut.isPending}
          onClose={() => setCancelFor(null)}
          onSubmit={(reason) => cancelMut.mutate({ id: cancelFor.id, reason })}
        />
      )}
      {followFor && (
        <FollowUpDialog
          target={followFor}
          pending={followMut.isPending}
          onClose={() => setFollowFor(null)}
          onSubmit={(date, time, reason) =>
            followMut.mutate({
              fromAppointmentId: followFor.id,
              preferredDate: date,
              preferredTime: time,
              reason,
            })
          }
        />
      )}
    </div>
  );
}

/* ----------------------------- sub components ---------------------------- */

function TabBtn({
  active, children, onClick,
}: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "h-8 px-4 rounded-full text-sm font-semibold transition " +
        (active
          ? "text-white shadow"
          : "text-[color:var(--portal-ink-2)] hover:text-[color:var(--portal-primary)]")
      }
      style={active ? { background: "var(--portal-gradient)" } : undefined}
    >
      {children}
    </button>
  );
}

function StatCard({
  label, value, tone,
}: { label: string; value: number; tone: "sky" | "emerald" | "slate" | "red" | "amber" }) {
  const map = {
    sky: "from-teal-50 to-teal-100/60 text-teal-700",
    emerald: "from-emerald-50 to-emerald-100/60 text-emerald-700",
    slate: "from-slate-50 to-slate-100/60 text-slate-700",
    red: "from-red-50 to-red-100/60 text-red-700",
    amber: "from-amber-50 to-amber-100/60 text-amber-700",
  }[tone];
  return (
    <div className={`rounded-2xl border border-white/60 bg-gradient-to-br ${map} p-3`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

type ApptRow = ReturnType<typeof mapItemType>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mapItemType() {
  return {} as {
    id: string;
    appointment_date: string;
    appointment_time: string;
    status: ApptStatus;
    reason: string | null;
    notes: string | null;
    patient_name: string;
    is_demo: boolean;
    doctor: { name_ar: string; name_en: string | null; title_ar: string | null; photo_url: string | null; slug: string } | null;
    branch: { name_ar: string; name_en: string; address_ar: string | null; phone: string | null; lat: number | null; lng: number | null; slug: string } | null;
    specialty: { name_ar: string; name_en: string } | null;
  };
}

function AppointmentCard({
  a, scope, onConfirm, onReschedule, onCancel, onFollowUp, pending,
}: {
  a: ApptRow;
  scope: Scope;
  onConfirm: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  onFollowUp: () => void;
  pending: boolean;
}) {
  const meta = statusMeta(a.status);
  const canConfirm = scope === "upcoming" && a.status === "new";
  const canModify = scope === "upcoming" && (a.status === "new" || a.status === "confirmed");
  const canFollow = scope === "past" && (a.status === "completed" || a.status === "no_show");
  const mapsUrl =
    a.branch?.lat != null && a.branch?.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${a.branch.lat},${a.branch.lng}`
      : a.branch?.name_ar
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.branch.name_ar + " " + (a.branch.address_ar ?? ""))}`
        : null;

  return (
    <li className="glass-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-4">
        {/* Date pill */}
        <div className="flex flex-col items-center justify-center min-w-[72px] rounded-xl bg-[color:var(--portal-gradient-soft)] border border-white/70 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--portal-ink-3)]">
            {new Date(`${a.appointment_date}T00:00:00`).toLocaleDateString("ar-SA-u-nu-latn", { month: "short" })}
          </div>
          <div className="text-2xl font-bold tabular-nums text-[color:var(--portal-primary)]">
            {new Date(`${a.appointment_date}T00:00:00`).getDate()}
          </div>
          <div className="text-[11px] font-semibold tabular-nums text-[color:var(--portal-ink-2)] flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3" /> {hhmm(a.appointment_time)}
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-semibold ${meta.cls}`}>
              {meta.label}
            </span>
            {a.is_demo && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">DEMO</span>
            )}
            {a.specialty && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {a.specialty.name_ar}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-[color:var(--portal-ink-3)]" />
            <div className="font-semibold text-[color:var(--portal-ink)] truncate">
              {a.doctor?.name_ar ?? "طبيب غير محدد"}
            </div>
            {a.doctor?.slug && (
              <Link
                to="/doctors/$slug"
                params={{ slug: a.doctor.slug }}
                className="text-[11px] text-[color:var(--portal-primary)] hover:underline"
              >
                عرض الملف
              </Link>
            )}
          </div>
          <div className="mt-1 text-xs text-[color:var(--portal-ink-2)] flex flex-wrap gap-x-4 gap-y-1">
            {a.branch && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {a.branch.name_ar}
              </span>
            )}
            {a.branch?.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {a.branch.phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <User2 className="h-3.5 w-3.5" /> {a.patient_name}
            </span>
          </div>
          {a.reason && (
            <p className="mt-2 text-sm text-[color:var(--portal-ink-2)] line-clamp-2">
              <b className="text-[color:var(--portal-ink)]">سبب الزيارة:</b> {a.reason}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        {canConfirm && (
          <ActionButton onClick={onConfirm} tone="success" disabled={pending}>
            <CheckCircle2 className="h-4 w-4" /> تأكيد الحضور
          </ActionButton>
        )}
        {canModify && (
          <>
            <ActionButton onClick={onReschedule} disabled={pending}>
              <Repeat className="h-4 w-4" /> إعادة جدولة
            </ActionButton>
            <ActionButton onClick={onCancel} tone="danger" disabled={pending}>
              <XCircle className="h-4 w-4" /> إلغاء
            </ActionButton>
          </>
        )}
        {canFollow && (
          <ActionButton onClick={onFollowUp} tone="success" disabled={pending}>
            <CalendarPlus className="h-4 w-4" /> طلب متابعة
          </ActionButton>
        )}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-xs font-semibold bg-white border border-[color:var(--portal-border)] hover:bg-slate-50"
          >
            <MapPin className="h-4 w-4" /> الاتجاهات
          </a>
        )}
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-full text-xs font-semibold bg-white border border-[color:var(--portal-border)] hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" /> طباعة التأكيد
        </button>
      </div>

      {/* Printable summary — visible only when printing */}
      <div className="hidden print:block mt-3 border-t pt-3 text-xs text-slate-700">
        <div className="font-bold text-base mb-1">تأكيد موعد — مجمع باعشن الطبي</div>
        <div>المريض: {a.patient_name}</div>
        <div>الطبيب: {a.doctor?.name_ar ?? "-"}</div>
        <div>الفرع: {a.branch?.name_ar ?? "-"} — {a.branch?.address_ar ?? ""}</div>
        <div>التاريخ: {fmtDate(a.appointment_date)} — الوقت: {hhmm(a.appointment_time)}</div>
        <div>الحالة: {meta.label}</div>
        {a.reason && <div>سبب الزيارة: {a.reason}</div>}
        <div className="mt-1 text-slate-500">يُرجى الحضور قبل الموعد بـ 15 دقيقة.</div>
      </div>
    </li>
  );
}

function ActionButton({
  onClick, disabled, tone, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "success" | "danger";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
      : tone === "danger"
        ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
        : "bg-white text-slate-700 border-[color:var(--portal-border)] hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 h-9 px-3 rounded-full text-xs font-semibold border transition disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- dialogs --------------------------------- */

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[color:var(--portal-ink)]">{title}</h3>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="h-8 w-8 grid place-items-center rounded-full hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RescheduleDialog({
  target, pending, onClose, onSubmit,
}: {
  target: { id: string; date: string; time: string; doctor?: string | null };
  pending: boolean;
  onClose: () => void;
  onSubmit: (date: string, time: string) => void;
}) {
  const [date, setDate] = useState(target.date);
  const [time, setTime] = useState(target.time);
  const minDate = new Date().toISOString().slice(0, 10);
  return (
    <Modal title="إعادة جدولة الموعد" onClose={onClose}>
      {target.doctor && <p className="text-sm text-slate-500 mb-3">الطبيب: {target.doctor}</p>}
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-slate-700">التاريخ الجديد</span>
          <input
            type="date"
            min={minDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">الوقت الجديد</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <p className="text-[11px] text-slate-500">
          سيتم إعادة تعيين حالة الموعد إلى «جديد» بانتظار تأكيد المركز.
        </p>
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <button onClick={onClose} disabled={pending} className="h-9 px-4 rounded-full text-sm border border-slate-200 bg-white">
          إلغاء
        </button>
        <button
          onClick={() => onSubmit(date, time)}
          disabled={pending || !date || !time}
          className="h-9 px-4 rounded-full text-sm text-white font-semibold shadow disabled:opacity-50"
          style={{ background: "var(--portal-gradient)" }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد"}
        </button>
      </div>
    </Modal>
  );
}

function CancelDialog({
  target, pending, onClose, onSubmit,
}: {
  target: { id: string; doctor?: string | null; date: string; time: string };
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="إلغاء الموعد" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        هل أنت متأكد من إلغاء موعدك مع{" "}
        <b>{target.doctor ?? "الطبيب"}</b> في{" "}
        <b>{fmtDate(target.date)} — {target.time}</b>؟
      </p>
      <label className="block text-sm">
        <span className="text-slate-700">سبب الإلغاء (اختياري)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 resize-none"
          placeholder="مثال: ظرف طارئ، تعارض مع موعد آخر..."
        />
      </label>
      <div className="mt-5 flex gap-2 justify-end">
        <button onClick={onClose} disabled={pending} className="h-9 px-4 rounded-full text-sm border border-slate-200 bg-white">
          تراجع
        </button>
        <button
          onClick={() => onSubmit(reason.trim())}
          disabled={pending}
          className="h-9 px-4 rounded-full text-sm text-white font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الإلغاء"}
        </button>
      </div>
    </Modal>
  );
}

function FollowUpDialog({
  target, pending, onClose, onSubmit,
}: {
  target: { id: string; doctor?: string | null };
  pending: boolean;
  onClose: () => void;
  onSubmit: (date: string, time: string, reason: string) => void;
}) {
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState("10:00");
  const [reason, setReason] = useState("");
  const minDate = new Date().toISOString().slice(0, 10);
  return (
    <Modal title="طلب متابعة" onClose={onClose}>
      {target.doctor && <p className="text-sm text-slate-500 mb-3">مع: {target.doctor}</p>}
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-slate-700">التاريخ المفضّل</span>
          <input
            type="date"
            min={minDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">الوقت المفضّل</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">سبب المتابعة</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 resize-none"
            placeholder="اكتب ملاحظاتك أو الأعراض المستمرة..."
          />
        </label>
        <p className="text-[11px] text-slate-500">
          سيتم إنشاء طلب موعد جديد بحالة «جديد» بانتظار تأكيد المركز.
        </p>
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <button onClick={onClose} disabled={pending} className="h-9 px-4 rounded-full text-sm border border-slate-200 bg-white">
          إلغاء
        </button>
        <button
          onClick={() => onSubmit(date, time, reason.trim())}
          disabled={pending || !date || !time}
          className="h-9 px-4 rounded-full text-sm text-white font-semibold shadow disabled:opacity-50"
          style={{ background: "var(--portal-gradient)" }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال الطلب"}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- states ---------------------------------- */

function EmptyState({ scope }: { scope: Scope }) {
  return (
    <div className="glass-card p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-[color:var(--portal-gradient-soft)] text-[color:var(--portal-primary)] mb-4">
        <CalendarDays className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold text-[color:var(--portal-ink)]">
        {scope === "upcoming" ? "لا توجد مواعيد قادمة" : "لا توجد مواعيد سابقة"}
      </h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2">
        {scope === "upcoming"
          ? "احجز موعدك القادم بسهولة مع أحد أطبائنا."
          : "لم يتم تسجيل زيارات سابقة على حسابك حتى الآن."}
      </p>
      {scope === "upcoming" && (
        <Link
          to="/portal/book"
          className="inline-flex items-center gap-2 h-10 mt-5 px-5 rounded-full text-white text-sm font-semibold shadow"
          style={{ background: "var(--portal-gradient)" }}
        >
          <CalendarPlus className="h-4 w-4" /> حجز موعد
        </Link>
      )}
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل المواعيد</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">{error.message}</p>
      <div className="mt-5 flex justify-center gap-2">
        <button
          onClick={() => router.invalidate()}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-white font-semibold text-sm shadow"
          style={{ background: "var(--portal-gradient)" }}
        >
          <RefreshCw className="h-4 w-4" /> إعادة المحاولة
        </button>
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm bg-white border border-[color:var(--portal-border)]"
        >
          <ChevronLeft className="h-4 w-4" /> الرئيسية
        </Link>
      </div>
    </div>
  );
}
