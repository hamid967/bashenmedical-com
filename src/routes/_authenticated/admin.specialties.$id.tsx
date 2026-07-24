import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Stethoscope,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Users,
  CalendarDays,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { getAdminSpecialty } from "@/lib/admin/specialties.functions";

export const Route = createFileRoute("/_authenticated/admin/specialties/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل التخصص | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل التخصص</h2>
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
    <div className="container-app py-16 text-center text-sm text-muted-foreground">
      التخصص غير موجود.
    </div>
  ),
  component: SpecialtyDetail,
});

function SpecialtyDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAdminSpecialty);
  const router = useRouter();
  const query = useQuery({
    queryKey: ["admin-specialty", id],
    queryFn: () => fn({ data: { id } }),
  });

  if (query.isLoading) {
    return (
      <div className="container-app py-6 space-y-3" aria-busy="true">
        <div className="h-8 w-1/3 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/60 animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-lg bg-muted/60 animate-pulse" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="container-app py-10">
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive"
        >
          <AlertTriangle className="inline h-4 w-4 me-1" />
          {(query.error as Error)?.message ?? "تعذّر التحميل"}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => router.invalidate()}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-background"
            >
              <RefreshCw className="h-3 w-3" /> إعادة المحاولة
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { specialty, doctors, today_appts, upcoming_appts } = query.data!;

  return (
    <div className="container-app py-6 space-y-6">
      <nav className="text-xs text-muted-foreground">
        <Link to="/admin/specialties" className="hover:text-foreground inline-flex items-center gap-1">
          <ArrowRight className="h-3 w-3" /> التخصصات
        </Link>
      </nav>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Stethoscope className="h-7 w-7 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">{specialty.name_ar}</h1>
            <p className="text-sm text-muted-foreground">{specialty.name_en}</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">{specialty.slug}</p>
          </div>
        </div>
        <div>
          {specialty.is_active ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> نشِط
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              <XCircle className="h-3 w-3" /> متوقّف
            </span>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="مؤشرات التخصص">
        <MiniKpi label="الأطباء" value={doctors.length} icon={Users} />
        <MiniKpi label="أطباء نشِطون" value={doctors.filter((d) => d.is_active).length} icon={CheckCircle2} tone="success" />
        <MiniKpi label="مواعيد اليوم" value={today_appts} icon={CalendarDays} />
        <MiniKpi label="قادمة" value={upcoming_appts.length} icon={CalendarDays} />
      </section>

      {(specialty.description_ar || specialty.description_en) && (
        <section className="rounded-lg border bg-card p-4 text-sm">
          {specialty.description_ar && <p>{specialty.description_ar}</p>}
          {specialty.description_en && (
            <p className="mt-2 text-muted-foreground" dir="ltr">
              {specialty.description_en}
            </p>
          )}
        </section>
      )}

      <section className="rounded-lg border bg-card overflow-hidden">
        <header className="border-b px-4 py-2 flex items-center gap-2 bg-muted/30">
          <Users className="h-4 w-4" />
          <h2 className="text-sm font-medium">الأطباء ({doctors.length})</h2>
        </header>
        {doctors.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            لا يوجد أطباء مرتبطون بهذا التخصص.
          </div>
        ) : (
          <ul className="divide-y">
            {doctors.map((d) => (
              <li key={d.id} className="px-4 py-2 text-sm flex items-center justify-between">
                <span>{d.full_name_ar}</span>
                {d.is_active ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">نشِط</span>
                ) : (
                  <span className="text-xs text-muted-foreground">متوقّف</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card overflow-hidden">
        <header className="border-b px-4 py-2 flex items-center gap-2 bg-muted/30">
          <CalendarDays className="h-4 w-4" />
          <h2 className="text-sm font-medium">أقرب المواعيد ({upcoming_appts.length})</h2>
        </header>
        {upcoming_appts.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
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
                {upcoming_appts.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 tabular-nums">{a.appointment_date}</td>
                    <td className="px-3 py-2 tabular-nums">{a.appointment_time}</td>
                    <td className="px-3 py-2">{a.patient_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone?: "success";
}) {
  const toneCls =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-primary";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${toneCls}`} aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">
        {value.toLocaleString("ar-SA")}
      </div>
    </div>
  );
}
