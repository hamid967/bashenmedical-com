import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, AlertTriangle, RefreshCw, User } from "lucide-react";
import { getAdminPatient } from "@/lib/admin/patients.functions";

export const Route = createFileRoute("/_authenticated/admin/patients/$id")({
  head: () => ({
    meta: [{ title: "ملف المريض | لوحة الإدارة" }, { name: "robots", content: "noindex" }],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
        <RefreshCw className="inline h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container-app py-16 text-center text-muted-foreground">المريض غير موجود.</div>
  ),
  component: PatientDetail,
});

function PatientDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getAdminPatient);
  const q = useQuery({ queryKey: ["admin-patient", id], queryFn: () => getFn({ data: { id } }) });

  if (q.isLoading)
    return (
      <div className="container-app py-8">
        <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    );
  if (q.isError) throw q.error;
  if (!q.data) throw notFound();
  const p: unknown = q.data.patient;

  return (
    <div className="container-app py-8">
      <Link
        to="/admin/patients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowRight className="h-4 w-4" /> العودة إلى المرضى
      </Link>
      <header className="flex items-center gap-3">
        <User className="h-6 w-6" />
        <h1 className="text-2xl font-bold">{p.full_name_ar ?? p.full_name_en ?? p.mrn}</h1>
        <span className="font-mono text-xs text-muted-foreground">{p.mrn}</span>
      </header>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">التواصل</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الجوال</dt>
              <dd className="font-mono text-xs">{p.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">البريد</dt>
              <dd className="text-xs">{p.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">المدينة</dt>
              <dd>{p.city ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">العنوان</dt>
              <dd className="text-xs">{p.address ?? "—"}</dd>
            </div>
          </dl>
        </section>
        <section className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">البيانات الديموغرافية</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الجنس</dt>
              <dd>{p.gender ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">تاريخ الميلاد</dt>
              <dd>{p.date_of_birth ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الجنسية</dt>
              <dd>{p.nationality ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">فصيلة الدم</dt>
              <dd>{p.blood_type ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">الهوية</dt>
              <dd className="font-mono text-xs">{p.national_id ?? "—"}</dd>
            </div>
          </dl>
        </section>
        {p.notes ? (
          <section className="rounded-lg border p-4 md:col-span-2">
            <h2 className="text-sm font-semibold text-muted-foreground">ملاحظات</h2>
            <p className="mt-2 text-sm whitespace-pre-wrap">{p.notes}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
