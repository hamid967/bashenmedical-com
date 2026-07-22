import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAppointmentsReport,
  getDoctorOccupancyReport,
  getPharmacyOrdersReport,
  getPatientsReport,
  type AppointmentReportRow,
  type DoctorOccupancyRow,
  type PharmacyOrderRow,
  type PatientReportRow,
} from "@/lib/reports.functions";
import { listBranches } from "@/lib/dashboard.functions";
import { listDoctorsForCalendar } from "@/lib/calendar.functions";
import { exportCsv, exportXlsx, exportPdf, type Column } from "@/lib/export-utils";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "التقارير | مجمع باعشن الطبي" },
      { name: "description", content: "تقارير قابلة للتصدير Excel وPDF وCSV" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="reports.view">
      <ReportsPage />
    </RequirePermission>
  ),
});

type ReportType = "appointments" | "occupancy" | "pharmacy" | "patients";

const APPT_STATUSES = [
  { v: "new", ar: "جديد" },
  { v: "confirmed", ar: "مؤكد" },
  { v: "completed", ar: "مكتمل" },
  { v: "cancelled", ar: "ملغى" },
  { v: "no_show", ar: "لم يحضر" },
];

const PHARMACY_STATUSES = [
  { v: "new", ar: "جديد" },
  { v: "in_progress", ar: "قيد التنفيذ" },
  { v: "ready", ar: "جاهز" },
  { v: "delivered", ar: "تم التسليم" },
  { v: "cancelled", ar: "ملغى" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function ReportsPage() {
  const router = useRouter();
  const [type, setType] = useState<ReportType>("appointments");
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [branchId, setBranchId] = useState<string>("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [days, setDays] = useState<number>(30);

  const branchesFn = useServerFn(listBranches);
  const doctorsFn = useServerFn(listDoctorsForCalendar);
  const apptFn = useServerFn(getAppointmentsReport);
  const occFn = useServerFn(getDoctorOccupancyReport);
  const pharmFn = useServerFn(getPharmacyOrdersReport);
  const patientsFn = useServerFn(getPatientsReport);

  const branchesQ = useQuery({ queryKey: ["reports", "branches"], queryFn: () => branchesFn() });
  const doctorsQ = useQuery({ queryKey: ["reports", "doctors"], queryFn: () => doctorsFn() });

  const query = useQuery({
    queryKey: ["reports", type, from, to, branchId, doctorId, status, gender, days],
    queryFn: async () => {
      const b = branchId || null;
      const d = doctorId || null;
      const s = status || null;
      if (type === "appointments") {
        return {
          kind: "appointments" as const,
          rows: await apptFn({ data: { from, to, branchId: b, doctorId: d, status: s } }),
        };
      }
      if (type === "occupancy") {
        return { kind: "occupancy" as const, rows: await occFn({ data: { branchId: b, days } }) };
      }
      if (type === "pharmacy") {
        return {
          kind: "pharmacy" as const,
          rows: await pharmFn({ data: { from, to, branchId: b, status: s } }),
        };
      }
      return {
        kind: "patients" as const,
        rows: await patientsFn({ data: { from, to, branchId: b, gender: gender || null } }),
      };
    },
    staleTime: 30_000,
  });

  const branchName = useMemo(() => {
    const b = branchesQ.data?.find((x) => x.id === branchId);
    return b?.name_ar ?? "الكل";
  }, [branchesQ.data, branchId]);

  const rowsCount = query.data?.rows?.length ?? 0;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  }

  function exportNow(fmt: "csv" | "xlsx" | "pdf") {
    if (!query.data || rowsCount === 0) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    const meta: Record<string, string> = { الفرع: branchName, من: from, إلى: to };
    if (type === "occupancy") {
      meta["الفترة"] = `آخر ${days} يوم`;
    }
    if (status)
      meta["الحالة"] =
        APPT_STATUSES.concat(PHARMACY_STATUSES).find((s) => s.v === status)?.ar ?? status;

    let cfg:
      | {
          title: string;
          file: string;
          cols: Column<AppointmentReportRow>[];
          rows: AppointmentReportRow[];
        }
      | {
          title: string;
          file: string;
          cols: Column<DoctorOccupancyRow>[];
          rows: DoctorOccupancyRow[];
        }
      | { title: string; file: string; cols: Column<PharmacyOrderRow>[]; rows: PharmacyOrderRow[] }
      | { title: string; file: string; cols: Column<PatientReportRow>[]; rows: PatientReportRow[] };

    if (query.data.kind === "appointments") {
      cfg = {
        title: "تقرير الحجوزات",
        file: `appointments-${stamp}`,
        rows: query.data.rows,
        cols: APPT_COLS,
      };
    } else if (query.data.kind === "occupancy") {
      cfg = {
        title: "تقرير إشغال الأطباء",
        file: `occupancy-${stamp}`,
        rows: query.data.rows,
        cols: OCC_COLS,
      };
    } else if (query.data.kind === "pharmacy") {
      cfg = {
        title: "تقرير طلبات الصيدلية",
        file: `pharmacy-${stamp}`,
        rows: query.data.rows,
        cols: PHARM_COLS,
      };
    } else {
      cfg = {
        title: "تقرير المرضى",
        file: `patients-${stamp}`,
        rows: query.data.rows,
        cols: PATIENT_COLS,
      };
    }

    // Type-erase for exporters (all Column<T> arrays are structurally compatible for row-in row-out use)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cols = cfg.cols as Column<any>[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = cfg.rows as any[];
    if (fmt === "csv") exportCsv(cfg.file, cols, rows);
    else if (fmt === "xlsx") exportXlsx(cfg.file, cols, rows, cfg.title);
    else
      exportPdf({
        filename: cfg.file,
        title: cfg.title,
        subtitle: `${meta["من"] ? `من ${meta["من"]} إلى ${meta["إلى"]}` : ""}`,
        cols,
        rows,
        meta,
      });
    toast.success(`تم تصدير ${rows.length} سجلًا (${fmt.toUpperCase()})`);
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-7xl p-6 md:p-10 space-y-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">التقارير القابلة للتصدير</h1>
              <p className="text-xs text-muted-foreground">
                تصدير Excel و PDF و CSV مع احترام الفلاتر
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              <ArrowRight className="h-4 w-4" /> لوحة التحكم
            </Link>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
            >
              <LogOut className="h-4 w-4" /> خروج
            </button>
          </div>
        </div>

        {/* Report type tabs */}
        <Tabs value={type} onValueChange={(v) => setType(v as ReportType)} className="mb-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="appointments">الحجوزات</TabsTrigger>
            <TabsTrigger value="occupancy">إشغال الأطباء</TabsTrigger>
            <TabsTrigger value="pharmacy">طلبات الصيدلية</TabsTrigger>
            <TabsTrigger value="patients">المرضى</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="mb-6 rounded-xl border bg-card p-5">
          <div className="grid gap-3 md:grid-cols-4">
            {type !== "occupancy" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">من تاريخ</label>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">إلى تاريخ</label>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  />
                </div>
              </>
            )}
            {type === "occupancy" && (
              <div>
                <label className="mb-1 block text-xs font-medium">الفترة (أيام)</label>
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                    <option key={d} value={d}>
                      آخر {d} يوم
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium">الفرع</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="">كل الفروع</option>
                {branchesQ.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_ar}
                  </option>
                ))}
              </select>
            </div>

            {type === "appointments" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">الطبيب</label>
                  <select
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">كل الأطباء</option>
                    {doctorsQ.data
                      ?.filter((d) => !branchId || d.branch_id === branchId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name_ar}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">الحالة</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">كل الحالات</option>
                    {APPT_STATUSES.map((s) => (
                      <option key={s.v} value={s.v}>
                        {s.ar}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {type === "pharmacy" && (
              <div>
                <label className="mb-1 block text-xs font-medium">الحالة</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">كل الحالات</option>
                  {PHARMACY_STATUSES.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.ar}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {type === "patients" && (
              <div>
                <label className="mb-1 block text-xs font-medium">الجنس</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">الكل</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Actions + count */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {query.isLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ التحميل…
              </span>
            ) : query.isError ? (
              <span className="text-destructive">
                تعذّر تحميل البيانات: {(query.error as Error).message}
              </span>
            ) : (
              <span>
                عدد السجلات: <b>{rowsCount}</b>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportNow("csv")}
              disabled={!rowsCount}
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              onClick={() => exportNow("xlsx")}
              disabled={!rowsCount}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </button>
            <button
              onClick={() => exportNow("pdf")}
              disabled={!rowsCount}
              className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" /> PDF
            </button>
          </div>
        </div>

        {/* Preview table */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                {(query.data ? colsFor(query.data.kind) : []).map((c) => (
                  <th key={c.header} className="px-3 py-2 font-medium">
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data && query.data.rows.length > 0 ? (
                (query.data.rows as unknown[]).slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {colsFor(query.data!.kind).map((c) => (
                      <td key={c.header} className="px-3 py-1.5">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {String(c.accessor(r as any) ?? "")}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                    {query.isLoading ? "…" : "لا توجد بيانات ضمن الفلاتر المحددة"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {rowsCount > 100 ? (
            <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              يظهر 100 سجلًا فقط في المعاينة، وسيتم تصدير جميع السجلات ({rowsCount}).
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------- Column definitions ----------
const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("ar", { hour12: false }) : "";

const APPT_STATUS_LABEL: Record<string, string> = {
  new: "جديد",
  confirmed: "مؤكد",
  completed: "مكتمل",
  cancelled: "ملغى",
  no_show: "لم يحضر",
};

const APPT_COLS: Column<AppointmentReportRow>[] = [
  { header: "التاريخ", accessor: (r) => r.appointment_date, width: 12 },
  { header: "الوقت", accessor: (r) => r.appointment_time?.slice(0, 5), width: 8 },
  { header: "المريض", accessor: (r) => r.patient_name, width: 22 },
  { header: "الجوال", accessor: (r) => r.patient_phone, width: 15 },
  { header: "الطبيب", accessor: (r) => r.doctor_name_ar ?? "", width: 20 },
  { header: "التخصص", accessor: (r) => r.specialty_name_ar ?? "", width: 18 },
  { header: "الفرع", accessor: (r) => r.branch_name_ar ?? "", width: 15 },
  { header: "الحالة", accessor: (r) => APPT_STATUS_LABEL[r.status] ?? r.status, width: 10 },
  { header: "سبب المراجعة", accessor: (r) => r.reason ?? "", width: 25 },
  { header: "ملاحظات", accessor: (r) => r.notes ?? "", width: 25 },
  { header: "تاريخ الإنشاء", accessor: (r) => fmtDateTime(r.created_at), width: 18 },
];

const OCC_COLS: Column<DoctorOccupancyRow>[] = [
  { header: "الطبيب", accessor: (r) => r.name_ar, width: 24 },
  { header: "التخصص", accessor: (r) => r.specialty_name_ar ?? "", width: 20 },
  { header: "نشط", accessor: (r) => (r.is_active ? "نعم" : "لا"), width: 8 },
  { header: "المحجوز", accessor: (r) => r.booked, width: 10 },
  { header: "الطاقة", accessor: (r) => r.capacity, width: 10 },
  { header: "الإشغال %", accessor: (r) => `${r.occupancy_pct}%`, width: 12 },
  { header: "أيام الإجازة", accessor: (r) => r.leave_days, width: 12 },
];

const PHARM_STATUS_LABEL: Record<string, string> = {
  new: "جديد",
  in_progress: "قيد التنفيذ",
  ready: "جاهز",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

const PHARM_COLS: Column<PharmacyOrderRow>[] = [
  { header: "المريض", accessor: (r) => r.patient_name, width: 22 },
  { header: "الجوال", accessor: (r) => r.patient_phone, width: 15 },
  { header: "الفرع", accessor: (r) => r.branch_name_ar ?? "", width: 15 },
  { header: "الحالة", accessor: (r) => PHARM_STATUS_LABEL[r.status] ?? r.status, width: 12 },
  { header: "ملاحظات", accessor: (r) => r.notes ?? "", width: 30 },
  { header: "تاريخ الطلب", accessor: (r) => fmtDateTime(r.created_at), width: 18 },
];

const PATIENT_COLS: Column<PatientReportRow>[] = [
  { header: "الرقم الطبي", accessor: (r) => r.mrn ?? "", width: 14 },
  { header: "الاسم", accessor: (r) => r.full_name, width: 26 },
  { header: "الجوال", accessor: (r) => r.phone ?? "", width: 15 },
  {
    header: "الجنس",
    accessor: (r) => (r.gender === "male" ? "ذكر" : r.gender === "female" ? "أنثى" : ""),
    width: 8,
  },
  { header: "تاريخ الميلاد", accessor: (r) => r.date_of_birth ?? "", width: 14 },
  { header: "الفرع", accessor: (r) => r.branch_name_ar ?? "", width: 15 },
  { header: "تاريخ التسجيل", accessor: (r) => fmtDateTime(r.created_at), width: 18 },
];

function colsFor(kind: "appointments" | "occupancy" | "pharmacy" | "patients"): Column<unknown>[] {
  const map = {
    appointments: APPT_COLS,
    occupancy: OCC_COLS,
    pharmacy: PHARM_COLS,
    patients: PATIENT_COLS,
  } as const;
  return map[kind] as unknown as Column<unknown>[];
}
