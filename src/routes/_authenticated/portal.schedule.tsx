import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock, CalendarDays, Clock, Plus, Trash2, Loader2,
  AlertTriangle, RefreshCw, CalendarOff, UserCheck, CheckCircle2, XCircle,
  Sparkles,
} from "lucide-react";
import {
  getMyDoctorSummary,
  listMyAvailability, createMyAvailability, deleteMyAvailability,
  listMyLeaves, createMyLeave, deleteMyLeave,
  listMySlots, generateMySlots, deleteMySlot,
  listMyUpcomingAppointments,
} from "@/lib/portal/doctor-schedule.functions";

const summaryQuery = queryOptions({
  queryKey: ["portal", "doctor-schedule", "summary"],
  queryFn: () => getMyDoctorSummary(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/portal/schedule")({
  loader: async ({ context }) => context.queryClient.ensureQueryData(summaryQuery),
  head: () => ({
    meta: [
      { title: "جدولي وأوقات التوفّر | بوابة الطبيب" },
      { name: "description", content: "لوحة تحكم الطبيب: إدارة الجدول الأسبوعي، الإجازات، وفترات المواعيد." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DoctorSchedulePage,
  errorComponent: ScheduleError,
  notFoundComponent: () => null,
});

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function ScheduleError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="glass-card max-w-md mx-auto p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h3 className="text-lg font-bold">تعذّر تحميل الجدول</h3>
      <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">{error.message}</p>
      <button
        onClick={() => { router.invalidate(); reset(); }}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-[color:var(--portal-on-primary)]"
        style={{ background: "var(--portal-gradient)" }}
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  );
}

function DoctorSchedulePage() {
  const { data: summary } = useSuspenseQuery(summaryQuery);

  if (!summary.linked) {
    return (
      <div className="glass-card max-w-lg mx-auto p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-amber-50 text-amber-500 mb-4">
          <UserCheck className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold">حسابك غير مرتبط بسجل طبيب</h2>
        <p className="text-sm text-[color:var(--portal-ink-2)] mt-2">
          إن كنت طبيبًا في المجمع، يرجى التواصل مع الإدارة لربط حسابك بسجلك الطبي حتى تتمكن من إدارة جدولك.
        </p>
        <Link
          to="/portal"
          className="mt-6 inline-flex rounded-full px-5 h-10 items-center text-sm font-semibold text-[color:var(--portal-on-primary)]"
          style={{ background: "var(--portal-gradient)" }}
        >
          العودة إلى البوابة
        </Link>
      </div>
    );
  }

  const doctor = summary.doctor;
  const counts = summary.counts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl grid place-items-center text-[color:var(--portal-on-primary)] text-lg font-bold shadow-md"
            style={{ background: "var(--portal-gradient)" }}
          >
            {(doctor?.name_ar ?? "د").trim().slice(0, 1)}
          </div>
          <div>
            <div className="text-xs text-[color:var(--portal-ink-3)]">مرحبًا</div>
            <div className="text-lg font-bold">{doctor?.name_ar ?? "الطبيب"}</div>
            <div className="text-xs text-[color:var(--portal-ink-3)]">
              {doctor?.title_ar ?? ""}
              {!doctor?.booking_enabled && (
                <span className="ms-2 inline-flex items-center gap-1 text-amber-600">
                  <XCircle className="h-3 w-3" /> الحجز موقوف حاليًا
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[color:var(--portal-primary)]" />
          <span className="text-xs text-[color:var(--portal-ink-2)]">لوحة الجدول الذكية</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={CalendarDays} label="فترات أسبوعية" value={counts.weeklySlots} tone="primary" />
        <Kpi icon={Clock} label="أوقات متاحة (مقبلة)" value={counts.availableSlots} tone="emerald" />
        <Kpi icon={CalendarClock} label="مواعيد قادمة" value={counts.upcomingAppointments} tone="sky" />
        <Kpi icon={CalendarOff} label="إجازات نشطة" value={counts.activeLeaves} tone="amber" />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <WeeklyAvailabilitySection />
          <TimeSlotsSection />
        </div>
        <div className="space-y-6">
          <UpcomingAppointmentsSection />
          <LeavesSection />
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: {
  icon: typeof CalendarDays; label: string; value: number;
  tone: "primary" | "emerald" | "sky" | "amber";
}) {
  const toneCls: Record<typeof tone, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-100 text-emerald-700",
    sky: "bg-teal-100 text-teal-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <div className="glass-card p-4 flex items-center gap-3">
      <div className={`h-11 w-11 rounded-2xl grid place-items-center ${toneCls[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-[color:var(--portal-ink-3)]">{label}</div>
      </div>
    </div>
  );
}

/* =========================== Weekly availability =========================== */

const availQuery = queryOptions({
  queryKey: ["portal", "doctor-schedule", "availability"],
  queryFn: () => listMyAvailability(),
  staleTime: 30_000,
});

function WeeklyAvailabilitySection() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery(availQuery);
  const createFn = useServerFn(createMyAvailability);
  const deleteFn = useServerFn(deleteMyAvailability);

  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [slot, setSlot] = useState(30);

  const createMut = useMutation({
    mutationFn: (data: { weekday: number; startTime: string; endTime: string; slotMinutes: number }) =>
      createFn({ data }),
    onSuccess: () => {
      toast.success("تمت إضافة الفترة");
      qc.invalidateQueries({ queryKey: ["portal", "doctor-schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف الفترة");
      qc.invalidateQueries({ queryKey: ["portal", "doctor-schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const g: Record<number, typeof rows> = {};
    for (const r of rows) (g[r.weekday] ??= []).push(r);
    return g;
  }, [rows]);

  return (
    <section className="glass-card p-6">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[color:var(--portal-primary)]" />
            الجدول الأسبوعي
          </h2>
          <p className="text-xs text-[color:var(--portal-ink-3)] mt-1">
            حدّد أيامك وساعات عملك المتكرّرة كل أسبوع.
          </p>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMut.mutate({ weekday, startTime, endTime, slotMinutes: slot });
        }}
        className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end p-4 rounded-2xl bg-[color:var(--portal-gradient-soft)] mb-5"
      >
        <div>
          <label className="text-xs font-semibold">اليوم</label>
          <select
            value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm"
          >
            {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold">من</label>
          <input
            type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold">إلى</label>
          <input
            type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold">مدة الحصة (د)</label>
          <input
            type="number" min={5} max={240} step={5} value={slot}
            onChange={(e) => setSlot(Number(e.target.value))}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm"
          />
        </div>
        <button
          type="submit" disabled={createMut.isPending}
          className="h-10 rounded-lg text-[color:var(--portal-on-primary)] text-sm font-semibold inline-flex items-center justify-center gap-1.5"
          style={{ background: "var(--portal-gradient)" }}
        >
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          إضافة
        </button>
      </form>

      <div className="space-y-3">
        {WEEKDAYS.map((label, i) => (
          <div key={i} className="rounded-xl border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm">{label}</div>
              <div className="text-xs text-[color:var(--portal-ink-3)]">
                {(grouped[i] ?? []).length} فترة
              </div>
            </div>
            {(grouped[i] ?? []).length === 0 ? (
              <div className="text-xs text-[color:var(--portal-ink-3)]">لا توجد فترات</div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {grouped[i]!.map((r) => (
                  <li key={r.id}
                    className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5" />
                    <span dir="ltr" className="font-mono">
                      {String(r.start_time).slice(0, 5)} – {String(r.end_time).slice(0, 5)}
                    </span>
                    <span className="text-[10px] opacity-70">({r.slot_minutes}د)</span>
                    <button
                      type="button" onClick={() => deleteMut.mutate(r.id)}
                      disabled={deleteMut.isPending}
                      aria-label="حذف الفترة"
                      className="ms-1 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* =============================== Time slots ================================ */

function todayIso(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function TimeSlotsSection() {
  const qc = useQueryClient();
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso(14));

  const listFn = useServerFn(listMySlots);
  const genFn = useServerFn(generateMySlots);
  const delFn = useServerFn(deleteMySlot);

  const slotsQ = useQuery({
    queryKey: ["portal", "doctor-schedule", "slots", fromDate, toDate],
    queryFn: () => listFn({ data: { fromDate, toDate } }),
  });

  const [genDate, setGenDate] = useState(todayIso(1));
  const [gStart, setGStart] = useState("09:00");
  const [gEnd, setGEnd] = useState("13:00");
  const [gDur, setGDur] = useState(30);
  const [gBreak, setGBreak] = useState(0);

  const genMut = useMutation({
    mutationFn: () => genFn({ data: {
      date: genDate, startTime: gStart, endTime: gEnd,
      durationMinutes: gDur, breakMinutes: gBreak,
    } }),
    onSuccess: (r) => {
      toast.success(`تم إنشاء ${r.created} فترة (${r.skipped} متجاهلة)`);
      qc.invalidateQueries({ queryKey: ["portal", "doctor-schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف الفترة");
      qc.invalidateQueries({ queryKey: ["portal", "doctor-schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const g: Record<string, NonNullable<typeof slotsQ.data>> = {};
    for (const s of (slotsQ.data ?? [])) (g[s.slot_date] ??= []).push(s);
    return g;
  }, [slotsQ.data]);

  return (
    <section className="glass-card p-6">
      <header className="mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Clock className="h-5 w-5 text-[color:var(--portal-primary)]" />
          فترات المواعيد
        </h2>
        <p className="text-xs text-[color:var(--portal-ink-3)] mt-1">
          ولّد فترات محددة ليوم بعينه، أو احذف فترات غير محجوزة.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 items-end p-4 rounded-2xl bg-[color:var(--portal-gradient-soft)] mb-5">
        <div>
          <label className="text-xs font-semibold">التاريخ</label>
          <input type="date" value={genDate} min={todayIso()} onChange={(e) => setGenDate(e.target.value)}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold">من</label>
          <input type="time" value={gStart} onChange={(e) => setGStart(e.target.value)}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold">إلى</label>
          <input type="time" value={gEnd} onChange={(e) => setGEnd(e.target.value)}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold">المدة (د)</label>
          <input type="number" min={5} max={240} value={gDur} onChange={(e) => setGDur(Number(e.target.value))}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold">فاصل (د)</label>
          <input type="number" min={0} max={120} value={gBreak} onChange={(e) => setGBreak(Number(e.target.value))}
            className="mt-1 w-full h-10 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
        </div>
        <button
          type="button" onClick={() => genMut.mutate()} disabled={genMut.isPending}
          className="h-10 rounded-lg text-[color:var(--portal-on-primary)] text-sm font-semibold inline-flex items-center justify-center gap-1.5"
          style={{ background: "var(--portal-gradient)" }}
        >
          {genMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          توليد
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs font-semibold">عرض من</label>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="h-9 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
        <label className="text-xs font-semibold">إلى</label>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="h-9 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
      </div>

      {slotsQ.isLoading ? (
        <div className="text-sm text-[color:var(--portal-ink-3)] flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-sm text-[color:var(--portal-ink-3)] text-center py-6">
          لا توجد فترات في هذا النطاق. استخدم النموذج أعلاه لتوليدها.
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([date, list]) => (
            <div key={date} className="rounded-xl border p-3">
              <div className="font-semibold text-sm mb-2">
                {new Date(date + "T00:00:00").toLocaleDateString("ar-SA-u-ca-gregory",
                  { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <ul className="flex flex-wrap gap-2">
                {list.map((s) => {
                  const tone =
                    s.status === "booked" ? "bg-teal-100 text-teal-700"
                    : s.status === "blocked" ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700";
                  return (
                    <li key={s.id} className={`inline-flex items-center gap-2 rounded-full ${tone} px-3 py-1.5 text-xs`}>
                      <span dir="ltr" className="font-mono">
                        {String(s.start_time).slice(0, 5)}
                      </span>
                      <span className="text-[10px] opacity-70">
                        {s.status === "booked" ? "محجوز" : s.status === "blocked" ? "معطّل" : "متاح"}
                      </span>
                      {s.status !== "booked" && (
                        <button
                          type="button" onClick={() => delMut.mutate(s.id)}
                          disabled={delMut.isPending}
                          aria-label="حذف الفترة"
                          className="ms-1 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* =============================== Leaves ==================================== */

const leavesQuery = queryOptions({
  queryKey: ["portal", "doctor-schedule", "leaves"],
  queryFn: () => listMyLeaves(),
  staleTime: 60_000,
});

function LeavesSection() {
  const qc = useQueryClient();
  const { data: leaves = [] } = useQuery(leavesQuery);
  const createFn = useServerFn(createMyLeave);
  const deleteFn = useServerFn(deleteMyLeave);

  const [startDate, setStartDate] = useState(todayIso(1));
  const [endDate, setEndDate] = useState(todayIso(2));
  const [reason, setReason] = useState("");

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { startDate, endDate, allDay: true, reason: reason.trim() || null } }),
    onSuccess: () => {
      toast.success("تم تسجيل الإجازة");
      setReason("");
      qc.invalidateQueries({ queryKey: ["portal", "doctor-schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف الإجازة");
      qc.invalidateQueries({ queryKey: ["portal", "doctor-schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="glass-card p-6">
      <header className="mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <CalendarOff className="h-5 w-5 text-[color:var(--portal-primary)]" />
          الإجازات
        </h2>
        <p className="text-xs text-[color:var(--portal-ink-3)] mt-1">
          حدّد فترات عدم توفّرك — لن يظهر الحجز لهذه الأيام.
        </p>
      </header>

      <div className="p-3 rounded-2xl bg-[color:var(--portal-gradient-soft)] mb-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold">من</label>
            <input type="date" value={startDate} min={todayIso()} onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full h-9 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold">إلى</label>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full h-9 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
          </div>
        </div>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="السبب (اختياري)" maxLength={500}
          className="w-full h-9 rounded-lg border bg-[color:var(--portal-surface)] px-2 text-sm" />
        <button
          type="button" onClick={() => createMut.mutate()} disabled={createMut.isPending}
          className="w-full h-9 rounded-lg text-[color:var(--portal-on-primary)] text-sm font-semibold inline-flex items-center justify-center gap-1.5"
          style={{ background: "var(--portal-gradient)" }}
        >
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          إضافة إجازة
        </button>
      </div>

      {leaves.length === 0 ? (
        <div className="text-xs text-[color:var(--portal-ink-3)] text-center py-4">لا توجد إجازات</div>
      ) : (
        <ul className="space-y-2">
          {leaves.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
              <div>
                <div className="font-semibold">
                  {l.start_date === l.end_date
                    ? l.start_date
                    : `${l.start_date} → ${l.end_date}`}
                </div>
                {l.reason && (
                  <div className="text-xs text-[color:var(--portal-ink-3)] mt-0.5">{l.reason}</div>
                )}
              </div>
              <button
                type="button" onClick={() => deleteMut.mutate(l.id)}
                disabled={deleteMut.isPending}
                className="text-destructive hover:opacity-70"
                aria-label="حذف الإجازة"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ======================= Upcoming appointments ============================= */

const upcomingQuery = queryOptions({
  queryKey: ["portal", "doctor-schedule", "upcoming"],
  queryFn: () => listMyUpcomingAppointments(),
  staleTime: 30_000,
});

function UpcomingAppointmentsSection() {
  const { data: rows = [] } = useQuery(upcomingQuery);
  return (
    <section className="glass-card p-6">
      <header className="mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-[color:var(--portal-primary)]" />
          مواعيدك القادمة
        </h2>
      </header>
      {rows.length === 0 ? (
        <div className="text-xs text-[color:var(--portal-ink-3)] text-center py-4">لا توجد مواعيد قادمة</div>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 12).map((a) => (
            <li key={a.id} className="rounded-xl border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{a.patient_name ?? "—"}</span>
                <span className="text-xs text-[color:var(--portal-ink-3)]" dir="ltr">
                  {a.appointment_date} · {String(a.appointment_time).slice(0, 5)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  a.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-teal-100 text-teal-700"
                }`}>
                  {a.status === "confirmed" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {a.status === "confirmed" ? "مؤكّد" : "جديد"}
                </span>
                {a.patient_phone && (
                  <a href={`tel:${a.patient_phone}`} className="text-[color:var(--portal-primary)]" dir="ltr">
                    {a.patient_phone}
                  </a>
                )}
              </div>
              {a.reason && (
                <div className="mt-1 text-xs text-[color:var(--portal-ink-3)]">{a.reason}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
