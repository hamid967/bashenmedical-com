import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Users,
  Activity,
  Tag as TagIcon,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  History,
  ExternalLink,
  User as UserIcon,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import {
  getPatientAnalytics,
  getPatientTransitions,
  listBranchesForAnalytics,
  listDoctorsForAnalytics,
  listRecentStatusChanges,
  type RecentStatusEvent,
} from "@/lib/patients-analytics.functions";
import { getPatientsAiSummary, type AiSummary } from "@/lib/patients-ai-summary.functions";
import {
  listPatientsForKpi,
  type KpiPatientRow,
  listPatientTransitionRows,
  type PatientTransitionRow,
} from "@/lib/patients-analytics.functions";
import { exportXlsx, exportPdf, type Column } from "@/lib/export-utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const searchSchema = z.object({
  branchId: fallback(z.string().nullable(), null).default(null),
  doctorId: fallback(z.string().nullable(), null).default(null),
  gender: fallback(z.enum(["male", "female", "other"]).nullable(), null).default(null),
  minAge: fallback(z.string(), "").default(""),
  maxAge: fallback(z.string(), "").default(""),
  from: fallback(z.string(), daysAgoISO(30)).default(daysAgoISO(30)),
  to: fallback(z.string(), todayISO()).default(todayISO()),
});

export const Route = createFileRoute("/_authenticated/patients-analytics")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [{ title: "تحليلات المرضى | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  component: PatientsAnalyticsPage,
});

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  deceased: "متوفى",
};
const GENDER_LABEL: Record<string, string> = {
  male: "ذكر",
  female: "أنثى",
  other: "آخر",
  "غير محدد": "غير محدد",
};
const COLORS = [
  "hsl(var(--primary))",
  "hsl(142 71% 45%)",
  "hsl(217 91% 60%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
  "hsl(180 60% 45%)",
];

type DrilldownState =
  | {
      kind: "patients";
      status: "active" | "inactive" | "archived" | "deceased" | null;
      title: string;
    }
  | { kind: "events"; title: string };

function PatientsAnalyticsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/patients-analytics" });
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const { branchId, doctorId, gender, minAge, maxAge, from, to } = search;

  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev: typeof search) => ({ ...prev, ...patch }), replace: true });

  const resetFilters = () =>
    navigate({
      search: {
        branchId: null,
        doctorId: null,
        gender: null,
        minAge: "",
        maxAge: "",
        from: daysAgoISO(30),
        to: todayISO(),
      },
      replace: true,
    });

  const branchesFn = useServerFn(listBranchesForAnalytics);
  const doctorsFn = useServerFn(listDoctorsForAnalytics);
  const analyticsFn = useServerFn(getPatientAnalytics);
  const transitionsFn = useServerFn(getPatientTransitions);

  const branchesQ = useQuery({
    queryKey: ["pa-branches"],
    queryFn: () => branchesFn(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const doctorsQ = useQuery({
    queryKey: ["pa-doctors"],
    queryFn: () => doctorsFn(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const filters = {
    branchId,
    gender,
    minAge: minAge ? Number(minAge) : null,
    maxAge: maxAge ? Number(maxAge) : null,
    from,
    to,
  };

  const q = useQuery({
    queryKey: ["patients-analytics", filters],
    queryFn: () => analyticsFn({ data: filters }),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

  const transitionsQ = useQuery({
    queryKey: ["patients-transitions", { branchId, doctorId, from, to }],
    queryFn: () => transitionsFn({ data: { branchId, doctorId, from, to } }),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });

  const data = q.data;
  const transitions = transitionsQ.data;
  const branches = branchesQ.data ?? [];
  const doctors = (doctorsQ.data ?? []).filter(
    (d) => !branchId || !d.branch_id || d.branch_id === branchId,
  );

  const statusChart = useMemo(
    () =>
      (data?.byStatus ?? []).map((s) => ({
        name: STATUS_LABEL[s.status] ?? s.status,
        value: s.count,
        key: s.status,
      })),
    [data],
  );
  const genderChart = useMemo(
    () =>
      (data?.byGender ?? []).map((g) => ({
        name: GENDER_LABEL[g.gender] ?? g.gender,
        value: g.count,
        key: g.gender,
      })),
    [data],
  );
  const branchChart = useMemo(
    () => (data?.byBranch ?? []).map((b) => ({ name: b.branch_name, عدد: b.count })),
    [data],
  );
  const ageChart = useMemo(
    () => (data?.byAgeGroup ?? []).map((a) => ({ name: a.group, عدد: a.count })),
    [data],
  );
  const tagChart = useMemo(
    () => (data?.byTag ?? []).map((t) => ({ name: t.tag, عدد: t.count })),
    [data],
  );
  const regChart = useMemo(
    () =>
      (data?.registrationsDaily ?? []).map((d) => ({
        day: d.day.slice(5),
        تسجيلات: d.count,
      })),
    [data],
  );
  const changeChart = useMemo(
    () =>
      (data?.statusChangesDaily ?? []).map((d) => ({
        day: d.day.slice(5),
        تغييرات: d.count,
      })),
    [data],
  );
  const changeBreakdown = useMemo(
    () =>
      (data?.statusChangeBreakdown ?? []).map((c) => ({
        name: STATUS_LABEL[c.to] ?? c.to,
        عدد: c.count,
      })),
    [data],
  );

  return (
    <div className="container-app py-10 space-y-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-primary" />
            تحليلات المرضى
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            توزيع الحالات والوسوم وتغيّرات الحالة خلال الفترة المحددة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu
            data={data}
            transitions={transitions}
            filters={{ branchId, doctorId, gender, from, to }}
            branches={branches}
            doctors={doctors}
          />
          <Link
            to="/transitions-stats"
            search={{ branchId, from, to }}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 text-primary px-3 py-1.5 text-sm hover:bg-primary/10"
          >
            <Activity className="h-4 w-4" />
            لوحة إحصائيات الانتقالات
          </Link>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            لوحة التحكم
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Filter className="h-4 w-4" /> الفلاتر
            {q.isFetching && (
              <span className="text-[10px] font-normal text-primary">جارٍ التحديث…</span>
            )}
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-normal hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            إعادة تعيين
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">الفرع</label>
            <select
              value={branchId ?? ""}
              onChange={(e) => update({ branchId: e.target.value || null, doctorId: null })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">الطبيب</label>
            <select
              value={doctorId ?? ""}
              onChange={(e) => update({ doctorId: e.target.value || null })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">كل الأطباء</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">الجنس</label>
            <select
              value={gender ?? ""}
              onChange={(e) =>
                update({ gender: (e.target.value || null) as "male" | "female" | "other" | null })
              }
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">الكل</option>
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
              <option value="other">آخر</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">أقل عمر</label>
            <input
              type="number"
              min={0}
              max={150}
              value={minAge}
              onChange={(e) => update({ minAge: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">أعلى عمر</label>
            <input
              type="number"
              min={0}
              max={150}
              value={maxAge}
              onChange={(e) => update({ maxAge: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">من تاريخ</label>
            <input
              type="date"
              value={from}
              onChange={(e) => update({ from: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">إلى تاريخ</label>
            <input
              type="date"
              value={to}
              onChange={(e) => update({ to: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {q.isLoading && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          جارٍ حساب التحليلات…
        </div>
      )}
      {q.error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-destructive">
          {(q.error as Error).message}
        </div>
      )}

      {data && (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 sm:inline-flex h-auto">
            <TabsTrigger value="overview">
              <Users className="h-4 w-4 ml-1" /> نظرة عامة
            </TabsTrigger>
            <TabsTrigger value="trends">
              <Activity className="h-4 w-4 ml-1" /> الاتجاهات
            </TabsTrigger>
            <TabsTrigger value="smart">
              <Sparkles className="h-4 w-4 ml-1" /> الملخّص الذكي
            </TabsTrigger>
            <TabsTrigger value="transitions">
              <History className="h-4 w-4 ml-1" /> الانتقالات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi
                label="إجمالي المرضى"
                value={data.total}
                tone="primary"
                onClick={() =>
                  setDrilldown({ kind: "patients", status: null, title: "إجمالي المرضى" })
                }
              />
              <Kpi
                label="نشط"
                value={data.byStatus.find((s) => s.status === "active")?.count ?? 0}
                tone="success"
                onClick={() =>
                  setDrilldown({ kind: "patients", status: "active", title: "المرضى النشطون" })
                }
              />
              <Kpi
                label="مؤرشف"
                value={data.byStatus.find((s) => s.status === "archived")?.count ?? 0}
                tone="info"
                onClick={() =>
                  setDrilldown({ kind: "patients", status: "archived", title: "المرضى المؤرشفون" })
                }
              />
              <Kpi
                label="تغيّرات الحالة (الفترة)"
                value={data.statusChangesDaily.reduce((s, d) => s + d.count, 0)}
                tone="warning"
                onClick={() =>
                  setDrilldown({ kind: "events", title: "أحداث تغيير الحالة خلال الفترة" })
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card title="توزيع الحالات">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={statusChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {statusChart.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <Legend
                  items={statusChart.map((s, i) => ({
                    name: s.name,
                    value: s.value,
                    color: COLORS[i % COLORS.length],
                  }))}
                />
              </Card>

              <Card title="توزيع الجنس">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={genderChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {genderChart.map((_, i) => (
                        <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <Legend
                  items={genderChart.map((s, i) => ({
                    name: s.name,
                    value: s.value,
                    color: COLORS[(i + 2) % COLORS.length],
                  }))}
                />
              </Card>

              <Card title="الفئات العمرية">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={ageChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="عدد" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card title="حسب الفرع">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={branchChart} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      width={110}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="عدد" fill="hsl(217 91% 60%)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="أعلى الوسوم" icon={TagIcon}>
                {tagChart.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">لا توجد وسوم بعد.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={tagChart} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={11}
                        width={110}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="عدد" fill="hsl(142 71% 45%)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trends" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card title="تسجيلات المرضى اليومية">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={regChart}>
                    <defs>
                      <linearGradient id="fillReg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="تسجيلات"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#fillReg)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card title="تغيّرات حالة المرضى اليومية" icon={Activity}>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={changeChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="تغييرات"
                      stroke="hsl(38 92% 50%)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {changeBreakdown.length > 0 && (
              <Card title="التغييرات حسب الحالة المستهدفة">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={changeBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="عدد" fill="hsl(280 65% 60%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="smart" className="space-y-6">
            <AiSummarySection branchId={branchId} doctorId={doctorId} />
          </TabsContent>

          <TabsContent value="transitions" className="space-y-6">
            <TransitionsSection
              data={transitions}
              loading={transitionsQ.isLoading}
              error={transitionsQ.error as Error | null}
            />
            <RecentStatusEventsSection
              branchId={branchId}
              doctorId={doctorId}
              from={from}
              to={to}
            />
            <PatientTransitionsTable
              branchId={branchId}
              doctorId={doctorId}
              gender={gender}
              minAge={minAge}
              maxAge={maxAge}
              from={from}
              to={to}
            />
          </TabsContent>
        </Tabs>
      )}

      <DrilldownModal
        state={drilldown}
        onClose={() => setDrilldown(null)}
        filters={{ branchId, doctorId, gender, minAge, maxAge, from, to }}
      />
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function Kpi({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "info" | "warning";
  onClick?: () => void;
}) {
  const toneClass: Record<string, string> = {
    primary: "text-primary from-primary/10",
    success: "text-emerald-600 from-emerald-500/10",
    info: "text-teal-600 from-teal-500/10",
    warning: "text-amber-600 from-amber-500/10",
  };
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`group w-full text-start rounded-xl border border-border bg-gradient-to-br to-card p-4 shadow-sm transition ${clickable ? "cursor-pointer hover:shadow-md hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40" : "cursor-default"} ${toneClass[tone].split(" ").slice(-1)[0]}`}
    >
      <p className="flex items-center justify-between text-xs text-muted-foreground">
        {label}
        {clickable && (
          <span className="text-[10px] font-normal text-muted-foreground/70 opacity-0 transition group-hover:opacity-100">
            عرض التفاصيل ←
          </span>
        )}
      </p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${toneClass[tone].split(" ")[0]}`}>
        {value.toLocaleString("ar-SA")}
      </p>
    </button>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { name: string; value: number; color: string }[] }) {
  return (
    <div className="mt-1 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
      {items.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: s.color }}
          />
          {s.name} ({s.value})
        </span>
      ))}
    </div>
  );
}

const STATUS_KEYS_UI = ["active", "inactive", "archived", "deceased"] as const;
type StatusKey = (typeof STATUS_KEYS_UI)[number];

function TransitionsSection({
  data,
  loading,
  error,
}: {
  data:
    | {
        period: { from: string; to: string; days: number };
        previous: { from: string; to: string };
        denominator: number;
        current: {
          totalChanges: number;
          perTarget: Record<StatusKey, number>;
          perTransition: { from: string; to: string; count: number }[];
          ratePerTarget: Record<StatusKey, number>;
        };
        prior: {
          totalChanges: number;
          perTarget: Record<StatusKey, number>;
          ratePerTarget: Record<StatusKey, number>;
        };
        delta: {
          totalChanges: number;
          perTarget: Record<StatusKey, number>;
          ratePerTarget: Record<StatusKey, number>;
        };
      }
    | undefined;
  loading: boolean;
  error: Error | null;
}) {
  if (loading) {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        جارٍ حساب مؤشرات الانتقال…
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center text-destructive">
        {error.message}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" />
          مؤشرات انتقال الحالات
        </h2>
        <p className="text-xs text-muted-foreground">
          الفترة الحالية: {data.period.from} → {data.period.to} ({data.period.days} يومًا) • مقارنة
          بالسابقة: {data.previous.from} → {data.previous.to} • قاعدة الحساب:{" "}
          {data.denominator.toLocaleString("ar-SA")} مريض
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <TransitionKpi
          label="إجمالي التغييرات"
          current={data.current.totalChanges}
          prior={data.prior.totalChanges}
        />
        <TransitionKpi
          label="معدل التغيير الكلي"
          current={
            data.denominator
              ? +((data.current.totalChanges / data.denominator) * 100).toFixed(2)
              : 0
          }
          prior={
            data.denominator ? +((data.prior.totalChanges / data.denominator) * 100).toFixed(2) : 0
          }
          suffix="%"
        />
        <TransitionKpi
          label="متوسط يومي"
          current={+(data.current.totalChanges / data.period.days).toFixed(1)}
          prior={+(data.prior.totalChanges / data.period.days).toFixed(1)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="p-2 text-start">الحالة المستهدفة</th>
              <th className="p-2 text-start">الحالية</th>
              <th className="p-2 text-start">السابقة</th>
              <th className="p-2 text-start">التغير</th>
              <th className="p-2 text-start">معدل حالي %</th>
              <th className="p-2 text-start">معدل سابق %</th>
              <th className="p-2 text-start">Δ معدل</th>
            </tr>
          </thead>
          <tbody>
            {STATUS_KEYS_UI.map((k) => (
              <tr key={k} className="border-b border-border/50">
                <td className="p-2 font-medium">{STATUS_LABEL[k] ?? k}</td>
                <td className="p-2 tabular-nums">
                  {data.current.perTarget[k].toLocaleString("ar-SA")}
                </td>
                <td className="p-2 tabular-nums text-muted-foreground">
                  {data.prior.perTarget[k].toLocaleString("ar-SA")}
                </td>
                <td className="p-2">
                  <DeltaBadge value={data.delta.perTarget[k]} />
                </td>
                <td className="p-2 tabular-nums">{data.current.ratePerTarget[k]}%</td>
                <td className="p-2 tabular-nums text-muted-foreground">
                  {data.prior.ratePerTarget[k]}%
                </td>
                <td className="p-2">
                  <DeltaBadge value={data.delta.ratePerTarget[k]} suffix="%" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.current.perTransition.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            تفصيل الانتقالات (من → إلى)
          </p>
          <div className="flex flex-wrap gap-2">
            {data.current.perTransition.map((t) => (
              <span
                key={`${t.from}-${t.to}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs"
              >
                <span className="text-muted-foreground">{STATUS_LABEL[t.from] ?? t.from}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium">{STATUS_LABEL[t.to] ?? t.to}</span>
                <span className="ms-1 rounded-full bg-primary/10 px-1.5 text-primary tabular-nums">
                  {t.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TransitionKpi({
  label,
  current,
  prior,
  suffix,
}: {
  label: string;
  current: number;
  prior: number;
  suffix?: string;
}) {
  const delta = +(current - prior).toFixed(2);
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">
          {current.toLocaleString("ar-SA")}
          {suffix ?? ""}
        </span>
        <DeltaBadge value={delta} suffix={suffix} />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        السابقة: {prior.toLocaleString("ar-SA")}
        {suffix ?? ""}
      </p>
    </div>
  );
}

function DeltaBadge({ value, suffix }: { value: number; suffix?: string }) {
  const zero = value === 0;
  const up = value > 0;
  const Icon = zero ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const cls = zero
    ? "bg-muted text-muted-foreground"
    : up
      ? "bg-emerald-500/10 text-emerald-600"
      : "bg-red-500/10 text-red-600";
  const sign = up ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {sign}
      {value.toLocaleString("ar-SA")}
      {suffix ?? ""}
    </span>
  );
}

function AiSummarySection({
  branchId,
  doctorId,
}: {
  branchId: string | null;
  doctorId: string | null;
}) {
  const summaryFn = useServerFn(getPatientsAiSummary);
  const q = useQuery({
    queryKey: ["patients-ai-summary", { branchId, doctorId }],
    queryFn: () => summaryFn({ data: { branchId, doctorId } }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const data = q.data as AiSummary | undefined;

  return (
    <div className="mt-6 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">ملخّص ذكي وإجراءات مقترحة</h2>
            <p className="text-xs text-muted-foreground">
              تحليل بالذكاء الاصطناعي لآخر 30 يومًا من تغيّرات حالات المرضى.
            </p>
          </div>
        </div>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
          {q.isFetching ? "يُحلّل..." : "إعادة توليد"}
        </button>
      </div>

      {q.isLoading && (
        <div className="space-y-2">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        </div>
      )}

      {q.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{(q.error as Error).message}</span>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <p className="text-base font-semibold leading-relaxed">{data.headline}</p>

          {data.highlights.length > 0 && (
            <ul className="space-y-1.5 text-sm text-foreground/90">
              {data.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}

          {data.actions.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">
                الإجراءات المقترحة
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {data.actions.map((a, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{a.title}</span>
                      <PriorityBadge p={a.priority} />
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{a.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="pt-2 text-[10px] text-muted-foreground">
            تم التوليد:{" "}
            {new Date(data.generatedAt).toLocaleString("ar-SA", {
              dateStyle: "short",
              timeStyle: "short",
            })}{" "}
            · نموذج: {data.model}
          </p>
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ p }: { p: "high" | "medium" | "low" }) {
  const map = {
    high: { label: "عالية", cls: "bg-red-500/10 text-red-600" },
    medium: { label: "متوسطة", cls: "bg-amber-500/10 text-amber-600" },
    low: { label: "منخفضة", cls: "bg-emerald-500/10 text-emerald-600" },
  } as const;
  const { label, cls } = map[p];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

const STATUS_LABEL_LOCAL: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  deceased: "متوفى",
};

function RecentStatusEventsSection({
  branchId,
  doctorId,
  from,
  to,
}: {
  branchId: string | null;
  doctorId: string | null;
  from: string;
  to: string;
}) {
  const fn = useServerFn(listRecentStatusChanges);
  const q = useQuery({
    queryKey: ["recent-status-events", { branchId, doctorId, from, to }],
    queryFn: () => fn({ data: { branchId, doctorId, from, to, limit: 20 } }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const events = (q.data as RecentStatusEvent[] | undefined) ?? [];

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">آخر أحداث تغيير الحالات</h2>
            <p className="text-xs text-muted-foreground">
              من سجل التدقيق مع أسباب التحويل وروابط مباشرة للسجل الأصلي.
            </p>
          </div>
        </div>
        <Link
          to="/audit-log"
          search={{ action: "patient.status_changed", from: `${from}T00:00`, to: `${to}T23:59` }}
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          كل السجلات
        </Link>
      </div>

      {q.isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      )}

      {q.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {(q.error as Error).message}
        </div>
      )}

      {!q.isLoading && events.length === 0 && (
        <p className="rounded-md bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          لا توجد أحداث تغيير حالة خلال هذه الفترة.
        </p>
      )}

      {events.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {events.map((e) => (
            <li key={e.audit_id} className="p-3 hover:bg-muted/30">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {e.from && (
                      <>
                        <StatusChip s={e.from} muted />
                        <span className="text-muted-foreground">→</span>
                      </>
                    )}
                    <StatusChip s={e.to} />
                    {e.count > 1 && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                        جماعي · {e.count} مريض
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground" dir="ltr">
                      {new Date(e.created_at).toLocaleString("ar-SA", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {e.patient_name ? (
                      <span className="font-medium">
                        {e.patient_name}
                        {e.patient_mrn && (
                          <span
                            className="ms-1 font-mono text-[10px] text-muted-foreground"
                            dir="ltr"
                          >
                            #{e.patient_mrn}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {e.count > 1 ? "عملية جماعية" : "مريض غير محدد"}
                      </span>
                    )}
                    {e.branch_name && (
                      <span className="text-muted-foreground">· {e.branch_name}</span>
                    )}
                    {e.actor_name && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <UserIcon className="h-3 w-3" />
                        {e.actor_name}
                      </span>
                    )}
                  </div>
                  {e.reason && (
                    <p className="mt-1.5 rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-foreground/90">
                      <span className="font-semibold text-muted-foreground">السبب: </span>
                      {e.reason}
                    </p>
                  )}
                </div>
                <Link
                  to="/audit-log"
                  search={{ action: e.action, id: e.audit_id }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-[11px] hover:bg-muted"
                  title="فتح السجل في سجل التدقيق"
                >
                  <ExternalLink className="h-3 w-3" />
                  فتح السجل
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ s, muted }: { s: string; muted?: boolean }) {
  const label = STATUS_LABEL_LOCAL[s] ?? s;
  const cls = muted
    ? "bg-muted text-muted-foreground"
    : s === "active"
      ? "bg-emerald-500/10 text-emerald-600"
      : s === "inactive"
        ? "bg-amber-500/10 text-amber-600"
        : s === "archived"
          ? "bg-teal-500/10 text-teal-600"
          : s === "deceased"
            ? "bg-red-500/10 text-red-600"
            : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

// ============ Export menu ============

type AnalyticsData = NonNullable<
  ReturnType<typeof useQuery<Awaited<ReturnType<typeof getPatientAnalytics>>>>["data"]
>;
type TransitionsData = NonNullable<
  ReturnType<typeof useQuery<Awaited<ReturnType<typeof getPatientTransitions>>>>["data"]
>;

function ExportMenu({
  data,
  transitions,
  filters,
  branches,
  doctors,
}: {
  data: AnalyticsData | undefined;
  transitions: TransitionsData | undefined;
  filters: {
    branchId: string | null;
    doctorId: string | null;
    gender: string | null;
    from: string;
    to: string;
  };
  branches: { id: string; name_ar: string }[];
  doctors: { id: string; name_ar: string }[];
}) {
  const disabled = !data;
  const branchName = filters.branchId
    ? (branches.find((b) => b.id === filters.branchId)?.name_ar ?? "-")
    : "الكل";
  const doctorName = filters.doctorId
    ? (doctors.find((d) => d.id === filters.doctorId)?.name_ar ?? "-")
    : "الكل";
  const genderLabel = filters.gender ? (STATUS_LABEL[filters.gender] ?? filters.gender) : "الكل";
  const meta = {
    الفترة: `${filters.from} → ${filters.to}`,
    الفرع: branchName,
    الطبيب: doctorName,
    الجنس: genderLabel,
  };

  const buildRows = (): { section: string; label: string; value: string | number }[] => {
    if (!data) return [];
    const rows: { section: string; label: string; value: string | number }[] = [];
    rows.push({ section: "ملخص", label: "إجمالي المرضى", value: data.total });
    for (const s of data.byStatus) {
      rows.push({ section: "الحالات", label: STATUS_LABEL[s.status] ?? s.status, value: s.count });
    }
    for (const g of data.byGender) {
      rows.push({ section: "الجنس", label: GENDER_LABEL[g.gender] ?? g.gender, value: g.count });
    }
    for (const a of data.byAgeGroup) {
      rows.push({ section: "الفئة العمرية", label: a.group, value: a.count });
    }
    for (const b of data.byBranch) {
      rows.push({ section: "الفروع", label: b.branch_name, value: b.count });
    }
    for (const t of data.byTag) {
      rows.push({ section: "الوسوم", label: t.tag, value: t.count });
    }
    if (transitions) {
      for (const k of ["active", "inactive", "archived", "deceased"] as const) {
        rows.push({
          section: "انتقال الحالات",
          label: `→ ${STATUS_LABEL[k]}`,
          value: `${transitions.current.perTarget[k]} (${transitions.current.ratePerTarget[k]}%)`,
        });
      }
    }
    return rows;
  };

  const cols: Column<{ section: string; label: string; value: string | number }>[] = [
    { header: "القسم", accessor: (r) => r.section, width: 20 },
    { header: "البند", accessor: (r) => r.label, width: 32 },
    { header: "القيمة", accessor: (r) => r.value, width: 20 },
  ];

  const filename = `patients-analytics-${filters.from}_${filters.to}`;

  return (
    <div className="inline-flex overflow-hidden rounded-md border border-input bg-background text-sm">
      <button
        type="button"
        disabled={disabled}
        onClick={() => exportXlsx(filename, cols, buildRows(), "التحليلات")}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted disabled:opacity-50"
        title="تصدير إلى Excel"
      >
        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
        Excel
      </button>
      <div className="w-px bg-border" />
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          exportPdf({
            filename,
            title: "تحليلات المرضى",
            subtitle: `${filters.from} → ${filters.to}`,
            cols,
            rows: buildRows(),
            meta,
          })
        }
        className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted disabled:opacity-50"
        title="تصدير إلى PDF"
      >
        <FileText className="h-4 w-4 text-red-600" />
        PDF
      </button>
    </div>
  );
}

// ============ KPI Drill-down modal ============

function DrilldownModal({
  state,
  onClose,
  filters,
}: {
  state: DrilldownState | null;
  onClose: () => void;
  filters: {
    branchId: string | null;
    doctorId: string | null;
    gender: "male" | "female" | "other" | null;
    minAge: string;
    maxAge: string;
    from: string;
    to: string;
  };
}) {
  const open = state !== null;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>{state?.title ?? ""}</DialogTitle>
          <DialogDescription>
            {state?.kind === "events"
              ? "قائمة تفصيلية بأحداث تغيير الحالة خلال الفترة والفلاتر الحالية."
              : "قائمة المرضى الذين تكوّنت منهم هذه النتيجة وفق الفلاتر الحالية."}
          </DialogDescription>
        </DialogHeader>
        {state?.kind === "patients" && (
          <PatientsDrilldown status={state.status} filters={filters} />
        )}
        {state?.kind === "events" && <EventsDrilldown filters={filters} />}
      </DialogContent>
    </Dialog>
  );
}

function PatientsDrilldown({
  status,
  filters,
}: {
  status: "active" | "inactive" | "archived" | "deceased" | null;
  filters: {
    branchId: string | null;
    gender: "male" | "female" | "other" | null;
    minAge: string;
    maxAge: string;
  };
}) {
  const fn = useServerFn(listPatientsForKpi);
  const q = useQuery({
    queryKey: [
      "kpi-patients",
      {
        status,
        branchId: filters.branchId,
        gender: filters.gender,
        minAge: filters.minAge,
        maxAge: filters.maxAge,
      },
    ],
    queryFn: () =>
      fn({
        data: {
          status,
          branchId: filters.branchId,
          gender: filters.gender,
          minAge: filters.minAge ? Number(filters.minAge) : null,
          maxAge: filters.maxAge ? Number(filters.maxAge) : null,
          limit: 200,
        },
      }),
    staleTime: 60_000,
  });

  const rows = (q.data as KpiPatientRow[] | undefined) ?? [];

  return (
    <div className="max-h-[65vh] overflow-auto">
      {q.isLoading && (
        <div className="space-y-2 p-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      )}
      {q.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {(q.error as Error).message}
        </div>
      )}
      {!q.isLoading && rows.length === 0 && (
        <p className="rounded-md bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          لا توجد بيانات مطابقة.
        </p>
      )}
      {rows.length > 0 && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            عرض {rows.length.toLocaleString("ar-SA")} مريضًا (بحد أقصى 200 صف).
          </p>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start">الاسم</th>
                <th className="p-2 text-start">MRN</th>
                <th className="p-2 text-start">الحالة</th>
                <th className="p-2 text-start">الفرع</th>
                <th className="p-2 text-start">التسجيل</th>
                <th className="p-2 text-start"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-2 font-medium">{r.full_name_ar ?? "-"}</td>
                  <td className="p-2 font-mono text-xs" dir="ltr">
                    {r.mrn ?? "-"}
                  </td>
                  <td className="p-2">
                    <StatusChip s={r.status} />
                  </td>
                  <td className="p-2 text-muted-foreground">{r.branch_name ?? "-"}</td>
                  <td className="p-2 text-xs text-muted-foreground" dir="ltr">
                    {new Date(r.created_at).toLocaleDateString("ar-SA")}
                  </td>
                  <td className="p-2">
                    <Link
                      to="/patients/$patientId"
                      params={{ patientId: r.id }}
                      className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-muted"
                    >
                      <ExternalLink className="h-3 w-3" />
                      فتح
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function EventsDrilldown({
  filters,
}: {
  filters: { branchId: string | null; doctorId: string | null; from: string; to: string };
}) {
  const fn = useServerFn(listRecentStatusChanges);
  const q = useQuery({
    queryKey: ["kpi-events", filters],
    queryFn: () => fn({ data: { ...filters, limit: 50 } }),
    staleTime: 60_000,
  });
  const events = (q.data as RecentStatusEvent[] | undefined) ?? [];

  return (
    <div className="max-h-[65vh] overflow-auto">
      {q.isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      )}
      {q.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {(q.error as Error).message}
        </div>
      )}
      {!q.isLoading && events.length === 0 && (
        <p className="rounded-md bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          لا توجد أحداث تغيير حالة خلال هذه الفترة.
        </p>
      )}
      {events.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {events.map((e) => (
            <li key={e.audit_id} className="p-3 hover:bg-muted/30">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {e.from && (
                  <>
                    <StatusChip s={e.from} muted />
                    <span className="text-muted-foreground">→</span>
                  </>
                )}
                <StatusChip s={e.to} />
                {e.count > 1 && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                    جماعي · {e.count}
                  </span>
                )}
                <span className="text-muted-foreground" dir="ltr">
                  {new Date(e.created_at).toLocaleString("ar-SA", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <div className="mt-1 text-xs">
                {e.patient_name ? (
                  <span className="font-medium">
                    {e.patient_name}
                    {e.patient_mrn && (
                      <span className="ms-1 font-mono text-[10px] text-muted-foreground" dir="ltr">
                        #{e.patient_mrn}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {e.count > 1 ? "عملية جماعية" : "مريض غير محدد"}
                  </span>
                )}
                {e.branch_name && (
                  <span className="ms-2 text-muted-foreground">· {e.branch_name}</span>
                )}
                {e.actor_name && (
                  <span className="ms-2 text-muted-foreground">· {e.actor_name}</span>
                )}
              </div>
              {e.reason && (
                <p className="mt-1 rounded-md bg-muted/40 p-2 text-xs text-foreground/90">
                  <span className="font-semibold text-muted-foreground">السبب: </span>
                  {e.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============ Highlight matched search text ============

function HighlightText({ text, query }: { text: string | null | undefined; query: string }) {
  if (!query || !text) return <>{text ?? "-"}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  const lowerQuery = query.toLowerCase();
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lowerQuery ? (
          <mark key={i} className="rounded bg-primary/20 px-0.5 font-semibold text-primary">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ============ Patient transitions table (searchable + sortable) ============

type TxSortKey =
  "created_at" | "patient_name" | "patient_mrn" | "branch_name" | "from" | "to" | "actor_name";

function PatientTransitionsTable({
  branchId,
  doctorId,
  gender,
  minAge,
  maxAge,
  from,
  to,
}: {
  branchId: string | null;
  doctorId: string | null;
  gender: "male" | "female" | "other" | null;
  minAge: string;
  maxAge: string;
  from: string;
  to: string;
}) {
  const fn = useServerFn(listPatientTransitionRows);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<TxSortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<
    "" | "active" | "inactive" | "archived" | "deceased"
  >("");
  const [statusFromFilter, setStatusFromFilter] = useState<
    "" | "active" | "inactive" | "archived" | "deceased" | "__none__"
  >("");
  const [txFrom, setTxFrom] = useState<string>("");
  const [txTo, setTxTo] = useState<string>("");
  const [bulkOnly, setBulkOnly] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRow, setSelectedRow] = useState<PatientTransitionRow | null>(null);

  // Debounce search input to avoid firing a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever filters/search/sort/pageSize change
  useEffect(() => {
    setPage(1);
  }, [
    branchId,
    doctorId,
    gender,
    minAge,
    maxAge,
    from,
    to,
    debouncedSearch,
    statusFilter,
    statusFromFilter,
    txFrom,
    txTo,
    bulkOnly,
    sortKey,
    sortDir,
    pageSize,
  ]);

  const activeAdvancedCount =
    (statusFilter ? 1 : 0) +
    (statusFromFilter ? 1 : 0) +
    (txFrom ? 1 : 0) +
    (txTo ? 1 : 0) +
    (bulkOnly ? 1 : 0);

  const resetAdvanced = () => {
    setStatusFilter("");
    setStatusFromFilter("");
    setTxFrom("");
    setTxTo("");
    setBulkOnly(false);
  };

  const q = useQuery({
    queryKey: [
      "patient-transition-rows",
      {
        branchId,
        doctorId,
        gender,
        minAge,
        maxAge,
        from,
        to,
        search: debouncedSearch,
        statusFilter,
        statusFromFilter,
        txFrom,
        txTo,
        bulkOnly,
        sortKey,
        sortDir,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      fn({
        data: {
          branchId,
          doctorId,
          gender,
          minAge: minAge ? Number(minAge) : null,
          maxAge: maxAge ? Number(maxAge) : null,
          from,
          to,
          limit: 2000,
          page,
          pageSize,
          search: debouncedSearch || null,
          statusTo: statusFilter || null,
          statusFrom: statusFromFilter || null,
          txFrom: txFrom || null,
          txTo: txTo || null,
          bulkOnly: bulkOnly || null,
          sortKey,
          sortDir,
        },
      }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const pageData = q.data as
    { rows: PatientTransitionRow[]; total: number; page: number; pageSize: number } | undefined;
  const sorted = pageData?.rows ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSort = (k: TxSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ k, label }: { k: TxSortKey; label: string }) => {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 ${active ? "text-foreground" : "text-muted-foreground"} hover:text-foreground`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    );
  };

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">جدول انتقالات المرضى</h2>
            <p className="text-xs text-muted-foreground">
              كل انتقال حالة (من → إلى) ضمن الفلاتر الحالية، مع البحث والفرز.
            </p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          إجمالي: {total.toLocaleString("ar-SA")}
          {q.isFetching && <span className="ms-2 text-primary">جارٍ التحديث…</span>}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث: الاسم، MRN، الفرع، الموظّف، السبب…"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 pe-8 text-sm"
          />
        </div>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          title="عدد الصفوف لكل صفحة"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / صفحة
            </option>
          ))}
        </select>
      </div>

      {/* Advanced filters */}
      <div className="mb-3 rounded-lg border border-dashed border-border bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            فلترة متقدمة
            {activeAdvancedCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                {activeAdvancedCount} فلتر نشط
              </span>
            )}
          </div>
          {activeAdvancedCount > 0 && (
            <button
              type="button"
              onClick={resetAdvanced}
              className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-muted"
            >
              <RotateCcw className="h-3 w-3" />
              مسح الفلاتر
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">من حالة</label>
            <select
              value={statusFromFilter}
              onChange={(e) => setStatusFromFilter(e.target.value as typeof statusFromFilter)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">الكل</option>
              <option value="__none__">(بدون / إنشاء)</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
              <option value="archived">مؤرشف</option>
              <option value="deceased">متوفى</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">إلى حالة</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
              <option value="archived">مؤرشف</option>
              <option value="deceased">متوفى</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              تاريخ الانتقال من
            </label>
            <input
              type="date"
              value={txFrom}
              min={from}
              max={to}
              onChange={(e) => setTxFrom(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              تاريخ الانتقال إلى
            </label>
            <input
              type="date"
              value={txTo}
              min={from}
              max={to}
              onChange={(e) => setTxTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={bulkOnly}
                onChange={(e) => setBulkOnly(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              الانتقالات الجماعية فقط
            </label>
          </div>
        </div>
      </div>

      {q.isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      )}
      {q.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {(q.error as Error).message}
        </div>
      )}
      {!q.isLoading && sorted.length === 0 && (
        <p className="rounded-md bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          لا توجد انتقالات مطابقة.
        </p>
      )}

      {sorted.length > 0 && (
        <div className="max-h-[520px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-xs">
                <th className="p-2 text-start">
                  <SortHeader k="created_at" label="التاريخ" />
                </th>
                <th className="p-2 text-start">
                  <SortHeader k="patient_name" label="المريض" />
                </th>
                <th className="p-2 text-start">
                  <SortHeader k="patient_mrn" label="MRN" />
                </th>
                <th className="p-2 text-start">
                  <SortHeader k="branch_name" label="الفرع" />
                </th>
                <th className="p-2 text-start">
                  <SortHeader k="from" label="من" />
                </th>
                <th className="p-2 text-start">
                  <SortHeader k="to" label="إلى" />
                </th>
                <th className="p-2 text-start">السبب</th>
                <th className="p-2 text-start">
                  <SortHeader k="actor_name" label="الموظف" />
                </th>
                <th className="p-2 text-start"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={`${r.audit_id}-${r.patient_id}-${i}`}
                  onClick={() => setSelectedRow(r)}
                  className="border-b border-border/50 cursor-pointer hover:bg-muted/30"
                >
                  <td className="p-2 text-xs text-muted-foreground" dir="ltr">
                    {new Date(r.created_at).toLocaleString("ar-SA", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="p-2 font-medium">
                    <HighlightText text={r.patient_name} query={debouncedSearch} />
                    {r.bulk && (
                      <span className="ms-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600">
                        جماعي
                      </span>
                    )}
                  </td>
                  <td className="p-2 font-mono text-xs" dir="ltr">
                    <HighlightText text={r.patient_mrn} query={debouncedSearch} />
                  </td>
                  <td className="p-2 text-muted-foreground">
                    <HighlightText text={r.branch_name} query={debouncedSearch} />
                  </td>
                  <td className="p-2">
                    {r.from ? (
                      <StatusChip s={r.from} muted />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    <StatusChip s={r.to} />
                  </td>
                  <td
                    className="p-2 text-xs text-muted-foreground max-w-[220px] truncate"
                    title={r.reason ?? ""}
                  >
                    <HighlightText text={r.reason} query={debouncedSearch} />
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    <HighlightText text={r.actor_name} query={debouncedSearch} />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Link
                        to="/patients/$patientId"
                        params={{ patientId: r.patient_id }}
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-muted"
                        title="فتح ملف المريض"
                      >
                        <UserIcon className="h-3 w-3" />
                        ملف
                      </Link>
                      <Link
                        to="/audit-log"
                        search={{ id: r.audit_id }}
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] hover:bg-muted"
                        title="عرض سجل audit log للانتقال"
                      >
                        <FileText className="h-3 w-3" />
                        Audit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>
            عرض{" "}
            <span className="font-semibold text-foreground">
              {((page - 1) * pageSize + 1).toLocaleString("ar-SA")}–
              {Math.min(page * pageSize, total).toLocaleString("ar-SA")}
            </span>{" "}
            من {total.toLocaleString("ar-SA")}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1 || q.isFetching}
              className="rounded-md border border-input bg-background px-2 py-1 disabled:opacity-40 hover:bg-muted"
            >
              الأولى
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || q.isFetching}
              className="rounded-md border border-input bg-background px-2 py-1 disabled:opacity-40 hover:bg-muted"
            >
              السابقة
            </button>
            <span className="px-2 py-1">
              صفحة{" "}
              <span className="font-semibold text-foreground">{page.toLocaleString("ar-SA")}</span>{" "}
              / {totalPages.toLocaleString("ar-SA")}
              {q.isFetching && <span className="ms-2 text-primary">…جارٍ التحميل</span>}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || q.isFetching}
              className="rounded-md border border-input bg-background px-2 py-1 disabled:opacity-40 hover:bg-muted"
            >
              التالية
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || q.isFetching}
              className="rounded-md border border-input bg-background px-2 py-1 disabled:opacity-40 hover:bg-muted"
            >
              الأخيرة
            </button>
          </div>
        </div>
      )}
      <TransitionDetailModal
        row={selectedRow}
        filters={{ branchId, doctorId, gender, minAge, maxAge, from, to }}
        searchTerm={debouncedSearch}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}

function TransitionDetailModal({
  row,
  filters,
  searchTerm,
  onClose,
}: {
  row: PatientTransitionRow | null;
  filters: {
    branchId: string | null;
    doctorId: string | null;
    gender: "male" | "female" | "other" | null;
    minAge: string;
    maxAge: string;
    from: string;
    to: string;
  };
  searchTerm: string;
  onClose: () => void;
}) {
  const open = row !== null;
  const fn = useServerFn(listPatientTransitionRows);
  const relatedQ = useQuery({
    queryKey: [
      "patient-transition-related",
      {
        patientId: row?.patient_id,
        branchId: filters.branchId,
        doctorId: filters.doctorId,
        gender: filters.gender,
        minAge: filters.minAge,
        maxAge: filters.maxAge,
        from: filters.from,
        to: filters.to,
      },
    ],
    queryFn: () =>
      fn({
        data: {
          patientId: row?.patient_id,
          branchId: filters.branchId,
          doctorId: filters.doctorId,
          gender: filters.gender,
          minAge: filters.minAge ? Number(filters.minAge) : null,
          maxAge: filters.maxAge ? Number(filters.maxAge) : null,
          from: filters.from,
          to: filters.to,
          limit: 50,
          sortKey: "created_at",
          sortDir: "desc",
        },
      }),
    enabled: open && !!row?.patient_id,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const related = (
    (relatedQ.data as { rows: PatientTransitionRow[] } | undefined)?.rows ?? []
  ).filter((r) => r.audit_id !== row?.audit_id || r.patient_id !== row?.patient_id);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>تفاصيل انتقال الحالة</DialogTitle>
          <DialogDescription>
            تفاصيل الحدث المختار والأحداث المرتبطة بالمريض ضمن نفس الفترة.
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="max-h-[70vh] overflow-auto">
            <div className="mb-4 rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                {row.from ? (
                  <>
                    <StatusChip s={row.from} muted />
                    <span className="text-muted-foreground">→</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
                <StatusChip s={row.to} />
                {row.bulk && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                    جماعي
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-xs text-muted-foreground">المريض</span>
                  <p className="font-medium">
                    <HighlightText text={row.patient_name} query={searchTerm} />
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">MRN</span>
                  <p className="font-mono text-xs" dir="ltr">
                    <HighlightText text={row.patient_mrn} query={searchTerm} />
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">الفرع</span>
                  <p>
                    <HighlightText text={row.branch_name} query={searchTerm} />
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">تاريخ التغيير</span>
                  <p className="text-xs" dir="ltr">
                    {new Date(row.created_at).toLocaleString("ar-SA", {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">الموظف</span>
                  <p>
                    <HighlightText text={row.actor_name} query={searchTerm} />
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs text-muted-foreground">السبب</span>
                  <p className="mt-0.5 rounded-md bg-background p-2 text-xs">
                    <HighlightText text={row.reason} query={searchTerm} />
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: row.patient_id }}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <UserIcon className="h-3.5 w-3.5" />
                  فتح ملف المريض
                </Link>
                <Link
                  to="/audit-log"
                  search={{ id: row.audit_id }}
                  className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-muted"
                >
                  <FileText className="h-3.5 w-3.5" />
                  فتح سجل Audit
                </Link>
              </div>
            </div>

            <h3 className="mb-2 text-sm font-semibold">الأحداث المرتبطة بالمريض</h3>
            {relatedQ.isLoading && (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />
                ))}
              </div>
            )}
            {relatedQ.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {(relatedQ.error as Error).message}
              </div>
            )}
            {!relatedQ.isLoading && related.length === 0 && (
              <p className="rounded-md bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                لا توجد أحداث مرتبطة أخرى للمريض ضمن الفترة.
              </p>
            )}
            {related.length > 0 && (
              <div className="max-h-[320px] overflow-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="p-2 text-start">التاريخ</th>
                      <th className="p-2 text-start">من</th>
                      <th className="p-2 text-start">إلى</th>
                      <th className="p-2 text-start">الموظف</th>
                      <th className="p-2 text-start">السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {related.map((r) => (
                      <tr key={r.audit_id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="p-2 text-xs text-muted-foreground" dir="ltr">
                          {new Date(r.created_at).toLocaleString("ar-SA", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="p-2">
                          {r.from ? (
                            <StatusChip s={r.from} muted />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <StatusChip s={r.to} />
                        </td>
                        <td className="p-2 text-xs">
                          <HighlightText text={r.actor_name} query={searchTerm} />
                        </td>
                        <td
                          className="p-2 text-xs text-muted-foreground max-w-[200px] truncate"
                          title={r.reason ?? ""}
                        >
                          <HighlightText text={r.reason} query={searchTerm} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
