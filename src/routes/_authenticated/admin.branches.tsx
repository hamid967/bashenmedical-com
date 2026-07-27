import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Building2,
  RefreshCw,
  AlertTriangle,
  Search,
  ChevronLeft,
  MapPin,
  Users,
  CalendarDays,
  Award,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { listAdminBranches } from "@/lib/admin/branches.functions";

export const Route = createFileRoute("/_authenticated/admin/branches")({
  head: () => ({
    meta: [
      { title: "الفروع | لوحة الإدارة" },
      { name: "description", content: "إدارة فروع المجمّع والمقاييس التشغيلية اليومية." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الفروع</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  component: BranchesList,
});

export function BranchesList() {
  const fn = useServerFn(listAdminBranches);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const query = useQuery({
    queryKey: ["admin-branches", q, status],
    queryFn: () => fn({ data: { q: q.trim() || undefined, status } }),
  });

  return (
    <div className="container-app py-6 space-y-4">
      <header className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-semibold">الفروع</h1>
          <p className="text-sm text-muted-foreground">نظرة تشغيلية شاملة على فروع المجمّع</p>
        </div>
      </header>

      {/* KPI strip */}
      <section aria-label="مؤشرات الفروع" className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          label="إجمالي الفروع"
          value={query.data?.kpis.total}
          icon={Building2}
          loading={query.isLoading}
          error={query.isError}
        />
        <KpiCard
          label="نشِط"
          value={query.data?.kpis.active}
          icon={CheckCircle2}
          loading={query.isLoading}
          error={query.isError}
          tone="success"
        />
        <KpiCard
          label="غير نشِط"
          value={query.data?.kpis.inactive}
          icon={XCircle}
          loading={query.isLoading}
          error={query.isError}
          tone="muted"
        />
        <KpiCard
          label="أطباء مُسندون"
          value={query.data?.kpis.doctors_assigned}
          icon={Users}
          loading={query.isLoading}
          error={query.isError}
        />
        <KpiCard
          label="مواعيد اليوم"
          value={query.data?.kpis.today_appts}
          icon={CalendarDays}
          loading={query.isLoading}
          error={query.isError}
        />
      </section>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو المدينة أو الـslug"
            className="w-full rounded-md border bg-background pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="بحث"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as unknown)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="الحالة"
        >
          <option value="all">كل الحالات</option>
          <option value="active">نشِط</option>
          <option value="inactive">غير نشِط</option>
        </select>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
          aria-label="تحديث"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </section>

      {/* Body */}
      {query.isLoading ? (
        <div className="rounded-lg border bg-card p-6 space-y-3" aria-busy="true">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted/60 animate-pulse" />
          ))}
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-8 text-center text-sm text-destructive"
        >
          <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => query.refetch()}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-background"
            >
              <RefreshCw className="h-3 w-3" /> إعادة المحاولة
            </button>
          </div>
        </div>
      ) : !query.data?.rows.length ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto h-10 w-10 opacity-40 mb-2" />
          لا توجد فروع تطابق البحث الحالي.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr className="text-right">
                  <th className="px-3 py-2 font-medium">الفرع</th>
                  <th className="px-3 py-2 font-medium">المدينة</th>
                  <th className="px-3 py-2 font-medium">الحالة</th>
                  <th className="px-3 py-2 font-medium">الأطباء</th>
                  <th className="px-3 py-2 font-medium">مواعيد اليوم</th>
                  <th className="px-3 py-2 font-medium">مراكز التميّز</th>
                  <th className="px-3 py-2 font-medium sr-only">فتح</th>
                </tr>
              </thead>
              <tbody>
                {query.data.rows.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        to="/admin/branches/$id"
                        params={{ id: b.id }}
                        className="font-medium hover:text-primary"
                      >
                        {b.name_ar}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">{b.slug}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {b.city_ar ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {b.city_ar}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {b.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> نشِط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <XCircle className="h-3 w-3" /> متوقّف
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{b.doctors_count}</td>
                    <td className="px-3 py-2 tabular-nums">{b.today_appts}</td>
                    <td className="px-3 py-2 tabular-nums">{b.excellence_centers_count}</td>
                    <td className="px-3 py-2 text-left">
                      <Link
                        to="/admin/branches/$id"
                        params={{ id: b.id }}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        تفاصيل <ChevronLeft className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
  error,
  tone,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  loading: boolean;
  error: boolean;
  tone?: "success" | "muted";
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-primary";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${toneCls}`} aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums min-h-[2rem]">
        {loading ? (
          <span className="inline-block h-6 w-12 rounded bg-muted animate-pulse" />
        ) : error ? (
          <span className="text-xs text-destructive">تعذّر</span>
        ) : value == null ? (
          "—"
        ) : (
          value.toLocaleString("ar-SA")
        )}
      </div>
    </div>
  );
}
