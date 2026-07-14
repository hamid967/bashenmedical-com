import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { visibilityAwareInterval } from "@/lib/polling";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
} from "recharts";
import {
  Activity,
  ArrowLeft,
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  Pill,
  Stethoscope,
  Users,
  Bell,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getDashboardBySpecialty,
  getDashboardDaily,
  getDashboardKpis,
  getDashboardPeakHours,
  getDashboardRecentActivity,
  getDashboardStatusBreakdown,
  getDashboardUpcoming,
  listBranches,
} from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة الإحصائيات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

const STATUS_LABEL_AR: Record<string, string> = {
  new: "جديد",
  confirmed: "مؤكد",
  completed: "منجز",
  cancelled: "ملغى",
  no_show: "لم يحضر",
};

const STATUS_COLOR: Record<string, string> = {
  new: "hsl(var(--primary))",
  confirmed: "hsl(142 71% 45%)",
  completed: "hsl(217 91% 60%)",
  cancelled: "hsl(0 84% 60%)",
  no_show: "hsl(38 92% 50%)",
};

function DashboardPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState<string | null>(null);

  const listBranchesFn = useServerFn(listBranches);
  const kpisFn = useServerFn(getDashboardKpis);
  const dailyFn = useServerFn(getDashboardDaily);
  const statusFn = useServerFn(getDashboardStatusBreakdown);
  const specialtyFn = useServerFn(getDashboardBySpecialty);
  const peakFn = useServerFn(getDashboardPeakHours);
  const upcomingFn = useServerFn(getDashboardUpcoming);
  const recentFn = useServerFn(getDashboardRecentActivity);

  const branchesQ = useQuery({
    queryKey: ["dashboard", "branches"],
    queryFn: () => listBranchesFn(),
    staleTime: 60_000,
  });
  const kpisQ = useQuery({
    queryKey: ["dashboard", "kpis", branchId],
    queryFn: () => kpisFn({ data: { branchId } }),
    refetchInterval: visibilityAwareInterval(60_000, 5 * 60_000),
  });
  const dailyQ = useQuery({
    queryKey: ["dashboard", "daily", branchId],
    queryFn: () => dailyFn({ data: { branchId, days: 30 } }),
  });
  const statusQ = useQuery({
    queryKey: ["dashboard", "status", branchId],
    queryFn: () => statusFn({ data: { branchId, days: 30 } }),
  });
  const specialtyQ = useQuery({
    queryKey: ["dashboard", "specialty", branchId],
    queryFn: () => specialtyFn({ data: { branchId, days: 30 } }),
  });
  const peakQ = useQuery({
    queryKey: ["dashboard", "peak", branchId],
    queryFn: () => peakFn({ data: { branchId, days: 30 } }),
  });
  const upcomingQ = useQuery({
    queryKey: ["dashboard", "upcoming", branchId],
    queryFn: () => upcomingFn({ data: { branchId } }),
    refetchInterval: visibilityAwareInterval(60_000, 5 * 60_000),
  });
  const recentQ = useQuery({
    queryKey: ["dashboard", "recent", branchId],
    queryFn: () => recentFn({ data: { branchId } }),
    refetchInterval: visibilityAwareInterval(60_000, 5 * 60_000),
  });



  // Realtime: invalidate live cards when appointments/notifications change
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard", "kpis"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard", "upcoming"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard", "recent"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard", "kpis"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const kpis = kpisQ.data;
  const daily = dailyQ.data ?? [];
  const statuses = statusQ.data ?? [];
  const specialties = specialtyQ.data ?? [];
  const peak = peakQ.data ?? [];
  const upcoming = upcomingQ.data ?? [];
  const recent = recentQ.data ?? [];
  const branches = branchesQ.data ?? [];

  const dailyChart = useMemo(
    () =>
      daily.map((d) => ({
        day: new Date(d.day).toLocaleDateString("ar-SA", { day: "numeric", month: "short" }),
        المجموع: Number(d.total),
        مؤكد: Number(d.confirmed),
        ملغى: Number(d.cancelled),
      })),
    [daily],
  );

  const statusChart = useMemo(
    () =>
      statuses.map((s) => ({
        name: STATUS_LABEL_AR[s.status] ?? s.status,
        value: Number(s.count),
        key: s.status,
      })),
    [statuses],
  );

  const peakChart = useMemo(
    () =>
      peak.map((p) => ({
        hour: `${String(p.hour).padStart(2, "0")}:00`,
        عدد: Number(p.count),
      })),
    [peak],
  );

  const specialtyChart = useMemo(
    () =>
      specialties
        .filter((s) => s.name_ar)
        .map((s) => ({ name: s.name_ar ?? "غير محدد", عدد: Number(s.count) })),
    [specialties],
  );

  return (
    <div className="container-app py-10 space-y-8">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate">لوحة الإحصائيات</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نظرة حيّة على أداء المجمع اليوم — تُحدَّث تلقائيًا.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={branchId ?? ""}
            onChange={(e) => setBranchId(e.target.value || null)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_ar}
              </option>
            ))}
          </select>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            لوحة التحكم
          </Link>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="charts">الرسوم البيانية</TabsTrigger>
          <TabsTrigger value="upcoming">الحجوزات القادمة</TabsTrigger>
          <TabsTrigger value="activity">آخر النشاط</TabsTrigger>
        </TabsList>

        {/* Overview: KPIs + Occupancy */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard icon={CalendarDays} label="مواعيد اليوم" value={kpis?.today_total ?? 0} tone="primary" loading={kpisQ.isLoading} />
            <KpiCard icon={CalendarCheck2} label="مؤكدة اليوم" value={kpis?.today_confirmed ?? 0} tone="success" loading={kpisQ.isLoading} />
            <KpiCard icon={Users} label="مرضى فريدون" value={kpis?.today_unique_patients ?? 0} tone="info" loading={kpisQ.isLoading} />
            <KpiCard icon={Pill} label="طلبات صيدلية" value={kpis?.pharmacy_today_new ?? 0} tone="warning" loading={kpisQ.isLoading} />
            <KpiCard icon={Stethoscope} label="أطباء نشطون" value={kpis?.active_doctors ?? 0} tone="info" loading={kpisQ.isLoading} />
            <KpiCard icon={Bell} label="إشعارات جديدة" value={kpis?.notifications_unread ?? 0} tone="danger" loading={kpisQ.isLoading} />
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                نسبة إشغال الأسبوع (محجوز مقابل السعة المتاحة)
              </div>
              <div className="text-2xl font-bold text-primary">
                {kpis?.occupancy_pct != null ? `${kpis.occupancy_pct}%` : "—"}
              </div>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, Math.max(0, Number(kpis?.occupancy_pct ?? 0)))}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>محجوز: {kpis?.week_total ?? 0}</span>
              <span>السعة: {kpis?.week_capacity ?? 0}</span>
            </div>
          </div>
        </TabsContent>

        {/* Charts */}
        <TabsContent value="charts" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <ChartCard title="المواعيد آخر 30 يومًا" className="xl:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dailyChart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="المجموع" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#fillTotal)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="توزيع الحالات (30 يومًا)">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {statusChart.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLOR[entry.key] ?? "hsl(var(--muted-foreground))"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
                {statusChart.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[s.key] ?? "hsl(var(--muted-foreground))" }} />
                    {s.name} ({s.value})
                  </span>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ChartCard title="حسب التخصص (30 يومًا)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={specialtyChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="عدد" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="ساعات الذروة (0-23)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={peakChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} interval={1} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="عدد" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </TabsContent>

        {/* Upcoming bookings */}
        <TabsContent value="upcoming">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarCheck2 className="h-4 w-4 text-primary" />
                الحجوزات القادمة (اليوم + ٤٨ ساعة)
              </h2>
              <span className="text-xs text-muted-foreground">{upcoming.length}</span>
            </div>
            <div className="max-h-[600px] overflow-auto">
              {upcoming.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">لا حجوزات قادمة حاليًا.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.patient_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {a.doctor_name_ar ?? "—"}
                          {a.specialty_name_ar ? ` • ${a.specialty_name_ar}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-left">
                        <p className="text-xs font-semibold" dir="ltr">
                          {a.appointment_date} · {a.appointment_time.slice(0, 5)}
                        </p>
                        <StatusChip status={a.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Recent activity */}
        <TabsContent value="activity">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardList className="h-4 w-4 text-primary" />
                آخر الأنشطة
              </h2>
              <span className="text-xs text-muted-foreground">{recent.length}</span>
            </div>
            <div className="max-h-[600px] overflow-auto">
              {recent.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">لا نشاط بعد.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recent.map((r) => (
                    <li key={r.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium">{r.patient_name}</p>
                        <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
                          {new Date(r.changed_at).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.old_status ? STATUS_LABEL_AR[r.old_status] ?? r.old_status : "—"} →{" "}
                        <span className="font-medium text-foreground">
                          {r.new_status ? STATUS_LABEL_AR[r.new_status] ?? r.new_status : "—"}
                        </span>
                        {r.reason ? ` • ${r.reason}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "primary" | "success" | "info" | "warning" | "danger";
  loading?: boolean;
}) {
  const toneClass: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600",
    info: "bg-teal-500/10 text-teal-700",
    warning: "bg-amber-500/10 text-amber-700",
    danger: "bg-red-500/10 text-red-600",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${toneClass[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {loading ? <span className="text-muted-foreground">…</span> : value.toLocaleString("ar-SA")}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className ?? ""}`}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const bg = STATUS_COLOR[status] ?? "hsl(var(--muted-foreground))";
  return (
    <span
      className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
      style={{ backgroundColor: bg }}
    >
      {STATUS_LABEL_AR[status] ?? status}
    </span>
  );
}
