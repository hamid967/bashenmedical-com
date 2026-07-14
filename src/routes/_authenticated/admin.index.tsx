import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getAdminStats, getMyRoles } from "@/lib/admin.functions";
import type { AdminRole } from "@/components/admin/AdminShell";
import {
  CalendarCheck,
  Clock,
  Stethoscope,
  Package,
  AlertCircle,
  ArrowLeft,
  Users,
  ClipboardList,
  ShieldCheck,
  MessageSquare,
  ArchiveRestore,
  Building2,
  FileBarChart,
} from "lucide-react";

const statsQuery = queryOptions({
  queryKey: ["admin", "stats"],
  queryFn: () => getAdminStats(),
  staleTime: 30_000,
});
const rolesQuery = queryOptions({
  queryKey: ["admin", "my-roles"],
  queryFn: () => getMyRoles(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(rolesQuery),
      context.queryClient.ensureQueryData(statsQuery).catch(() => null),
    ]);
    return null;
  },
  head: () => ({
    meta: [
      { title: "لوحة القيادة | مركز باعشن" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDashboard,
});

type QuickLink = {
  to: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: AdminRole[];
};

const QUICK_LINKS: QuickLink[] = [
  { to: "/appointments-queue", label: "طابور المواعيد", desc: "استقبال، تأكيد، إعادة جدولة", icon: CalendarCheck, roles: ["admin", "reception", "doctor"] },
  { to: "/patients-management", label: "المرضى", desc: "بحث، ملفات، متابعة", icon: Users, roles: ["admin", "reception", "doctor", "nurse"] },
  { to: "/doctors-management", label: "الأطباء", desc: "تعديل الملفات والتوفر", icon: Stethoscope, roles: ["admin", "hr"] },
  { to: "/availability-management", label: "التوفر والجدولة", desc: "خانات الحجز والإجازات", icon: ClipboardList, roles: ["admin", "hr"] },
  { to: "/hr-management", label: "الموارد البشرية", desc: "موظفون، حضور، إجازات", icon: Users, roles: ["admin", "hr"] },
  { to: "/orders-unified", label: "الطلبات الموحدة", desc: "صيدلية، مختبر، أشعة", icon: Package, roles: ["admin", "reception", "pharmacy"] },
  { to: "/inventory-management", label: "المخزون", desc: "حركة الأدوية والمستهلكات", icon: ArchiveRestore, roles: ["admin", "pharmacy"] },
  { to: "/complaints-admin", label: "الشكاوى", desc: "متابعة ورد", icon: MessageSquare, roles: ["admin", "reception"] },
  { to: "/corporate-admin", label: "الشركات", desc: "طلبات وعقود مؤسسية", icon: Building2, roles: ["admin"] },
  { to: "/reports", label: "التقارير", desc: "أداء العيادات والمالية", icon: FileBarChart, roles: ["admin"] },
  { to: "/rbac", label: "الأدوار والصلاحيات", desc: "إدارة صلاحيات الطاقم", icon: ShieldCheck, roles: ["admin"] },
];

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "accent" | "warning" | "danger" | "success";
  to?: string;
}) {
  const toneCls =
    tone === "accent"
      ? "bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent-ink)]"
      : tone === "warning"
      ? "bg-amber-50 text-amber-700"
      : tone === "danger"
      ? "bg-red-50 text-[color:var(--ac-danger)]"
      : tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-[color:var(--ac-subtle)] text-[color:var(--ac-ink-2)]";

  const inner = (
    <div className="ac-card p-5 h-full flex flex-col gap-3 transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <div className={`h-10 w-10 rounded-xl grid place-items-center ${toneCls}`}>
          <Icon className="h-5 w-5" />
        </div>
        {to && <ArrowLeft className="h-4 w-4 text-[color:var(--ac-muted)]" />}
      </div>
      <div>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        <div className="text-sm text-[color:var(--ac-ink-2)] mt-1">{label}</div>
        {hint && <div className="text-xs text-[color:var(--ac-ink-3)] mt-1">{hint}</div>}
      </div>
    </div>
  );

  return to ? (
    <Link to={to} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function AdminDashboard() {
  const { data: rolesData } = useSuspenseQuery(rolesQuery);
  const { data: stats } = useSuspenseQuery(statsQuery);
  const roles = (rolesData?.roles ?? []) as AdminRole[];
  const isAdmin = roles.includes("admin");

  const links = QUICK_LINKS.filter((l) => !l.roles || l.roles.some((r) => roles.includes(r)));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-[color:var(--ac-muted)] font-semibold">
            لوحة القيادة
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold mt-1">أهلاً بك في مركز باعشن</h1>
          <p className="text-sm text-[color:var(--ac-ink-3)] mt-2 max-w-2xl">
            نظرة سريعة على عمليات اليوم مع اختصارات لأهم أدواتك حسب دورك.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {roles.length === 0 && (
            <span className="ac-chip bg-amber-50 text-amber-700">لم يتم منح دور بعد</span>
          )}
          {roles.map((r) => (
            <span key={r} className="ac-chip bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent-ink)]">
              {r}
            </span>
          ))}
        </div>
      </div>

      {/* KPIs */}
      {stats ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={CalendarCheck}
            label="مواعيد اليوم"
            value={stats.appointmentsToday}
            tone="accent"
            to="/appointments-queue"
          />
          <KpiCard
            icon={Clock}
            label="مواعيد بانتظار التأكيد"
            value={stats.appointmentsPending}
            tone="warning"
            to="/appointments-queue"
          />
          <KpiCard
            icon={Stethoscope}
            label="الأطباء النشطون"
            value={stats.doctorsActive}
            to="/doctors-management"
          />
          <KpiCard
            icon={Package}
            label="طلبات قيد المعالجة"
            value={stats.ordersPending}
            hint={`إجمالي: ${stats.ordersTotal}`}
            tone={stats.ordersPending > 0 ? "danger" : "default"}
            to="/orders-unified"
          />
        </section>
      ) : (
        <section className="ac-card p-6 flex items-center gap-3 text-sm text-[color:var(--ac-ink-3)]">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <span>
            المؤشرات غير متاحة لدورك الحالي. استخدم الاختصارات أدناه للانتقال إلى الأدوات المتاحة لك.
          </span>
        </section>
      )}

      {/* Quick access grid */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-bold">اختصارات سريعة</h2>
          {isAdmin && (
            <Link
              to="/admin/classic"
              className="text-sm font-semibold text-[color:var(--ac-accent-ink)] hover:underline"
            >
              فتح النسخة الكلاسيكية
            </Link>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className="ac-card p-5 flex items-start gap-4 transition-all hover:border-[color:var(--ac-line-strong)] hover:-translate-y-0.5"
              >
                <div className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[color:var(--ac-accent-soft)] text-[color:var(--ac-accent-ink)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[color:var(--ac-ink)]">{l.label}</div>
                  <div className="text-xs text-[color:var(--ac-ink-3)] mt-1 line-clamp-2">{l.desc}</div>
                </div>
                <ArrowLeft className="h-4 w-4 text-[color:var(--ac-muted)] mt-1" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
