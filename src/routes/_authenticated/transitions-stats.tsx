import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import {
  ArrowLeft,
  Activity,
  Filter,
  RefreshCw,
  TrendingUp,
  Users,
  Building2,
  UserCog,
  Clock,
  CalendarDays,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getTransitionsStats,
  listBranchesForAnalytics,
  type TransitionsStats,
} from "@/lib/patients-analytics.functions";
import { TransitionAlerts } from "@/components/analytics/TransitionAlerts";

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
  from: fallback(z.string(), daysAgoISO(30)).default(daysAgoISO(30)),
  to: fallback(z.string(), todayISO()).default(todayISO()),
});

export const Route = createFileRoute("/_authenticated/transitions-stats")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "لوحة إحصائيات الانتقالات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransitionsStatsPage,
});

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  deceased: "متوفى",
};
const STATUS_COLORS: Record<string, string> = {
  active: "hsl(142 71% 45%)",
  inactive: "hsl(38 92% 50%)",
  archived: "hsl(217 91% 60%)",
  deceased: "hsl(0 84% 60%)",
};
const CHART_PALETTE = [
  "hsl(var(--primary))",
  "hsl(142 71% 45%)",
  "hsl(217 91% 60%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 55%)",
  "hsl(180 60% 45%)",
];

function TransitionsStatsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const branchesFn = useServerFn(listBranchesForAnalytics);
  const statsFn = useServerFn(getTransitionsStats);

  const branchesQ = useQuery({
    queryKey: ["transitions-stats-branches"],
    queryFn: () => branchesFn(),
    staleTime: 60_000,
  });

  const statsQ = useQuery({
    queryKey: ["transitions-stats", search],
    queryFn: () =>
      statsFn({ data: { branchId: search.branchId, from: search.from, to: search.to } }),
    placeholderData: keepPreviousData,
  });

  const stats = statsQ.data;

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({
      search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }),
      replace: true,
    });
  };

  const quickRange = (n: number) => setSearch({ from: daysAgoISO(n), to: todayISO() });

  const avgPerDay = useMemo(() => {
    if (!stats || !stats.period.days) return 0;
    return +(stats.total / stats.period.days).toFixed(1);
  }, [stats]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              to="/patients-analytics"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              تحليلات المرضى
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              إحصائيات الانتقالات
            </h1>
          </div>
          <button
            onClick={() => statsQ.refetch()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 ${statsQ.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Filters — collapsed by default */}
        <Accordion type="single" collapsible defaultValue="" className="space-y-3">
          <AccordionItem value="filters" className="rounded-xl border border-border bg-card px-4">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                الفلاتر
                <span className="text-xs font-normal text-muted-foreground">
                  ({search.from} → {search.to}
                  {search.branchId ? " · فرع محدد" : " · كل الفروع"})
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 pb-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
                  <select
                    value={search.branchId ?? ""}
                    onChange={(e) => setSearch({ branchId: e.target.value || null })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">كل الفروع</option>
                    {(branchesQ.data ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name_ar}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
                  <input
                    type="date"
                    value={search.from}
                    onChange={(e) => setSearch({ from: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
                  <input
                    type="date"
                    value={search.to}
                    onChange={(e) => setSearch({ to: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-end gap-2 flex-wrap">
                  {[7, 30, 90].map((n) => (
                    <button
                      key={n}
                      onClick={() => quickRange(n)}
                      className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted"
                    >
                      آخر {n} يوم
                    </button>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {statsQ.isLoading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            جارٍ تحميل الإحصائيات…
          </div>
        )}

        {statsQ.error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            تعذر تحميل الإحصائيات: {(statsQ.error as Error).message}
          </div>
        )}

        {stats && (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
              <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
              <TabsTrigger value="charts">الرسوم البيانية</TabsTrigger>
              <TabsTrigger value="details">التفاصيل</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                  label="إجمالي الانتقالات"
                  value={stats.total}
                  icon={<Activity className="h-5 w-5" />}
                  tone="primary"
                />
                <KpiCard
                  label="متوسط يومي"
                  value={avgPerDay}
                  icon={<TrendingUp className="h-5 w-5" />}
                  tone="success"
                />
                <KpiCard
                  label="عدد الفروع النشطة"
                  value={stats.byBranch.length}
                  icon={<Building2 className="h-5 w-5" />}
                  tone="info"
                />
                <KpiCard
                  label="عدد الموظفين النشطين"
                  value={stats.byActor.length}
                  icon={<UserCog className="h-5 w-5" />}
                  tone="warning"
                />
              </section>

              <TransitionAlerts stats={stats} />
            </TabsContent>

            <TabsContent value="charts" className="space-y-6">
              <section className="rounded-xl border border-border bg-card p-5">
                <SectionHeader
                  icon={<CalendarDays className="h-4 w-4" />}
                  title="التوزيع اليومي حسب الحالة"
                  subtitle={`الفترة: ${stats.period.from} → ${stats.period.to} (${stats.period.days} يوم)`}
                />
                <div className="h-72 mt-3">
                  {stats.total === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stats.daily}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ direction: "rtl" }} />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="active"
                          stackId="1"
                          name="نشط"
                          stroke={STATUS_COLORS.active}
                          fill={STATUS_COLORS.active}
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="inactive"
                          stackId="1"
                          name="غير نشط"
                          stroke={STATUS_COLORS.inactive}
                          fill={STATUS_COLORS.inactive}
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="archived"
                          stackId="1"
                          name="مؤرشف"
                          stroke={STATUS_COLORS.archived}
                          fill={STATUS_COLORS.archived}
                          fillOpacity={0.6}
                        />
                        <Area
                          type="monotone"
                          dataKey="deceased"
                          stackId="1"
                          name="متوفى"
                          stroke={STATUS_COLORS.deceased}
                          fill={STATUS_COLORS.deceased}
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="rounded-xl border border-border bg-card p-5">
                  <SectionHeader
                    icon={<Building2 className="h-4 w-4" />}
                    title="الانتقالات حسب الفرع"
                    subtitle="أعلى الفروع نشاطًا"
                  />
                  <div className="h-72 mt-3">
                    {stats.byBranch.length === 0 ? (
                      <EmptyChart />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.byBranch.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="branch_name"
                            tick={{ fontSize: 11 }}
                            width={110}
                          />
                          <Tooltip contentStyle={{ direction: "rtl" }} />
                          <Bar dataKey="count" name="عدد الانتقالات" radius={[0, 6, 6, 0]}>
                            {stats.byBranch.slice(0, 10).map((_, i) => (
                              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <SectionHeader
                    icon={<UserCog className="h-4 w-4" />}
                    title="الانتقالات حسب الموظف"
                    subtitle="أعلى المستخدمين نشاطًا"
                  />
                  <div className="h-72 mt-3">
                    {stats.byActor.length === 0 ? (
                      <EmptyChart />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.byActor.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="actor_name"
                            tick={{ fontSize: 11 }}
                            width={110}
                          />
                          <Tooltip contentStyle={{ direction: "rtl" }} />
                          <Bar dataKey="count" name="عدد الانتقالات" radius={[0, 6, 6, 0]}>
                            {stats.byActor.slice(0, 10).map((_, i) => (
                              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <SectionHeader
                    icon={<Users className="h-4 w-4" />}
                    title="توزيع الحالة النهائية"
                    subtitle="إلى أي حالة انتقل المرضى"
                  />
                  <div className="h-72 mt-3">
                    {stats.total === 0 ? (
                      <EmptyChart />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={stats.perTarget.filter((t) => t.count > 0)}
                            dataKey="count"
                            nameKey="status"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            label={(e) => `${STATUS_LABEL[e.status] ?? e.status}: ${e.count}`}
                          >
                            {stats.perTarget.map((t) => (
                              <Cell
                                key={t.status}
                                fill={STATUS_COLORS[t.status] ?? "hsl(var(--primary))"}
                              />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ direction: "rtl" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <SectionHeader
                    icon={<CalendarDays className="h-4 w-4" />}
                    title="التوزيع حسب أيام الأسبوع"
                    subtitle="لتحديد الأيام الأكثر ازدحامًا"
                  />
                  <div className="h-72 mt-3">
                    {stats.total === 0 ? (
                      <EmptyChart />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.weekday}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ direction: "rtl" }} />
                          <Bar
                            dataKey="count"
                            name="عدد الانتقالات"
                            fill="hsl(var(--primary))"
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </section>
              </div>

              <section className="rounded-xl border border-border bg-card p-5">
                <SectionHeader
                  icon={<Clock className="h-4 w-4" />}
                  title="التوزيع حسب ساعات اليوم"
                  subtitle="لتحديد ساعات الذروة"
                />
                <div className="h-64 mt-3">
                  {stats.total === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.hourly}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="hour"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(h) => `${h}:00`}
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ direction: "rtl" }}
                          labelFormatter={(h) => `الساعة ${h}:00`}
                        />
                        <Bar
                          dataKey="count"
                          name="عدد الانتقالات"
                          fill="hsl(217 91% 60%)"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="details" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DetailTable
                  title="تفصيل الانتقالات (من → إلى)"
                  headers={["من", "إلى", "العدد"]}
                  rows={stats.perTransition
                    .slice(0, 20)
                    .map((r) => [
                      STATUS_LABEL[r.from] ?? r.from,
                      STATUS_LABEL[r.to] ?? r.to,
                      String(r.count),
                    ])}
                />
                <DetailTable
                  title="ترتيب الموظفين"
                  headers={["الموظف", "عدد الانتقالات"]}
                  rows={stats.byActor.slice(0, 20).map((r) => [r.actor_name, String(r.count)])}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "info" | "warning";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
    info: "bg-teal-500/10 text-teal-600",
    warning: "bg-amber-500/10 text-amber-600",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`h-8 w-8 rounded-lg grid place-items-center ${toneClass}`}>{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-sm font-bold flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full grid place-items-center text-sm text-muted-foreground">
      لا توجد بيانات ضمن الفلاتر المحددة.
    </div>
  );
}

function DetailTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد بيانات.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                {headers.map((h) => (
                  <th key={h} className="text-start py-2 px-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  {row.map((cell, j) => (
                    <td key={j} className="py-2 px-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
