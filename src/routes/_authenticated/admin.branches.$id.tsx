import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Phone,
  Mail,
  CalendarDays,
  Users,
  Award,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { getAdminBranch } from "@/lib/admin/branches.functions";

export const Route = createFileRoute("/_authenticated/admin/branches/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `تفاصيل الفرع | لوحة الإدارة` },
      { name: "description", content: `عرض تفاصيل الفرع ${params.id}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الفرع</h2>
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
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-muted-foreground">الفرع غير موجود.</div>
  ),
  component: BranchDetail,
});

function BranchDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAdminBranch);
  const query = useQuery({
    queryKey: ["admin-branch", id],
    queryFn: () => fn({ data: { id } }),
  });

  return (
    <div className="container-app py-6 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin/branches" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="h-4 w-4" /> الفروع
        </Link>
        <span>/</span>
        <span className="text-foreground">{query.data?.branch.name_ar ?? "..."}</span>
      </div>

      {query.isLoading ? (
        <div className="rounded-lg border bg-card p-6 space-y-3" aria-busy="true">
          <div className="h-6 w-1/3 rounded-md bg-muted/60 animate-pulse" />
          <div className="h-4 w-2/3 rounded-md bg-muted/60 animate-pulse" />
          <div className="h-40 rounded-md bg-muted/50 animate-pulse" />
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-8 text-center text-sm text-destructive"
        >
          <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
        </div>
      ) : query.data ? (
        <>
          <header className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <Building2 className="h-7 w-7 text-primary mt-1" />
              <div>
                <h1 className="text-xl font-semibold">{query.data.branch.name_ar}</h1>
                <p className="text-sm text-muted-foreground">{query.data.branch.name_en}</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  {query.data.branch.slug}
                </p>
              </div>
            </div>
            <div>
              {query.data.branch.is_active ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> فرع نشِط
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  <XCircle className="h-3.5 w-3.5" /> متوقّف
                </span>
              )}
            </div>
          </header>

          {/* KPIs */}
          <section aria-label="مؤشرات الفرع" className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniKpi label="أطباء الفرع" value={query.data.doctors.length} icon={Users} />
            <MiniKpi label="مواعيد اليوم" value={query.data.today_appts} icon={CalendarDays} />
            <MiniKpi
              label="مواعيد قادمة"
              value={query.data.upcoming_appts.length}
              icon={CalendarDays}
            />
            <MiniKpi
              label="مراكز التميّز"
              value={query.data.excellence_centers.length}
              icon={Award}
            />
          </section>

          {/* Contact */}
          <section className="rounded-lg border bg-card p-4 space-y-2">
            <h2 className="text-sm font-medium mb-2">معلومات الاتصال</h2>
            <MetaRow
              icon={MapPin}
              label="العنوان"
              value={query.data.branch.address_ar || query.data.branch.city_ar || "—"}
            />
            <MetaRow icon={Phone} label="الهاتف" value={query.data.branch.phone ?? "—"} mono />
            <MetaRow
              icon={Phone}
              label="طوارئ"
              value={query.data.branch.emergency_phone ?? "—"}
              mono
            />
            <MetaRow icon={Mail} label="البريد" value={query.data.branch.email ?? "—"} mono />
          </section>

          {/* Doctors */}
          <section className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-medium">أطباء الفرع</h2>
              <span className="text-xs text-muted-foreground">({query.data.doctors.length})</span>
            </div>
            {query.data.doctors.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                لا يوجد أطباء مُسنَدون لهذا الفرع بعد.
              </div>
            ) : (
              <ul className="divide-y">
                {query.data.doctors.map((d: any) => (
                  <li key={d.id} className="px-4 py-2 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{d.full_name_ar}</div>
                      <div className="text-xs text-muted-foreground">{d.specialty ?? "—"}</div>
                    </div>
                    {!d.is_active && (
                      <span className="text-xs text-muted-foreground">غير نشِط</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Upcoming appointments */}
          <section className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-medium">أقرب المواعيد</h2>
            </div>
            {query.data.upcoming_appts.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                لا توجد مواعيد قادمة.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr className="text-right">
                      <th className="px-3 py-2 font-medium">التاريخ</th>
                      <th className="px-3 py-2 font-medium">الوقت</th>
                      <th className="px-3 py-2 font-medium">المريض</th>
                      <th className="px-3 py-2 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.upcoming_appts.map((a: any) => (
                      <tr key={a.id} className="border-t">
                        <td className="px-3 py-2 tabular-nums">{a.appointment_date}</td>
                        <td className="px-3 py-2 tabular-nums font-mono text-xs">
                          {a.appointment_time}
                        </td>
                        <td className="px-3 py-2">{a.patient_name ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Excellence centers */}
          {query.data.excellence_centers.length > 0 && (
            <section className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Award className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-medium">مراكز التميّز</h2>
              </div>
              <ul className="flex flex-wrap gap-2">
                {query.data.excellence_centers.map((ec: any) => (
                  <li key={ec.id} className="rounded-md border px-2 py-1 text-xs">
                    {ec.name_ar}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function MiniKpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">
        {value.toLocaleString("ar-SA")}
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 border-b last:border-b-0">
      <span className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className={`text-sm text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
