import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, RefreshCw, MessageCircle } from "lucide-react";
import { getAdminWhatsappRequest } from "@/lib/admin/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp/$inquiryId")({
  head: () => ({
    meta: [
      { title: "تفاصيل طلب واتساب | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل التفاصيل</h2>
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
      الطلب غير موجود.
    </div>
  ),
  component: WhatsappDetailPage,
});

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium break-words">{value ?? "—"}</div>
    </div>
  );
}

function WhatsappDetailPage() {
  const { inquiryId } = Route.useParams();
  const getFn = useServerFn(getAdminWhatsappRequest);
  const q = useQuery({
    queryKey: ["admin-whatsapp", inquiryId],
    queryFn: () => getFn({ data: { id: inquiryId } }),
  });

  if (q.isLoading) {
    return (
      <div className="container-app py-8 space-y-3">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="container-app py-16 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل التفاصيل</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {q.error instanceof Error ? q.error.message : "خطأ غير متوقع"}
        </p>
      </div>
    );
  }

  const { row, updates, delivery } = q.data as any;
  const branch = row.branch;

  return (
    <div className="container-app py-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/admin/whatsapp"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-4 w-4" /> العودة للقائمة
          </Link>
          <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
            {row.request_number}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
            المعالجة: {row.internal_status ?? "—"}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5">
            التحويل: {row.whatsapp_handoff_status ?? "—"}
          </span>
          {row.source && (
            <span className="rounded-full bg-muted px-2 py-0.5">المصدر: {row.source}</span>
          )}
        </div>
      </header>

      <section aria-label="بيانات المُستفسر" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="الاسم" value={row.full_name} />
        <Field label="الجوال" value={row.mobile_e164 || row.mobile_number} />
        <Field label="البريد" value={row.email} />
        <Field label="الهوية الوطنية" value={row.national_id} />
        <Field label="الخدمة" value={row.service_label} />
        <Field label="التخصص" value={row.specialty?.name_ar || row.specialty?.name_en} />
        <Field label="الطبيب المطلوب" value={row.doctor?.full_name_ar || row.doctor?.full_name_en} />
        <Field label="التأمين" value={row.insurance?.name_ar || row.insurance?.name_en} />
        <Field label="الفرع" value={branch?.name_ar || branch?.name_en} />
        <Field label="التاريخ المفضل" value={row.preferred_date} />
        <Field label="قناة التواصل المفضلة" value={row.preferred_contact_method} />
        <Field label="فُتح واتساب في" value={fmtDate(row.whatsapp_opened_at)} />
        <Field label="أُنشئ في" value={fmtDate(row.created_at)} />
        <Field label="آخر تحديث" value={fmtDate(row.updated_at)} />
        <Field label="أُغلق في" value={fmtDate(row.closed_at)} />
        <Field
          label="الموعد المرتبط"
          value={
            row.linked_appointment_id ? (
              <Link
                to="/admin/appointments/$id"
                params={{ id: row.linked_appointment_id }}
                className="text-primary hover:underline"
              >
                فتح الموعد
              </Link>
            ) : (
              "—"
            )
          }
        />
      </section>

      {row.notes && (
        <section aria-label="ملاحظات المُستفسر" className="rounded-md border p-4">
          <div className="text-xs text-muted-foreground">ملاحظات المُستفسر</div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{row.notes}</p>
        </section>
      )}

      <section aria-label="سجل التحديثات" className="overflow-hidden rounded-lg border">
        <header className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
          سجل التحديثات ({updates.length})
        </header>
        {updates.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            لا توجد تحديثات على هذا الطلب بعد.
          </div>
        ) : (
          <ul className="divide-y">
            {updates.map((u: any) => (
              <li key={u.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{u.update_type}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</span>
                </div>
                {u.public_message && (
                  <p className="mt-1 text-muted-foreground">{u.public_message}</p>
                )}
                {u.internal_note && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    ملاحظة داخلية: {u.internal_note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="سجلات تسليم واتساب" className="overflow-hidden rounded-lg border">
        <header className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
          سجلات تسليم واتساب ({delivery.length})
        </header>
        {delivery.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            لا توجد سجلات تسليم مرتبطة بهذا الرقم.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">القالب</th>
                <th className="px-3 py-2 text-start">المزوّد</th>
                <th className="px-3 py-2 text-start">الحالة</th>
                <th className="px-3 py-2 text-start">المحاولة</th>
                <th className="px-3 py-2 text-start">الخطأ</th>
                <th className="px-3 py-2 text-start">في</th>
              </tr>
            </thead>
            <tbody>
              {delivery.map((d: any) => (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2">{d.template ?? "—"}</td>
                  <td className="px-3 py-2">{d.provider ?? "—"}</td>
                  <td className="px-3 py-2">{d.status ?? "—"}</td>
                  <td className="px-3 py-2">{d.attempt ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-destructive">
                    {d.error_message ?? ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {fmtDate(d.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
