import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  RefreshCw,
  ReceiptText,
  AlertTriangle,
  FileText,
  User,
  Building2,
  CalendarClock,
} from "lucide-react";
import { getAdminInvoice } from "@/lib/admin/billing.functions";

export const Route = createFileRoute("/_authenticated/admin/billing/$invoiceId")({
  head: ({ params }) => ({
    meta: [
      { title: `تفاصيل الفاتورة ${params.invoiceId.slice(0, 8)} | لوحة الإدارة` },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل الفاتورة</h2>
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
      الفاتورة غير موجودة.
    </div>
  ),
  component: InvoiceDetailPage,
});

function fmtMoney(total: number | null, currency: string | null): string {
  if (total == null) return "—";
  const c = (currency || "SAR").toUpperCase();
  try {
    return new Intl.NumberFormat("ar-SA", { style: "currency", currency: c }).format(Number(total));
  } catch {
    return `${total} ${c}`;
  }
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-SA", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const getFn = useServerFn(getAdminInvoice);
  const q = useQuery({
    queryKey: ["admin-invoice", invoiceId],
    queryFn: () => getFn({ data: { id: invoiceId } }),
    retry: (failureCount, err: any) =>
      !String(err?.message ?? "").includes("غير موجودة") && failureCount < 2,
  });

  if (q.isLoading) {
    return (
      <div className="container-app py-8">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-1/3 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
          <div className="h-40 rounded bg-muted" />
        </div>
      </div>
    );
  }
  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : "خطأ غير متوقع";
    if (msg.includes("غير موجودة")) throw notFound();
    throw q.error;
  }

  const inv: any = q.data;
  const patient = inv.patient;
  const appt = inv.appointment;
  const branch = appt?.branch;

  return (
    <div className="container-app py-8">
      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/admin/billing"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowRight className="h-4 w-4" /> عودة إلى الفواتير
        </Link>
        <button
          type="button"
          onClick={() => q.refetch()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> تحديث
        </button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-5">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ReceiptText className="h-6 w-6" aria-hidden="true" />
            {inv.invoice_number ?? `فاتورة ${inv.id.slice(0, 8)}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            الحالة: <span className="font-medium">{inv.status ?? "—"}</span> • أُنشئت{" "}
            {fmtDateTime(inv.created_at)}
          </p>
        </div>
        <div className="text-end">
          <div className="text-xs text-muted-foreground">الإجمالي</div>
          <div className="text-2xl font-bold">{fmtMoney(inv.total, inv.currency)}</div>
        </div>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <User className="h-4 w-4" aria-hidden="true" /> المريض
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">الاسم</dt>
              <dd className="font-medium">
                {patient?.full_name_ar || patient?.full_name_en || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">MRN</dt>
              <dd className="font-mono text-xs">{patient?.mrn ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">الجوال</dt>
              <dd>{patient?.phone ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Building2 className="h-4 w-4" aria-hidden="true" /> الفرع والموعد
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">الفرع</dt>
              <dd className="font-medium">{branch?.name_ar || branch?.name_en || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">تاريخ الموعد</dt>
              <dd className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                {appt?.appointment_date ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">معرّف الموعد</dt>
              <dd className="font-mono text-xs">{appt?.id ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border p-4 md:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">تفاصيل الفاتورة</h2>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">تاريخ الإصدار</dt>
              <dd>{inv.issued_at ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">تاريخ الدفع</dt>
              <dd>{fmtDateTime(inv.paid_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">العملة</dt>
              <dd>{inv.currency ?? "SAR"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">مرفق PDF</dt>
              <dd>
                {inv.pdf_path ? (
                  <span className="inline-flex items-center gap-1 font-mono text-xs">
                    <FileText className="h-3.5 w-3.5" /> {inv.pdf_path}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {inv.notes ? (
              <div className="sm:col-span-2">
                <dt className="mb-1 text-muted-foreground">ملاحظات</dt>
                <dd className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                  {inv.notes}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
    </div>
  );
}
