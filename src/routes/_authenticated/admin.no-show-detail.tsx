/**
 * /admin/no-show-detail — Detailed list of high no-show risk appointments
 * for a doctor/day window with status, reasons, and full audit trail.
 */
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, Filter, ChevronDown, ChevronRight, User, Phone, Clock } from "lucide-react";
import {
  listHighRiskAppointments,
  type HighRiskAppointment,
} from "@/lib/admin/no-show-detail.functions";
import { listDoctorsLite, listBranchesLite } from "@/lib/admin/no-show-stats.functions";

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const defaultFrom = isoOffset(-14);
const defaultTo = isoOffset(30);

const listQuery = (from: string, to: string, doctorId: string, branchId: string, minRisk: number) =>
  queryOptions({
    queryKey: ["admin", "no-show-detail", from, to, doctorId, branchId, minRisk],
    queryFn: () =>
      listHighRiskAppointments({
        data: {
          from,
          to,
          doctorId: doctorId || null,
          branchId: branchId || null,
          minRisk,
          limit: 200,
        },
      }),
    staleTime: 30_000,
  });

const doctorsQuery = queryOptions({
  queryKey: ["admin", "doctors-lite"],
  queryFn: () => listDoctorsLite(),
  staleTime: 5 * 60_000,
});

const branchesQuery = queryOptions({
  queryKey: ["admin", "branches-lite"],
  queryFn: () => listBranchesLite(),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/_authenticated/admin/no-show-detail")({
  head: () => ({
    meta: [
      { title: "المواعيد عالية المخاطرة | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(listQuery(defaultFrom, defaultTo, "", "", 60)),
  component: NoShowDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">تعذّر تحميل البيانات: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">غير موجود</div>,
});

const STATUS_LABELS: Record<string, string> = {
  new: "جديد",
  confirmed: "مؤكد",
  held: "محجوز مؤقتًا",
  pending_verification: "بانتظار التحقق",
  pending_payment: "بانتظار الدفع",
  checked_in: "تم الحضور",
  in_progress: "قيد الخدمة",
  completed: "مكتمل",
  cancelled: "ملغى",
  no_show: "لم يحضر",
};

function riskTone(risk: number | null): string {
  if (risk == null) return "bg-muted text-muted-foreground";
  if (risk >= 80) return "bg-red-500/15 text-red-800";
  if (risk >= 60) return "bg-amber-500/15 text-amber-900";
  return "bg-green-500/15 text-green-800";
}

function statusTone(s: string): string {
  if (s === "no_show" || s === "cancelled") return "bg-red-500/10 text-red-700";
  if (s === "completed") return "bg-green-500/10 text-green-700";
  if (s === "checked_in" || s === "in_progress") return "bg-blue-500/10 text-blue-700";
  return "bg-muted text-foreground";
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function AppointmentRow({ appt }: { appt: HighRiskAppointment }) {
  const [open, setOpen] = useState(false);
  const cancelAudit = appt.audit.find((a) => a.new_status === "cancelled");
  const noShowAudit = appt.audit.find((a) => a.new_status === "no_show");
  const primaryReason = cancelAudit?.reason ?? noShowAudit?.reason ?? null;

  return (
    <>
      <tr className="border-t border-border/60 hover:bg-muted/30">
        <td className="p-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            aria-expanded={open}
            aria-label={open ? "إخفاء السجل" : "عرض السجل"}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <span>{appt.audit.length}</span>
          </button>
        </td>
        <td className="p-3 font-mono text-xs whitespace-nowrap">
          {appt.appointment_date} · {appt.appointment_time.slice(0, 5)}
        </td>
        <td className="p-3">
          <div className="text-sm font-medium">{appt.patient_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Phone className="h-3 w-3" /> {appt.patient_phone}
          </div>
        </td>
        <td className="p-3 text-sm">{appt.doctor_name_ar ?? "—"}</td>
        <td className="p-3 text-center">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusTone(appt.status)}`}
          >
            {STATUS_LABELS[appt.status] ?? appt.status}
          </span>
        </td>
        <td className="p-3 text-center">
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${riskTone(appt.no_show_risk)}`}
          >
            {appt.no_show_risk ?? "—"}
          </span>
        </td>
        <td
          className="p-3 text-xs text-muted-foreground max-w-[240px] truncate"
          title={primaryReason ?? ""}
        >
          {primaryReason ?? "—"}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={7} className="p-4">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> سجل التدقيق ({appt.audit.length})
            </div>
            {appt.audit.length === 0 ? (
              <div className="text-xs text-muted-foreground">لا توجد أحداث مسجّلة لهذا الموعد.</div>
            ) : (
              <ol className="space-y-2">
                {appt.audit.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-border bg-background p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {a.old_status && (
                          <span className={`px-1.5 py-0.5 rounded ${statusTone(a.old_status)}`}>
                            {STATUS_LABELS[a.old_status] ?? a.old_status}
                          </span>
                        )}
                        <span className="text-muted-foreground">←</span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-semibold ${statusTone(a.new_status ?? "")}`}
                        >
                          {a.new_status ? (STATUS_LABELS[a.new_status] ?? a.new_status) : "—"}
                        </span>
                      </div>
                      <span className="text-muted-foreground font-mono">
                        {fmtDateTime(a.changed_at)}
                      </span>
                    </div>
                    {a.reason && (
                      <div className="mt-1.5 text-foreground whitespace-pre-wrap">{a.reason}</div>
                    )}
                    {a.changed_by && (
                      <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> {a.changed_by}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function NoShowDetailPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [doctorId, setDoctorId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [minRisk, setMinRisk] = useState(60);
  const [applied, setApplied] = useState({
    from: defaultFrom,
    to: defaultTo,
    doctorId: "",
    branchId: "",
    minRisk: 60,
  });

  const { data } = useSuspenseQuery(
    listQuery(applied.from, applied.to, applied.doctorId, applied.branchId, applied.minRisk),
  );
  const { data: doctors = [] } = useQuery(doctorsQuery);
  const { data: branches = [] } = useQuery(branchesQuery);

  const activeDoctor = useMemo(() => {
    if (!applied.doctorId) return "كل الأطباء";
    return doctors.find((d) => d.id === applied.doctorId)?.name_ar ?? applied.doctorId;
  }, [applied.doctorId, doctors]);

  function apply() {
    setApplied({ from, to, doctorId, branchId, minRisk });
  }
  function reset() {
    setFrom(defaultFrom);
    setTo(defaultTo);
    setDoctorId("");
    setBranchId("");
    setMinRisk(60);
    setApplied({ from: defaultFrom, to: defaultTo, doctorId: "", branchId: "", minRisk: 60 });
  }

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-amber-600" /> المواعيد عالية المخاطرة
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          قائمة تفصيلية للمواعيد ذات درجة عدم حضور مرتفعة مع الأسباب وسجل التدقيق الكامل.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
          <Filter className="h-4 w-4" /> الفلاتر
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">من</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">إلى</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">الطبيب</span>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">كل الأطباء</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_ar}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">الفرع</span>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">
              الحد الأدنى للمخاطرة: {minRisk}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minRisk}
              onChange={(e) => setMinRisk(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={apply}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              تطبيق
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              مسح
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          النطاق النشط: {applied.from} → {applied.to} · {activeDoctor} · مخاطرة ≥ {applied.minRisk}{" "}
          · النتائج: {data.length}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-start p-3 w-12">السجل</th>
                <th className="text-start p-3">التاريخ/الوقت</th>
                <th className="text-start p-3">المريض</th>
                <th className="text-start p-3">الطبيب</th>
                <th className="text-center p-3">الحالة</th>
                <th className="text-center p-3">المخاطرة</th>
                <th className="text-start p-3">السبب الأخير</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                    لا توجد مواعيد تتجاوز حد المخاطرة في هذا النطاق.
                  </td>
                </tr>
              ) : (
                data.map((a) => <AppointmentRow key={a.id} appt={a} />)
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
