import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Loader2,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  generateSlots,
  listSlotsAdmin,
  deleteSlot,
} from "@/lib/slots.functions";
import { listDoctorsOverview } from "@/lib/doctors.functions";
import { listBranches } from "@/lib/dashboard.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/availability-management")({
  head: () => ({
    meta: [
      { title: "إدارة فترات التوفّر | مجمع باعشن الطبي" },
      {
        name: "description",
        content:
          "توليد وإدارة فترات المواعيد للأطباء مع التحقق التلقائي من التداخل.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="doctors.manage">
      <AvailabilityManagementPage />
    </RequirePermission>
  ),
});

const STATUS_META: Record<string, { label: string; cls: string }> = {
  available: {
    label: "متاحة",
    cls: "bg-emerald-500/15 text-emerald-700",
  },
  booked: {
    label: "محجوزة",
    cls: "bg-teal-500/15 text-teal-700",
  },
  blocked: {
    label: "معطّلة",
    cls: "bg-amber-500/15 text-amber-700",
  },
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AvailabilityManagementPage() {
  const qc = useQueryClient();

  const listBranchesFn = useServerFn(listBranches);
  const listDoctorsFn = useServerFn(listDoctorsOverview);
  const listSlotsFn = useServerFn(listSlotsAdmin);
  const generateFn = useServerFn(generateSlots);
  const deleteFn = useServerFn(deleteSlot);

  const branchesQ = useQuery({
    queryKey: ["avail-mgmt", "branches"],
    queryFn: () => listBranchesFn(),
  });
  const doctorsQ = useQuery({
    queryKey: ["avail-mgmt", "doctors"],
    queryFn: () => listDoctorsFn({ data: { branchId: null, days: 30 } }),
  });

  const [doctorId, setDoctorId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [date, setDate] = useState<string>(todayIso());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [breakMinutes, setBreakMinutes] = useState(0);

  const slotsQ = useQuery({
    queryKey: ["avail-mgmt", "slots", doctorId, date],
    queryFn: () =>
      listSlotsFn({ data: { doctorId, fromDate: date, toDate: date } }),
    enabled: Boolean(doctorId && date),
  });

  const generateM = useMutation({
    mutationFn: (input: {
      doctorId: string;
      branchId: string | null;
      date: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
      breakMinutes: number;
    }) => generateFn({ data: input }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["avail-mgmt", "slots"] });
      const parts = [
        `أُنشئت ${res.created} فترة`,
        res.skipped ? `تُخطّي ${res.skipped} بسبب التداخل` : null,
      ].filter(Boolean);
      if (res.created > 0) toast.success(parts.join(" • "));
      else toast.warning(parts.join(" • ") || "لم تُنشأ أي فترة.");
    },
    onError: (err: Error) => toast.error(err.message || "تعذّر إنشاء الفترات."),
  });

  const deleteM = useMutation({
    mutationFn: (slotId: string) => deleteFn({ data: { slotId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avail-mgmt", "slots"] });
      toast.success("تم حذف الفترة.");
    },
    onError: (err: Error) => toast.error(err.message || "تعذّر الحذف."),
  });

  const doctorOptions = useMemo(() => {
    const rows = doctorsQ.data ?? [];
    return rows.map((d) => ({
      id: d.doctor_id,
      name: d.name_ar || d.name_en || d.doctor_id,
    }));
  }, [doctorsQ.data]);

  const handleGenerate = () => {
    if (!doctorId) return toast.error("اختر الطبيب أولاً.");
    if (!date) return toast.error("اختر التاريخ.");
    if (endTime <= startTime)
      return toast.error("وقت النهاية يجب أن يكون بعد البداية.");
    if (durationMinutes < 5)
      return toast.error("مدة الفترة يجب ألّا تقلّ عن 5 دقائق.");
    generateM.mutate({
      doctorId,
      branchId: branchId || null,
      date,
      startTime,
      endTime,
      durationMinutes,
      breakMinutes,
    });
  };

  const slots = slotsQ.data?.slots ?? [];
  const counts = useMemo(() => {
    const c = { available: 0, booked: 0, blocked: 0 };
    for (const s of slots) {
      const k = s.status as keyof typeof c;
      if (k in c) c[k]++;
    }
    return c;
  }, [slots]);

  const lastConflicts = generateM.data?.conflicts ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6" dir="rtl">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">إدارة فترات التوفّر</h1>
          <p className="text-sm text-muted-foreground">
            توليد فترات المواعيد لطبيب/تاريخ محدّد، مع تحقّق ضد التداخل قبل
            الحفظ.
          </p>
        </div>
      </header>

      {/* Generator form */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">توليد فترات</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">الطبيب</span>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="rounded-md border bg-background px-3 py-2"
              disabled={doctorsQ.isLoading}
            >
              <option value="">— اختر —</option>
              {doctorOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">الفرع (اختياري)</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="rounded-md border bg-background px-3 py-2"
              disabled={branchesQ.isLoading}
            >
              <option value="">— بدون تحديد —</option>
              {(branchesQ.data ?? []).map(
                (b: { id: string; name_ar?: string | null; name?: string | null }) => (
                  <option key={b.id} value={b.id}>
                    {b.name_ar || b.name || b.id}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">التاريخ</span>
            <input
              type="date"
              value={date}
              min={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">من</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-md border bg-background px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">إلى</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-md border bg-background px-3 py-2"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">مدة الفترة (دقيقة)</span>
            <input
              type="number"
              min={5}
              max={240}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
              className="rounded-md border bg-background px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">استراحة بين الفترات (دقيقة)</span>
            <input
              type="number"
              min={0}
              max={60}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
              className="rounded-md border bg-background px-3 py-2"
            />
          </label>

          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generateM.isPending || !doctorId}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground shadow disabled:opacity-50"
            >
              {generateM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              توليد الفترات
            </button>
          </div>
        </div>

        {lastConflicts.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              تم تخطّي {lastConflicts.length} فترة بسبب التداخل مع فترات قائمة:
            </div>
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
              {lastConflicts.map((c, i) => (
                <li
                  key={i}
                  className="rounded bg-background/60 px-2 py-1 font-mono text-xs"
                >
                  {c.start}–{c.end}{" "}
                  <span className="text-muted-foreground">
                    ({STATUS_META[c.withStatus]?.label ?? c.withStatus})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {generateM.data && generateM.data.created > 0 && lastConflicts.length === 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            تم إنشاء {generateM.data.created} فترة بنجاح.
          </div>
        )}
      </section>

      {/* Slots list */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            فترات {date}
            {doctorId && doctorOptions.find((d) => d.id === doctorId)
              ? ` — ${doctorOptions.find((d) => d.id === doctorId)!.name}`
              : ""}
          </h2>
          <div className="flex gap-2 text-xs">
            <span className={`rounded-full px-2 py-1 ${STATUS_META.available.cls}`}>
              متاحة: {counts.available}
            </span>
            <span className={`rounded-full px-2 py-1 ${STATUS_META.booked.cls}`}>
              محجوزة: {counts.booked}
            </span>
            <span className={`rounded-full px-2 py-1 ${STATUS_META.blocked.cls}`}>
              معطّلة: {counts.blocked}
            </span>
          </div>
        </div>

        {!doctorId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            اختر طبيبًا لعرض فتراته.
          </p>
        ) : slotsQ.isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            لا توجد فترات لهذا اليوم. استخدم النموذج أعلاه لتوليدها.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">الوقت</th>
                  <th className="p-2 font-medium">الحالة</th>
                  <th className="p-2 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => {
                  const meta = STATUS_META[s.status as string] ?? {
                    label: s.status,
                    cls: "bg-muted",
                  };
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="p-2 font-mono">
                        {String(s.start_time).slice(0, 5)} –{" "}
                        {String(s.end_time).slice(0, 5)}
                      </td>
                      <td className="p-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          disabled={
                            s.status === "booked" ||
                            (deleteM.isPending && deleteM.variables === s.id)
                          }
                          onClick={() => {
                            if (
                              confirm(
                                `حذف الفترة ${String(s.start_time).slice(0, 5)}؟`,
                              )
                            ) {
                              deleteM.mutate(s.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-rose-700 hover:bg-rose-500/10 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
