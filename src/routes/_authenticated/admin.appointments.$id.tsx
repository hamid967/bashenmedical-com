import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AlertTriangle, RefreshCw, CalendarCheck } from "lucide-react";
import { getAdminAppointment } from "@/lib/admin/appointments.functions";

export const Route = createFileRoute("/_authenticated/admin/appointments/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الموعد | لوحة الإدارة" }, { name: "robots", content: "noindex" }] }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><RefreshCw className="inline h-4 w-4" /> إعادة المحاولة</button>
    </div>
  ),
  notFoundComponent: () => <div className="container-app py-16 text-center text-muted-foreground">الموعد غير موجود.</div>,
  component: AppointmentDetail,
});

function AppointmentDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getAdminAppointment);
  const q = useQuery({ queryKey: ["admin-appointment", id], queryFn: () => getFn({ data: { id } }) });

  if (q.isLoading) return <div className="container-app py-8"><div className="h-8 w-1/3 animate-pulse rounded bg-muted" /></div>;
  if (q.isError) throw q.error;
  if (!q.data) throw notFound();
  const { appointment: a, history } = q.data;

  return (
    <div className="container-app py-8">
      <Link to="/admin/appointments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowRight className="h-4 w-4" /> العودة إلى المواعيد
      </Link>
      <header className="flex items-center gap-3">
        <CalendarCheck className="h-6 w-6" />
        <h1 className="text-2xl font-bold">{a.reference_number ?? a.id.slice(0, 8)}</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{a.status}</span>
      </header>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">المريض</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">الاسم</dt><dd>{a.patient_name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">الجوال</dt><dd className="font-mono text-xs">{a.patient_phone ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">البريد</dt><dd className="text-xs">{a.patient_email ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">الهوية</dt><dd className="font-mono text-xs">{a.national_id ?? "—"}</dd></div>
          </dl>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">الموعد</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">التاريخ</dt><dd>{a.appointment_date}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">الوقت</dt><dd>{a.appointment_time}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">الطبيب</dt><dd>{a.doctor?.name_ar ?? a.doctor?.name_en ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">الفرع</dt><dd>{a.branch?.name_ar ?? a.branch?.name_en ?? "—"}</dd></div>
          </dl>
        </section>
        {a.reason ? (
          <section className="rounded-lg border p-4 md:col-span-2">
            <h2 className="text-sm font-semibold text-muted-foreground">سبب الزيارة</h2>
            <p className="mt-2 text-sm whitespace-pre-wrap">{a.reason}</p>
          </section>
        ) : null}
        <section className="rounded-lg border p-4 md:col-span-2">
          <h2 className="text-sm font-semibold text-muted-foreground">سجل الحالات ({history.length})</h2>
          {history.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">لا يوجد سجل حالات.</p> : (
            <ul className="mt-2 space-y-1 text-sm">
              {history.map((h: any) => (
                <li key={h.id} className="flex justify-between border-b py-1">
                  <span>{h.from_status ?? "—"} ← {h.to_status}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.changed_at).toLocaleString("ar-SA")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
