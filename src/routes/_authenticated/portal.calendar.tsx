import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  CheckCircle2, XCircle, Clock, UserCheck, RefreshCw, Ban, Unlock,
  CalendarClock, Phone, StickyNote, Stethoscope, MapPin,
} from "lucide-react";
import {
  listMyCalendar,
  updateMyAppointmentStatus,
  rescheduleMyAppointment,
  setMySlotStatus,
  deleteMySlot,
  getMyDoctorSummary,
} from "@/lib/portal/doctor-schedule.functions";
import { listMyAppointments } from "@/lib/portal/appointments.functions";

export const Route = createFileRoute("/_authenticated/portal/calendar")({
  head: () => ({
    meta: [
      { title: "تقويمي | بوابة المريض" },
      { name: "description", content: "تقويم شهري يعرض مواعيدك القادمة والسابقة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CalendarRouter,
  errorComponent: CalendarError,
  notFoundComponent: () => null,
});

function CalendarRouter() {
  const roleQ = useQuery({
    queryKey: ["portal", "role-probe"],
    queryFn: () => getMyDoctorSummary(),
    staleTime: 5 * 60_000,
  });
  if (roleQ.isLoading) {
    return (
      <div className="h-64 grid place-items-center text-[color:var(--portal-ink-2)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (roleQ.data?.linked) return <DoctorCalendarPage />;
  return <PatientCalendarPage />;
}


const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTHS = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const hhmm = (t: string) => String(t).slice(0, 5);

function CalendarError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل التقويم</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">{error.message}</p>
      <button className="portal-btn portal-btn-primary mt-4" onClick={() => router.invalidate()}>
        إعادة المحاولة
      </button>
    </div>
  );
}

function DoctorCalendarPage() {
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<{ y: number; m: number }>({
    y: today.getFullYear(),
    m: today.getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string>(iso(today));
  const [rescheduleTarget, setRescheduleTarget] = useState<null | {
    id: string; date: string; time: string; patient: string;
  }>(null);

  const monthStart = new Date(cursor.y, cursor.m, 1);
  const monthEnd = new Date(cursor.y, cursor.m + 1, 0);
  // Grid range: pad to weeks (Sunday-start)
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const fromDate = iso(gridStart);
  const toDate = iso(gridEnd);

  const calQuery = useQuery({
    queryKey: ["portal", "doctor-calendar", fromDate, toDate],
    queryFn: () => listMyCalendar({ data: { fromDate, toDate } }),
    staleTime: 30_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["portal", "doctor-calendar"] });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "new"|"confirmed"|"completed"|"cancelled"|"no_show" }) =>
      updateMyAppointmentStatus({ data: v }),
    onSuccess: (_d, v) => { invalidate(); toast.success(v.status === "cancelled" ? "تم إلغاء الموعد" : "تم تحديث الحالة"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reschedMut = useMutation({
    mutationFn: (v: { id: string; date: string; time: string }) =>
      rescheduleMyAppointment({ data: v }),
    onSuccess: () => { invalidate(); toast.success("تمت إعادة الجدولة"); setRescheduleTarget(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const slotStatusMut = useMutation({
    mutationFn: (v: { id: string; status: "available"|"blocked" }) => setMySlotStatus({ data: v }),
    onSuccess: () => { invalidate(); toast.success("تم تحديث الفترة"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const slotDeleteMut = useMutation({
    mutationFn: (id: string) => deleteMySlot({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("تم حذف الفترة"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Bucket data by date
  const byDate = useMemo(() => {
    const map = new Map<string, { appts: number; booked: number; available: number; blocked: number; onLeave: boolean }>();
    const days: string[] = [];
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) days.push(iso(d));
    days.forEach(d => map.set(d, { appts: 0, booked: 0, available: 0, blocked: 0, onLeave: false }));
    const data = calQuery.data;
    if (data) {
      data.appointments.forEach(a => {
        const b = map.get(a.appointment_date);
        if (b && (a.status === "new" || a.status === "confirmed" || a.status === "completed")) b.appts++;
      });
      data.slots.forEach(s => {
        const b = map.get(s.slot_date);
        if (!b) return;
        if (s.status === "booked") b.booked++;
        else if (s.status === "blocked") b.blocked++;
        else b.available++;
      });
      data.leaves.forEach(lv => {
        for (const d of days) {
          if (d >= lv.start_date && d <= lv.end_date) {
            const b = map.get(d); if (b) b.onLeave = true;
          }
        }
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calQuery.data, fromDate, toDate]);

  const dayAppts = (calQuery.data?.appointments ?? []).filter(a => a.appointment_date === selectedDate);
  const daySlots = (calQuery.data?.slots ?? []).filter(s => s.slot_date === selectedDate);
  const dayLeaves = (calQuery.data?.leaves ?? []).filter(lv => selectedDate >= lv.start_date && selectedDate <= lv.end_date);

  const gotoMonth = (delta: number) => {
    setCursor(c => {
      const nd = new Date(c.y, c.m + delta, 1);
      return { y: nd.getFullYear(), m: nd.getMonth() };
    });
  };

  return (
    <div dir="rtl" className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 rounded-xl grid place-items-center bg-[color:var(--portal-accent)]/10 text-[color:var(--portal-accent)]">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-bold">تقويمي البصري</h1>
          <p className="text-sm text-[color:var(--portal-ink-2)]">اعرض مواعيدك وأدر الفترات بسهولة.</p>
        </div>
        <Link to="/portal/schedule" className="portal-btn portal-btn-ghost">
          <CalendarClock className="h-4 w-4" /> إدارة الجدول
        </Link>
      </header>

      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <button className="portal-btn portal-btn-ghost" onClick={() => gotoMonth(-1)} aria-label="الشهر السابق">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-lg font-bold">{MONTHS[cursor.m]} {cursor.y}</div>
            <button
              className="text-xs text-[color:var(--portal-accent)] hover:underline"
              onClick={() => { const t = new Date(); setCursor({ y: t.getFullYear(), m: t.getMonth() }); setSelectedDate(iso(t)); }}
            >
              اليوم
            </button>
          </div>
          <button className="portal-btn portal-btn-ghost" onClick={() => gotoMonth(1)} aria-label="الشهر التالي">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {calQuery.isLoading ? (
          <div className="h-64 grid place-items-center text-[color:var(--portal-ink-2)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map(w => (
                <div key={w} className="text-center text-xs font-semibold text-[color:var(--portal-ink-2)] py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const cells: React.ReactNode[] = [];
                for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
                  const dateStr = iso(d);
                  const inMonth = d.getMonth() === cursor.m;
                  const isToday = dateStr === iso(today);
                  const isSelected = dateStr === selectedDate;
                  const b = byDate.get(dateStr);
                  cells.push(
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={[
                        "aspect-square min-h-[60px] rounded-lg border p-1.5 text-right transition flex flex-col",
                        inMonth ? "bg-white" : "bg-transparent opacity-50",
                        isSelected ? "ring-2 ring-[color:var(--portal-accent)] border-[color:var(--portal-accent)]" : "border-slate-200 hover:border-slate-300",
                        isToday && !isSelected ? "border-[color:var(--portal-accent)]" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className={isToday ? "font-bold text-[color:var(--portal-accent)]" : ""}>{d.getDate()}</span>
                        {b?.onLeave && <span title="إجازة" className="text-amber-500">✕</span>}
                      </div>
                      <div className="mt-auto flex flex-wrap gap-0.5 items-end justify-start">
                        {b && b.appts > 0 && (
                          <span className="text-[10px] px-1 rounded bg-emerald-100 text-emerald-700 font-semibold">
                            {b.appts} موعد
                          </span>
                        )}
                        {b && b.available > 0 && (
                          <span className="text-[10px] px-1 rounded bg-sky-100 text-sky-700">
                            {b.available} متاح
                          </span>
                        )}
                        {b && b.blocked > 0 && (
                          <span className="text-[10px] px-1 rounded bg-slate-200 text-slate-700">
                            {b.blocked} محجوب
                          </span>
                        )}
                      </div>
                    </button>,
                  );
                }
                return cells;
              })()}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--portal-ink-2)]">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500" /> موعد مؤكّد</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-sky-500" /> فترة متاحة</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-slate-400" /> محجوب</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-500" /> إجازة</span>
            </div>
          </>
        )}
      </div>

      {/* Day details */}
      <div className="glass-card p-4 sm:p-5">
        <h2 className="text-base font-bold mb-4">
          تفاصيل {new Date(selectedDate).toLocaleDateString("ar-SA-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </h2>

        {dayLeaves.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <b>إجازة:</b> {dayLeaves.map(l => l.reason || "بدون سبب").join("، ")}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          {/* Appointments */}
          <section>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <UserCheck className="h-4 w-4" /> المواعيد ({dayAppts.length})
            </h3>
            {dayAppts.length === 0 ? (
              <p className="text-sm text-[color:var(--portal-ink-2)]">لا توجد مواعيد.</p>
            ) : (
              <ul className="space-y-2">
                {dayAppts.map(a => (
                  <li key={a.id} className="p-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-start gap-2">
                      <div className="text-sm font-bold text-[color:var(--portal-accent)] tabular-nums">
                        {hhmm(a.appointment_time)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{a.patient_name}</div>
                        <div className="text-xs text-[color:var(--portal-ink-2)] flex items-center gap-2 mt-0.5">
                          <Phone className="h-3 w-3" /> {a.patient_phone}
                        </div>
                        {a.reason && (
                          <div className="text-xs text-[color:var(--portal-ink-2)] flex items-start gap-1 mt-1">
                            <StickyNote className="h-3 w-3 mt-0.5 shrink-0" /> <span className="truncate">{a.reason}</span>
                          </div>
                        )}
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {a.status !== "confirmed" && a.status !== "completed" && a.status !== "cancelled" && (
                        <ActionBtn onClick={() => statusMut.mutate({ id: a.id, status: "confirmed" })} disabled={statusMut.isPending} tone="success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> تأكيد
                        </ActionBtn>
                      )}
                      {a.status !== "completed" && a.status !== "cancelled" && (
                        <ActionBtn onClick={() => statusMut.mutate({ id: a.id, status: "completed" })} disabled={statusMut.isPending}>
                          إكمال
                        </ActionBtn>
                      )}
                      {a.status !== "cancelled" && a.status !== "completed" && (
                        <>
                          <ActionBtn onClick={() => setRescheduleTarget({ id: a.id, date: a.appointment_date, time: hhmm(a.appointment_time), patient: a.patient_name })} disabled={reschedMut.isPending}>
                            <RefreshCw className="h-3.5 w-3.5" /> إعادة جدولة
                          </ActionBtn>
                          <ActionBtn onClick={() => statusMut.mutate({ id: a.id, status: "no_show" })} disabled={statusMut.isPending}>
                            عدم حضور
                          </ActionBtn>
                          <ActionBtn onClick={() => { if (confirm("إلغاء هذا الموعد؟")) statusMut.mutate({ id: a.id, status: "cancelled" }); }} disabled={statusMut.isPending} tone="danger">
                            <XCircle className="h-3.5 w-3.5" /> إلغاء
                          </ActionBtn>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Slots */}
          <section>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" /> الفترات ({daySlots.length})
            </h3>
            {daySlots.length === 0 ? (
              <p className="text-sm text-[color:var(--portal-ink-2)]">
                لا توجد فترات. <Link to="/portal/schedule" className="text-[color:var(--portal-accent)] hover:underline">أضف فترات ←</Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {daySlots.map(s => (
                  <li key={s.id} className="p-2 rounded-lg border border-slate-200 bg-white flex items-center gap-2">
                    <div className="text-sm font-semibold tabular-nums flex-1">
                      {hhmm(s.start_time)} — {hhmm(s.end_time)}
                    </div>
                    <SlotBadge status={s.status} />
                    {s.status === "available" && (
                      <>
                        <ActionBtn onClick={() => slotStatusMut.mutate({ id: s.id, status: "blocked" })} disabled={slotStatusMut.isPending}>
                          <Ban className="h-3.5 w-3.5" /> حجب
                        </ActionBtn>
                        <ActionBtn onClick={() => { if (confirm("حذف هذه الفترة؟")) slotDeleteMut.mutate(s.id); }} disabled={slotDeleteMut.isPending} tone="danger">
                          حذف
                        </ActionBtn>
                      </>
                    )}
                    {s.status === "blocked" && (
                      <ActionBtn onClick={() => slotStatusMut.mutate({ id: s.id, status: "available" })} disabled={slotStatusMut.isPending} tone="success">
                        <Unlock className="h-3.5 w-3.5" /> إتاحة
                      </ActionBtn>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {rescheduleTarget && (
        <RescheduleDialog
          target={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onSubmit={(date, time) => reschedMut.mutate({ id: rescheduleTarget.id, date, time })}
          pending={reschedMut.isPending}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { t: string; c: string }> = {
    new: { t: "جديد", c: "bg-blue-100 text-blue-700" },
    confirmed: { t: "مؤكّد", c: "bg-emerald-100 text-emerald-700" },
    completed: { t: "مكتمل", c: "bg-slate-200 text-slate-700" },
    cancelled: { t: "ملغى", c: "bg-red-100 text-red-700" },
    no_show: { t: "لم يحضر", c: "bg-amber-100 text-amber-700" },
  };
  const v = map[status] ?? { t: status, c: "bg-slate-100 text-slate-700" };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${v.c}`}>{v.t}</span>;
}

function SlotBadge({ status }: { status: string }) {
  const map: Record<string, { t: string; c: string }> = {
    available: { t: "متاح", c: "bg-sky-100 text-sky-700" },
    booked: { t: "محجوز", c: "bg-emerald-100 text-emerald-700" },
    blocked: { t: "محجوب", c: "bg-slate-200 text-slate-700" },
  };
  const v = map[status] ?? { t: status, c: "bg-slate-100 text-slate-700" };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${v.c}`}>{v.t}</span>;
}

function ActionBtn({
  onClick, disabled, tone, children,
}: { onClick: () => void; disabled?: boolean; tone?: "success"|"danger"; children: React.ReactNode }) {
  const cls =
    tone === "success" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200" :
    tone === "danger" ? "bg-red-50 text-red-700 hover:bg-red-100 border-red-200" :
    "bg-white text-slate-700 hover:bg-slate-50 border-slate-200";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${cls} disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function RescheduleDialog({
  target, onClose, onSubmit, pending,
}: {
  target: { id: string; date: string; time: string; patient: string };
  onClose: () => void;
  onSubmit: (date: string, time: string) => void;
  pending: boolean;
}) {
  const [date, setDate] = useState(target.date);
  const [time, setTime] = useState(target.time);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-1">إعادة جدولة الموعد</h3>
        <p className="text-sm text-slate-500 mb-4">{target.patient}</p>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700">التاريخ الجديد</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">الوقت الجديد</span>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <button className="portal-btn portal-btn-ghost" onClick={onClose} disabled={pending}>إلغاء</button>
          <button className="portal-btn portal-btn-primary" onClick={() => onSubmit(date, time)} disabled={pending || !date || !time}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================= Patient Calendar View ========================= */

function PatientCalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<{ y: number; m: number }>({
    y: today.getFullYear(), m: today.getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState<string>(iso(today));

  const monthStart = new Date(cursor.y, cursor.m, 1);
  const monthEnd = new Date(cursor.y, cursor.m + 1, 0);
  const gridStart = new Date(monthStart); gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(monthEnd); gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const fromDate = iso(gridStart);
  const toDate = iso(gridEnd);

  const q = useQuery({
    queryKey: ["portal", "patient-calendar", fromDate, toDate],
    queryFn: () =>
      listMyAppointments({ data: { scope: "all", fromDate, toDate, limit: 100 } }),
    staleTime: 30_000,
  });

  const byDate = useMemo(() => {
    const map = new Map<string, { total: number; confirmed: number; cancelled: number }>();
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      map.set(iso(d), { total: 0, confirmed: 0, cancelled: 0 });
    }
    (q.data?.items ?? []).forEach((a) => {
      const b = map.get(a.appointment_date);
      if (!b) return;
      b.total++;
      if (a.status === "confirmed") b.confirmed++;
      if (a.status === "cancelled") b.cancelled++;
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, fromDate, toDate]);

  const dayAppts = (q.data?.items ?? []).filter((a) => a.appointment_date === selectedDate);

  const gotoMonth = (delta: number) =>
    setCursor((c) => {
      const nd = new Date(c.y, c.m + delta, 1);
      return { y: nd.getFullYear(), m: nd.getMonth() };
    });

  return (
    <div dir="rtl" className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 rounded-2xl grid place-items-center bg-[color:var(--portal-gradient-soft)] text-[color:var(--portal-primary)]">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-xl font-bold text-[color:var(--portal-ink)]">تقويم مواعيدي</h1>
          <p className="text-sm text-[color:var(--portal-ink-2)]">نظرة شهرية على مواعيدك مع تنقّل سريع لأي يوم.</p>
        </div>
        <Link
          to="/portal/appointments"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-[color:var(--portal-border)] text-sm font-semibold hover:bg-slate-50"
        >
          <CalendarClock className="h-4 w-4" /> قائمة المواعيد
        </Link>
        <Link
          to="/portal/book"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-white text-sm font-semibold shadow"
          style={{ background: "var(--portal-gradient)" }}
        >
          <CalendarPlus className="h-4 w-4" /> حجز جديد
        </Link>
      </header>

      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <button className="portal-btn portal-btn-ghost" onClick={() => gotoMonth(-1)} aria-label="الشهر السابق">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-lg font-bold">{MONTHS[cursor.m]} {cursor.y}</div>
            <button
              className="text-xs text-[color:var(--portal-primary)] hover:underline"
              onClick={() => { const t = new Date(); setCursor({ y: t.getFullYear(), m: t.getMonth() }); setSelectedDate(iso(t)); }}
            >
              اليوم
            </button>
          </div>
          <button className="portal-btn portal-btn-ghost" onClick={() => gotoMonth(1)} aria-label="الشهر التالي">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {q.isLoading ? (
          <div className="h-64 grid place-items-center text-[color:var(--portal-ink-2)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-xs font-semibold text-[color:var(--portal-ink-2)] py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const cells: React.ReactNode[] = [];
                for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
                  const dateStr = iso(d);
                  const inMonth = d.getMonth() === cursor.m;
                  const isToday = dateStr === iso(today);
                  const isSelected = dateStr === selectedDate;
                  const b = byDate.get(dateStr);
                  cells.push(
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      className={[
                        "aspect-square min-h-[60px] rounded-lg border p-1.5 text-right transition flex flex-col",
                        inMonth ? "bg-white" : "bg-transparent opacity-50",
                        isSelected ? "ring-2 ring-[color:var(--portal-primary)] border-[color:var(--portal-primary)]" : "border-slate-200 hover:border-slate-300",
                        isToday && !isSelected ? "border-[color:var(--portal-primary)]" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className={isToday ? "font-bold text-[color:var(--portal-primary)]" : ""}>{d.getDate()}</span>
                      </div>
                      <div className="mt-auto flex flex-wrap gap-0.5 items-end justify-start">
                        {b && b.confirmed > 0 && (
                          <span className="text-[10px] px-1 rounded bg-emerald-100 text-emerald-700 font-semibold">
                            {b.confirmed} مؤكّد
                          </span>
                        )}
                        {b && b.total - b.confirmed - b.cancelled > 0 && (
                          <span className="text-[10px] px-1 rounded bg-sky-100 text-sky-700">
                            {b.total - b.confirmed - b.cancelled} جديد
                          </span>
                        )}
                        {b && b.cancelled > 0 && (
                          <span className="text-[10px] px-1 rounded bg-red-100 text-red-700">
                            {b.cancelled} ملغى
                          </span>
                        )}
                      </div>
                    </button>,
                  );
                }
                return cells;
              })()}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--portal-ink-2)]">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500" /> مؤكّد</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-sky-500" /> جديد</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-red-500" /> ملغى</span>
            </div>
          </>
        )}
      </div>

      {/* Day details */}
      <div className="glass-card p-4 sm:p-5">
        <h2 className="text-base font-bold mb-4">
          مواعيد {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("ar-SA-u-nu-latn", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
        </h2>
        {dayAppts.length === 0 ? (
          <p className="text-sm text-[color:var(--portal-ink-2)]">
            لا توجد مواعيد في هذا اليوم.{" "}
            <Link to="/portal/book" className="text-[color:var(--portal-primary)] hover:underline">احجز موعدًا ←</Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {dayAppts.map((a) => (
              <li key={a.id} className="p-3 rounded-lg border border-slate-200 bg-white">
                <div className="flex items-start gap-3">
                  <div className="text-sm font-bold text-[color:var(--portal-primary)] tabular-nums min-w-[48px]">
                    {hhmm(a.appointment_time)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-slate-400" />
                      {a.doctor?.name_ar ?? "طبيب"}
                    </div>
                    <div className="text-xs text-[color:var(--portal-ink-2)] mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                      {a.branch && (<span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.branch.name_ar}</span>)}
                      {a.specialty && (<span>{a.specialty.name_ar}</span>)}
                    </div>
                    {a.reason && (
                      <div className="text-xs text-[color:var(--portal-ink-2)] mt-1 line-clamp-2">
                        <StickyNote className="h-3 w-3 inline-block mr-1" />{a.reason}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={a.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
