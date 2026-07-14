import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  LayoutList,
  Grid3x3,
  Columns3,
  User2,
  Stethoscope,
  Filter,
} from "lucide-react";
import {
  listAppointmentsRange,
  rescheduleAppointment,
  listDoctorsForCalendar,
  type CalendarAppointment,
} from "@/lib/calendar.functions";
import { listBranches } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "التقويم | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CalendarPage,
});

type ViewMode = "day" | "week" | "month";

const SLOT_MINUTES = 30;
const START_HOUR = 8;
const END_HOUR = 22;

const STATUS_STYLE: Record<CalendarAppointment["status"], string> = {
  new: "bg-teal-100 text-teal-900 border-teal-300",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  completed: "bg-slate-100 text-slate-700 border-slate-300",
  cancelled: "bg-rose-100 text-rose-700 border-rose-300 line-through opacity-70",
  no_show: "bg-amber-100 text-amber-900 border-amber-300 opacity-80",
};

const STATUS_LABEL: Record<CalendarAppointment["status"], string> = {
  new: "جديد",
  confirmed: "مؤكد",
  completed: "منتهي",
  cancelled: "ملغي",
  no_show: "لم يحضر",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  // Saudi/Arabic week starts Saturday
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day - 6 + 7) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function buildSlots() {
  const slots: string[] = [];
  for (let h = START_HOUR; h < END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push(`${pad(h)}:${pad(m)}`);
    }
  }
  return slots;
}
function timeToSlot(time: string): string {
  // Snap 'HH:MM(:SS)' down to nearest SLOT_MINUTES
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (h < START_HOUR) return `${pad(START_HOUR)}:00`;
  if (h >= END_HOUR) return `${pad(END_HOUR - 1)}:${pad(60 - SLOT_MINUTES)}`;
  const snapped = Math.floor(m / SLOT_MINUTES) * SLOT_MINUTES;
  return `${pad(h)}:${pad(snapped)}`;
}

