import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, RefreshCw, User } from "lucide-react";
import { getAdminUser } from "@/lib/admin/users.functions";

const ROLE_LABEL: Record<string, string> = {
  admin: "مسؤول",
  super_admin: "مسؤول أعلى",
  reception: "استقبال",
  pharmacy: "صيدلية",
  doctor: "طبيب",
  patient: "مريض",
  center_admin: "مسؤول مركز",
  branch_manager: "مدير فرع",
  reports_officer: "موظف تقارير",
  billing_officer: "موظف فوترة",
  insurance_officer: "موظف تأمين",
  support_agent: "دعم",
  content_manager: "إدارة محتوى",
  auditor: "مدقّق",
};

export const Route = createFileRoute("/_authenticated/admin/users/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل المستخدم | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل بيانات المستخدم</h2>
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
    <div className="container-app py-16 text-center text-muted-foreground">
      <p>المستخدم غير موجود.</p>
      <Link to="/admin/users" className="mt-3 inline-flex items-center gap-1 text-primary">
        <ArrowRight className="h-4 w-4" /> العودة إلى القائمة
      </Link>
    </div>
  ),
  component: AdminUserDetail,
});

function AdminUserDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getAdminUser);
  const query = useQuery({
    queryKey: ["admin-user", id],
    queryFn: () => getFn({ data: { id } }),
  });

  if (query.isLoading) {
    return (
      <div className="container-app py-6 space-y-3" aria-busy="true">
        <div className="h-8 w-64 rounded bg-muted/50 animate-pulse" />
        <div className="h-40 rounded-lg bg-muted/50 animate-pulse" />
        <div className="h-40 rounded-lg bg-muted/50 animate-pulse" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="container-app py-16 text-center text-destructive">
        <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
        <p>{(query.error as Error).message}</p>
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;

  const p = data.profile as Record<string, unknown> & {
    id: string;
    full_name?: string;
    phone?: string;
    verified_phone?: string;
    national_id?: string;
    date_of_birth?: string;
    gender?: string;
    preferred_language?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    insurance_provider?: string;
    insurance_policy_no?: string;
    created_at?: string;
    phone_verified_at?: string;
    branch?: { id: string; name_ar?: string; name_en?: string } | null;
  };

  return (
    <div className="container-app py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" /> رجوع إلى المستخدمين
        </Link>
      </div>

      <header className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{p.full_name || "بدون اسم"}</h1>
          <p className="text-sm text-muted-foreground font-mono">
            {p.verified_phone || p.phone || "—"}
          </p>
        </div>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">الملف الشخصي</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="الاسم الكامل" value={p.full_name} />
          <Field label="الهوية" value={p.national_id} />
          <Field label="تاريخ الميلاد" value={p.date_of_birth} />
          <Field label="الجنس" value={p.gender} />
          <Field label="اللغة" value={p.preferred_language} />
          <Field
            label="الفرع الافتراضي"
            value={p.branch?.name_ar || p.branch?.name_en}
          />
          <Field label="جهة اتصال الطوارئ" value={p.emergency_contact_name} />
          <Field label="جوال الطوارئ" value={p.emergency_contact_phone} />
          <Field label="مزود التأمين" value={p.insurance_provider} />
          <Field label="رقم البوليصة" value={p.insurance_policy_no} />
          <Field
            label="تاريخ التسجيل"
            value={p.created_at ? new Date(p.created_at).toLocaleString("ar-SA") : undefined}
          />
          <Field
            label="التحقق من الجوال"
            value={
              p.phone_verified_at ? new Date(p.phone_verified_at).toLocaleString("ar-SA") : undefined
            }
          />
        </dl>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">الأدوار</h2>
        {data.roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أدوار مسندة.</p>
        ) : (
          <ul className="space-y-2">
            {data.roles.map(
              (r: {
                id: string;
                role: string;
                is_global: boolean | null;
                branch_id: string | null;
                created_at: string | null;
              }) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <span className="font-medium">{ROLE_LABEL[r.role] ?? r.role}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.is_global ? "شامل" : r.branch_id ? `فرع: ${r.branch_id.slice(0, 8)}…` : "—"}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">أحدث المواعيد</h2>
        {data.recent_appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا مواعيد.</p>
        ) : (
          <ul className="divide-y">
            {data.recent_appointments.map(
              (a: {
                id: string;
                appointment_date: string | null;
                status: string | null;
              }) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <Link
                    to="/admin/appointments/$id"
                    params={{ id: a.id }}
                    className="text-primary hover:underline"
                  >
                    {a.appointment_date || a.id.slice(0, 8)}
                  </Link>
                  <span className="text-xs text-muted-foreground">{a.status || "—"}</span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value || "—"}</dd>
    </div>
  );
}
