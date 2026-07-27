import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Stethoscope,
  Users,
  Calendar as CalendarIcon,
  Plane,
  Plus,
  Trash2,
  Building2,
  Filter,
  Activity,
} from "lucide-react";
import {
  listDoctorsOverview,
  listDoctorAvailability,
  createDoctorAvailability,
  deleteDoctorAvailability,
  listDoctorLeaves,
  createDoctorLeave,
  deleteDoctorLeave,
  listSpecialtiesMini,
  type DoctorOccupancy,
  type DoctorLeave,
} from "@/lib/doctors.functions";
import { listBranches } from "@/lib/dashboard.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/doctors-management")({
  head: () => ({
    meta: [{ title: "إدارة الأطباء | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <RequirePermission anyOf="doctors.manage">
      <DoctorsManagementPage />
    </RequirePermission>
  ),
});

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function DoctorsManagementPage() {
  const [branchId, setBranchId] = useState<string | null>(null);
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "schedule" | "leaves">("overview");

  const listBranchesFn = useServerFn(listBranches);
  const listOverviewFn = useServerFn(listDoctorsOverview);
  const listSpecialtiesFn = useServerFn(listSpecialtiesMini);

  const branchesQ = useQuery({ queryKey: ["dm", "branches"], queryFn: () => listBranchesFn() });
  const specialtiesQ = useQuery({
    queryKey: ["dm", "specialties"],
    queryFn: () => listSpecialtiesFn(),
  });

  const overviewQ = useQuery({
    queryKey: ["dm", "overview", branchId, days],
    queryFn: () => listOverviewFn({ data: { branchId, days } }),
  });

  const filtered = useMemo(() => {
    const rows = overviewQ.data ?? [];
    return specialtyId ? rows.filter((r) => r.specialty_id === specialtyId) : rows;
  }, [overviewQ.data, specialtyId]);

  const selectedDoc = filtered.find((d) => d.doctor_id === selected) ?? filtered[0] ?? null;
  const activeId = selectedDoc?.doctor_id ?? null;

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
            <Stethoscope className="h-6 w-6 text-primary" /> إدارة الأطباء
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
            value={branchId}
            onChange={setBranchId}
            options={[
              { value: "", label: "كل الفروع" },
              ...((branchesQ.data ?? []) as any[]).map((b) => ({ value: b.id, label: b.name_ar })),
            ]}
          />
          <FilterSelect
            icon={<Filter className="h-4 w-4 text-muted-foreground" />}
            value={specialtyId}
            onChange={setSpecialtyId}
            options={[
              { value: "", label: "كل التخصصات" },
              ...((specialtiesQ.data ?? []) as any[]).map((s) => ({
                value: s.id,
                label: s.name_ar,
              })),
            ]}
          />
          <div className="inline-flex items-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-sm">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="bg-transparent text-sm outline-none"
            >
              <option value={7}>آخر 7 أيام</option>
              <option value={30}>آخر 30 يوم</option>
              <option value={90}>آخر 90 يوم</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Left: doctors list */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" /> الأطباء
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{filtered.length}</span>
            </span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {overviewQ.isLoading && (
              <div className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</div>
            )}
            {overviewQ.isError && (
              <div className="p-4 text-sm text-destructive">
                {(overviewQ.error as any)?.message ?? "خطأ"}
              </div>
            )}
            {filtered.map((d) => {
              const active = d.doctor_id === activeId;
              return (
                <button
                  key={d.doctor_id}
                  onClick={() => {
                    setSelected(d.doctor_id);
                  }}
                  className={`flex w-full flex-col gap-1 border-b border-border/60 px-3 py-2.5 text-right transition ${
                    active ? "bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{d.name_ar}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        d.is_active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {d.is_active ? "نشط" : "موقوف"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{d.specialty_name_ar ?? "بدون تخصص"}</span>
                    <span className="tabular-nums">
                      {d.booked}/{d.capacity} · {d.occupancy_pct}%
                    </span>
                  </div>
                  <OccupancyBar pct={Number(d.occupancy_pct)} />
                </button>
              );
            })}
            {!overviewQ.isLoading && filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">لا يوجد أطباء</div>
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className="rounded-lg border border-border bg-card">
          {!selectedDoc ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              اختر طبيبًا لعرض التفاصيل.
            </div>
          ) : (
            <>
              <div className="border-b border-border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{selectedDoc.name_ar}</div>
                    <div className="text-xs text-muted-foreground">{selectedDoc.name_en}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <Metric label="محجوز" value={selectedDoc.booked} />
                    <Metric label="السعة" value={selectedDoc.capacity} />
                    <Metric label="الإشغال" value={`${selectedDoc.occupancy_pct}%`} accent />
                    <Metric label="أيام إجازة" value={selectedDoc.leave_days} />
                  </div>
                </div>
                <div className="mt-3 flex gap-2 border-b border-border/40 -mb-3">
                  {(
                    [
                      { v: "overview", label: "نظرة عامة", Icon: Activity },
                      { v: "schedule", label: "الجدول الأسبوعي", Icon: CalendarIcon },
                      { v: "leaves", label: "الإجازات", Icon: Plane },
                    ] as const
                  ).map(({ v, label, Icon }) => (
                    <button
                      key={v}
                      onClick={() => setTab(v)}
                      className={`inline-flex items-center gap-1.5 border-b-2 px-3 pb-2 text-sm ${
                        tab === v
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4">
                {tab === "overview" && <OverviewPanel doc={selectedDoc} days={days} />}
                {tab === "schedule" && (
                  <SchedulePanel
                    doctorId={selectedDoc.doctor_id}
                    branchId={selectedDoc.branch_id}
                  />
                )}
                {tab === "leaves" && (
                  <LeavesPanel
                    doctorId={selectedDoc.doctor_id}
                    branchId={selectedDoc.branch_id}
                    onMutated={() => overviewQ.refetch()}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function FilterSelect({
  icon,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-sm">
      {icon}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="bg-transparent text-sm outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function OccupancyBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const color =
    p >= 85 ? "bg-rose-500" : p >= 60 ? "bg-amber-500" : p > 0 ? "bg-emerald-500" : "bg-muted";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${color}`} style={{ width: `${p}%` }} />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-border px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`tabular-nums font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

/* ---------- Overview panel ---------- */
function OverviewPanel({ doc, days }: { doc: DoctorOccupancy; days: number }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border p-4">
        <div className="mb-1 text-sm font-semibold">نسبة الإشغال آخر {days} يوم</div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-3xl font-bold text-primary tabular-nums">{doc.occupancy_pct}%</span>
          <span className="text-xs text-muted-foreground">
            {doc.booked} من أصل {doc.capacity} فترة متاحة
          </span>
        </div>
        <OccupancyBar pct={Number(doc.occupancy_pct)} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBox title="مواعيد محجوزة" value={doc.booked} />
        <StatBox title="فترات متاحة" value={doc.capacity} />
        <StatBox title="أيام الإجازة" value={doc.leave_days} />
        <StatBox title="الحالة" value={doc.is_active ? "نشط" : "موقوف"} />
      </div>

      <p className="text-xs text-muted-foreground">
        السعة محسوبة من الجدول الأسبوعي مطروحًا منها أيام الإجازة المسجّلة. أضف/عدّل الجدول من تبويب
        "الجدول الأسبوعي" والإجازات من تبويب "الإجازات".
      </p>
    </div>
  );
}
function StatBox({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

/* ---------- Schedule panel ---------- */
function SchedulePanel({ doctorId, branchId }: { doctorId: string; branchId: string | null }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listDoctorAvailability);
  const createFn = useServerFn(createDoctorAvailability);
  const delFn = useServerFn(deleteDoctorAvailability);

  const q = useQuery({
    queryKey: ["dm", "avail", doctorId],
    queryFn: () => listFn({ data: { doctorId } }),
  });

  const [form, setForm] = useState({
    weekday: 0,
    startTime: "09:00",
    endTime: "13:00",
    slotMinutes: 30,
  });

  const createM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          doctorId,
          branchId,
          weekday: form.weekday,
          startTime: form.startTime,
          endTime: form.endTime,
          slotMinutes: form.slotMinutes,
        },
      }),
    onSuccess: () => {
      toast.success("تمت إضافة الفترة");
      qc.invalidateQueries({ queryKey: ["dm", "avail", doctorId] });
      qc.invalidateQueries({ queryKey: ["dm", "overview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطأ"),
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["dm", "avail", doctorId] });
      qc.invalidateQueries({ queryKey: ["dm", "overview"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطأ"),
  });

  const grouped = useMemo(() => {
    const m: Record<number, any[]> = {};
    (q.data ?? []).forEach((r: any) => {
      (m[r.weekday] ??= []).push(r);
    });
    return m;
  }, [q.data]);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createM.mutate();
        }}
        className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-5"
      >
        <label className="col-span-2 md:col-span-1">
          <span className="mb-1 block text-xs text-muted-foreground">اليوم</span>
          <select
            value={form.weekday}
            onChange={(e) => setForm({ ...form, weekday: parseInt(e.target.value, 10) })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            {WEEKDAYS.map((w, i) => (
              <option key={i} value={i}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">من</span>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">إلى</span>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">مدة الفترة (د)</span>
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={form.slotMinutes}
            onChange={(e) =>
              setForm({ ...form, slotMinutes: parseInt(e.target.value || "30", 10) })
            }
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={createM.isPending}
          className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 md:col-span-1"
        >
          <Plus className="h-4 w-4" /> إضافة فترة
        </button>
      </form>

      {q.isLoading && <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>}
      {q.isError && (
        <div className="text-sm text-destructive">{(q.error as any)?.message ?? "خطأ"}</div>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {WEEKDAYS.map((w, i) => {
          const list = grouped[i] ?? [];
          return (
            <div key={i} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">{w}</span>
                <span className="text-xs text-muted-foreground">{list.length} فترة</span>
              </div>
              {list.length === 0 && <div className="text-xs text-muted-foreground">لا يوجد</div>}
              <ul className="space-y-1">
                {list.map((s: any) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded border border-border/60 bg-muted/20 px-2 py-1 text-sm"
                  >
                    <span className="tabular-nums">
                      {s.start_time.slice(0, 5)} — {s.end_time.slice(0, 5)}
                      <span className="mx-2 text-xs text-muted-foreground">
                        · {s.slot_minutes} د
                      </span>
                    </span>
                    <button
                      onClick={() => delM.mutate(s.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="حذف"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Leaves panel ---------- */
function LeavesPanel({
  doctorId,
  branchId,
  onMutated,
}: {
  doctorId: string;
  branchId: string | null;
  onMutated: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listDoctorLeaves);
  const createFn = useServerFn(createDoctorLeave);
  const delFn = useServerFn(deleteDoctorLeave);

  const today = new Date();
  const from = fmtDate(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const to = fmtDate(new Date(today.getFullYear(), today.getMonth() + 6, 0));

  const q = useQuery({
    queryKey: ["dm", "leaves", doctorId, from, to],
    queryFn: () => listFn({ data: { doctorId, from, to, branchId: null } }),
  });

  const [form, setForm] = useState({
    startDate: fmtDate(today),
    endDate: fmtDate(today),
    reason: "",
  });

  const createM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          doctorId,
          branchId,
          startDate: form.startDate,
          endDate: form.endDate,
          allDay: true,
          reason: form.reason.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("تمت إضافة الإجازة");
      setForm({ ...form, reason: "" });
      qc.invalidateQueries({ queryKey: ["dm", "leaves", doctorId] });
      onMutated();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطأ"),
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف الإجازة");
      qc.invalidateQueries({ queryKey: ["dm", "leaves", doctorId] });
      onMutated();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطأ"),
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createM.mutate();
        }}
        className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-4"
      >
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">من تاريخ</span>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-xs text-muted-foreground">إلى تاريخ</span>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            required
          />
        </label>
        <label className="md:col-span-1">
          <span className="mb-1 block text-xs text-muted-foreground">السبب (اختياري)</span>
          <input
            type="text"
            value={form.reason}
            maxLength={500}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            placeholder="سفر، مؤتمر…"
          />
        </label>
        <button
          type="submit"
          disabled={createM.isPending}
          className="inline-flex items-center justify-center gap-1.5 self-end rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> تسجيل إجازة
        </button>
      </form>

      {q.isLoading && <div className="text-sm text-muted-foreground">جارٍ التحميل…</div>}
      {q.isError && (
        <div className="text-sm text-destructive">{(q.error as any)?.message ?? "خطأ"}</div>
      )}

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="px-3 py-2 text-right">الفترة</th>
              <th className="px-3 py-2 text-right">الأيام</th>
              <th className="px-3 py-2 text-right">السبب</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((l: DoctorLeave) => {
              const start = new Date(l.start_date);
              const end = new Date(l.end_date);
              const days = Math.round((+end - +start) / (1000 * 60 * 60 * 24)) + 1;
              return (
                <tr key={l.id} className="border-t border-border/60">
                  <td className="px-3 py-2 tabular-nums">
                    {l.start_date} — {l.end_date}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{days}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.reason ?? "—"}</td>
                  <td className="px-3 py-2 text-left">
                    <button
                      onClick={() => delM.mutate(l.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="حذف"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {(q.data ?? []).length === 0 && !q.isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  لا توجد إجازات مسجّلة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