function CalendarPage() {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [branchId, setBranchId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);

  const listRangeFn = useServerFn(listAppointmentsRange);
  const rescheduleFn = useServerFn(rescheduleAppointment);
  const listDoctorsFn = useServerFn(listDoctorsForCalendar);
  const listBranchesFn = useServerFn(listBranches);
  const qc = useQueryClient();

  const branchesQ = useQuery({
    queryKey: ["calendar", "branches"],
    queryFn: () => listBranchesFn(),
  });
  const doctorsQ = useQuery({
    queryKey: ["calendar", "doctors"],
    queryFn: () => listDoctorsFn(),
  });

  const range = useMemo(() => {
    if (view === "day") return { from: fmtDate(anchor), to: fmtDate(anchor) };
    if (view === "week") {
      const s = startOfWeek(anchor);
      return { from: fmtDate(s), to: fmtDate(addDays(s, 6)) };
    }
    const s = startOfMonth(anchor);
    const e = endOfMonth(anchor);
    // Extend to full weeks for month grid
    const gridStart = startOfWeek(s);
    const gridEndWeek = startOfWeek(e);
    const gridEnd = addDays(gridEndWeek, 6);
    return { from: fmtDate(gridStart), to: fmtDate(gridEnd) };
  }, [view, anchor]);

  const apptsQ = useQuery({
    queryKey: ["calendar", "appts", range.from, range.to, branchId, doctorId],
    queryFn: () =>
      listRangeFn({ data: { from: range.from, to: range.to, branchId, doctorId } }),
  });

  const reschedule = useMutation({
    mutationFn: (v: { id: string; date: string; time: string }) =>
      rescheduleFn({ data: v }),
    onSuccess: () => {
      toast.success("تم إعادة الجدولة");
      qc.invalidateQueries({ queryKey: ["calendar", "appts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إعادة الجدولة"),
  });

  const shift = (units: number) => {
    if (view === "day") setAnchor((d) => addDays(d, units));
    else if (view === "week") setAnchor((d) => addDays(d, 7 * units));
    else setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + units, 1));
  };

  const titleLabel = useMemo(() => {
    const opts: Intl.DateTimeFormatOptions =
      view === "month"
        ? { year: "numeric", month: "long" }
        : view === "week"
        ? { year: "numeric", month: "long" }
        : { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    if (view === "week") {
      const s = startOfWeek(anchor);
      const e = addDays(s, 6);
      const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "long" });
      return `${fmt.format(s)} — ${fmt.format(e)} ${e.getFullYear()}`;
    }
    return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", opts).format(anchor);
  }, [view, anchor]);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    (apptsQ.data ?? []).forEach((a) => {
      const key = `${a.appointment_date}|${timeToSlot(a.appointment_time)}`;
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    });
    return map;
  }, [apptsQ.data]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    (apptsQ.data ?? []).forEach((a) => {
      const list = map.get(a.appointment_date) ?? [];
      list.push(a);
      map.set(a.appointment_date, list);
    });
    return map;
  }, [apptsQ.data]);

  const handleDrop = (appt: CalendarAppointment, date: string, time: string) => {
    if (appt.appointment_date === date && timeToSlot(appt.appointment_time) === time) return;
    reschedule.mutate({ id: appt.id, date, time });
  };

  const slots = useMemo(buildSlots, []);

  return (
    <div className="container-app py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="rounded-md border border-input px-2.5 py-1.5 text-sm hover:bg-muted"
          >
            ← الإدارة
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarIcon className="h-6 w-6 text-primary" /> التقويم
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-input">
            {(
              [
                { v: "day", label: "يوم", Icon: LayoutList },
                { v: "week", label: "أسبوع", Icon: Columns3 },
                { v: "month", label: "شهر", Icon: Grid3x3 },
              ] as const
            ).map(({ v, label, Icon }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm ${
                  view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1 rounded-md border border-input">
            <button
              onClick={() => shift(-1)}
              className="px-2 py-1.5 hover:bg-muted"
              aria-label="السابق"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                setAnchor(d);
              }}
              className="border-x border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              اليوم
            </button>
            <button
              onClick={() => shift(1)}
              className="px-2 py-1.5 hover:bg-muted"
              aria-label="التالي"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-sm">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value || null)}
              className="bg-transparent text-sm outline-none"
            >
              <option value="">كل الفروع</option>
              {(branchesQ.data ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-sm">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            <select
              value={doctorId ?? ""}
              onChange={(e) => setDoctorId(e.target.value || null)}
              className="bg-transparent text-sm outline-none"
            >
              <option value="">كل الأطباء</option>
              {(doctorsQ.data ?? [])
                .filter((d: any) => !branchId || !d.branch_id || d.branch_id === branchId)
                .map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name_ar}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{titleLabel}</h2>
        <div className="text-xs text-muted-foreground">
          {apptsQ.isFetching ? "جارٍ التحميل…" : `${apptsQ.data?.length ?? 0} حجز`}
        </div>
      </div>

      {apptsQ.isError && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(apptsQ.error as any)?.message ?? "تعذّر تحميل المواعيد."}
        </div>
      )}

      {view === "day" && (
        <DayView
          date={fmtDate(anchor)}
          slots={slots}
          grouped={grouped}
          onDrop={handleDrop}
        />
      )}
      {view === "week" && (
        <WeekView
          weekStart={startOfWeek(anchor)}
          slots={slots}
          grouped={grouped}
          onDrop={handleDrop}
        />
      )}
      {view === "month" && (
        <MonthView anchor={anchor} byDay={byDay} onDrop={handleDrop} setAnchor={setAnchor} setView={setView} />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>الحالات:</span>
        {(Object.keys(STATUS_LABEL) as CalendarAppointment["status"][]).map((s) => (
          <span
            key={s}
            className={`inline-flex items-center rounded border px-2 py-0.5 ${STATUS_STYLE[s]}`}
          >
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="mr-auto">اسحب البطاقة إلى خانة جديدة لإعادة الجدولة.</span>
      </div>
    </div>
  );
}

/* ---------------- Appointment Card ---------------- */
function ApptCard({ appt }: { appt: CalendarAppointment }) {
  const draggable = !["completed", "cancelled", "no_show"].includes(appt.status);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify(appt));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`mb-1 rounded-md border px-2 py-1 text-xs shadow-sm ${STATUS_STYLE[appt.status]} ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"
      }`}
      title={`${appt.patient_name} · ${STATUS_LABEL[appt.status]}`}
    >
      <div className="flex items-center gap-1 font-semibold">
        <span className="tabular-nums">{appt.appointment_time.slice(0, 5)}</span>
        <span className="truncate">{appt.patient_name}</span>
      </div>
      {appt.doctors?.name_ar && (
        <div className="flex items-center gap-1 opacity-80">
          <User2 className="h-3 w-3" />
          <span className="truncate">{appt.doctors.name_ar}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Drop Cell ---------------- */
function DropCell({
  date,
  time,
  onDrop,
  children,
  className = "",
}: {
  date: string;
  time: string;
  onDrop: (appt: CalendarAppointment, date: string, time: string) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!hover) setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        try {
          const raw = e.dataTransfer.getData("text/plain");
          if (!raw) return;
          const appt = JSON.parse(raw) as CalendarAppointment;
          onDrop(appt, date, time);
        } catch {
          /* ignore */
        }
      }}
      className={`min-h-[52px] border-b border-dashed border-border/60 p-1 transition-colors ${
        hover ? "bg-primary/10 ring-1 ring-primary/40" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------- Day view ---------------- */
function DayView({
  date,
  slots,
  grouped,
  onDrop,
}: {
  date: string;
  slots: string[];
  grouped: Map<string, CalendarAppointment[]>;
  onDrop: (appt: CalendarAppointment, date: string, time: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-[80px_1fr]">
        <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
          الوقت
        </div>
        <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
          الحجوزات
        </div>
        {slots.map((t) => {
          const list = grouped.get(`${date}|${t}`) ?? [];
          return (
            <div className="contents" key={t}>
              <div className="border-b border-border/60 bg-muted/20 px-3 py-2 text-xs font-medium tabular-nums text-muted-foreground">
                {t}
              </div>
              <DropCell date={date} time={t} onDrop={onDrop}>
                {list.map((a) => (
                  <ApptCard key={a.id} appt={a} />
                ))}
              </DropCell>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Week view ---------------- */
function WeekView({
  weekStart,
  slots,
  grouped,
  onDrop,
}: {
  weekStart: Date;
  slots: string[];
  grouped: Map<string, CalendarAppointment[]>;
  onDrop: (appt: CalendarAppointment, date: string, time: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = fmtDate(new Date());
  const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    weekday: "short",
    day: "numeric",
  });
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="grid min-w-[900px]" style={{ gridTemplateColumns: "70px repeat(7, minmax(0, 1fr))" }}>
        <div className="border-b border-border bg-muted/40 px-2 py-2 text-xs font-semibold text-muted-foreground">
          الوقت
        </div>
        {days.map((d) => {
          const isToday = fmtDate(d) === todayStr;
          return (
            <div
              key={d.toISOString()}
              className={`border-b border-l border-border px-2 py-2 text-center text-xs font-semibold ${
                isToday ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground"
              }`}
            >
              {dayFmt.format(d)}
            </div>
          );
        })}
        {slots.map((t) => (
          <div className="contents" key={t}>
            <div className="border-b border-border/60 bg-muted/20 px-2 py-2 text-xs tabular-nums text-muted-foreground">
              {t}
            </div>
            {days.map((d) => {
              const key = `${fmtDate(d)}|${t}`;
              const list = grouped.get(key) ?? [];
              return (
                <DropCell
                  key={key}
                  date={fmtDate(d)}
                  time={t}
                  onDrop={onDrop}
                  className="border-l border-border/60"
                >
                  {list.map((a) => (
                    <ApptCard key={a.id} appt={a} />
                  ))}
                </DropCell>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Month view ---------------- */
function MonthView({
  anchor,
  byDay,
  onDrop,
  setAnchor,
  setView,
}: {
  anchor: Date;
  byDay: Map<string, CalendarAppointment[]>;
  onDrop: (appt: CalendarAppointment, date: string, time: string) => void;
  setAnchor: (d: Date) => void;
  setView: (v: ViewMode) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(anchor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const todayStr = fmtDate(new Date());
  const monthIdx = anchor.getMonth();
  const dowFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { weekday: "short" });
  const headers = Array.from({ length: 7 }, (_, i) => dowFmt.format(addDays(gridStart, i)));
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {headers.map((h, i) => (
          <div key={i} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const ds = fmtDate(d);
          const list = byDay.get(ds) ?? [];
          const outside = d.getMonth() !== monthIdx;
          const isToday = ds === todayStr;
          return (
            <DropCell
              key={ds}
              date={ds}
              time={"09:00"}
              onDrop={onDrop}
              className={`min-h-[110px] border-l border-t border-border/60 ${
                outside ? "bg-muted/20 opacity-60" : ""
              } ${isToday ? "ring-1 ring-inset ring-primary" : ""}`}
            >
              <button
                onClick={() => {
                  setAnchor(d);
                  setView("day");
                }}
                className="mb-1 block text-xs font-semibold tabular-nums text-foreground/80 hover:text-primary"
              >
                {d.getDate()}
              </button>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((a) => (
                  <ApptCard key={a.id} appt={a} />
                ))}
                {list.length > 3 && (
                  <div className="text-[10px] font-medium text-muted-foreground">
                    +{list.length - 3} حجز آخر
                  </div>
                )}
              </div>
            </DropCell>
          );
        })}
      </div>
    </div>
  );
}
