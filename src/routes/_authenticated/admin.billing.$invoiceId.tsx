import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowRight,
  RefreshCw,
  ReceiptText,
  AlertTriangle,
  FileText,
  User,
  Building2,
  CalendarClock,
  Wallet,
  Ban,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAdminInvoice,
  recordPayment,
  voidInvoice,
  requestRefund,
  decideRefund,
  listInvoiceRefunds,
} from "@/lib/admin/billing.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    retry: (failureCount, err: unknown) =>
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

  const inv: unknown = q.data;
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

      <BillingActions invoice={inv} onChanged={() => q.refetch()} />
    </div>
  );
}

// ------------- Billing state-machine actions (B3) -------------
function BillingActions({ invoice, onChanged }: { invoice: unknown; onChanged: () => void }) {
  const qc = useQueryClient();
  const listRefundsFn = useServerFn(listInvoiceRefunds);
  const recordFn = useServerFn(recordPayment);
  const voidFn = useServerFn(voidInvoice);
  const requestFn = useServerFn(requestRefund);
  const decideFn = useServerFn(decideRefund);

  const payments = useQuery({
    queryKey: ["admin-invoice-refunds", invoice.id],
    queryFn: () => listRefundsFn({ data: { invoice_id: invoice.id } }),
  });

  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState<null | { payment_id: string; max: number }>(null);
  const [payAmount, setPayAmount] = useState<string>(String(invoice.total ?? 0));
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payNote, setPayNote] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const refetchAll = () => {
    payments.refetch();
    onChanged();
    qc.invalidateQueries({ queryKey: ["admin-invoices"] });
  };

  const record = useMutation({
    mutationFn: () =>
      recordFn({
        data: {
          invoice_id: invoice.id,
          amount: Number(payAmount),
          method: payMethod as unknown,
          idempotency_key: `manual-${invoice.id}-${Date.now()}`,
          note: payNote || undefined,
        },
      }),
    onSuccess: (r: unknown) => {
      toast.success(r.deduplicated ? "دفعة مسجّلة مسبقاً (نفس المفتاح)." : "تم تسجيل الدفعة.");
      setPayOpen(false);
      setPayNote("");
      refetchAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const voidM = useMutation({
    mutationFn: () => voidFn({ data: { id: invoice.id, reason: voidReason.trim() } }),
    onSuccess: () => {
      toast.success("تم إلغاء الفاتورة.");
      setVoidOpen(false);
      refetchAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const request = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          payment_id: refundOpen!.payment_id,
          amount: Number(refundAmount),
          reason: refundReason.trim(),
        },
      }),
    onSuccess: (r: unknown) => {
      toast.success(`تم إنشاء طلب استرداد ${r.receipt_reference}.`);
      setRefundOpen(null);
      setRefundAmount("");
      setRefundReason("");
      refetchAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" | "completed" }) =>
      decideFn({ data: v }),
    onSuccess: () => {
      toast.success("تم تحديث حالة الاسترداد.");
      refetchAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canRecord = invoice.status !== "cancelled" && invoice.status !== "paid";
  const canVoid =
    invoice.status !== "paid" &&
    invoice.status !== "partially_paid" &&
    invoice.status !== "cancelled";

  return (
    <>
      <section className="mt-6 rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Wallet className="h-4 w-4" /> إجراءات الفوترة
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!canRecord}
              onClick={() => setPayOpen(true)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
            >
              تسجيل دفعة
            </button>
            <button
              disabled={!canVoid}
              onClick={() => setVoidOpen(true)}
              className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              <Ban className="me-1 inline h-3.5 w-3.5" /> إلغاء
            </button>
          </div>
        </div>

        {payments.isLoading ? (
          <div className="text-sm text-muted-foreground">جارٍ تحميل الدفعات…</div>
        ) : !payments.data || payments.data.payments.length === 0 ? (
          <div className="text-sm text-muted-foreground">لا توجد دفعات مسجّلة.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {payments.data.payments.map((p: unknown) => (
              <li key={p.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {Number(p.amount).toLocaleString("ar-SA")} {invoice.currency ?? "SAR"} ·{" "}
                      {p.method}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.status} · {p.paid_at ? new Date(p.paid_at).toLocaleString("ar-SA") : "—"}
                    </div>
                  </div>
                  {p.status === "succeeded" && (
                    <button
                      onClick={() => {
                        setRefundOpen({ payment_id: p.id, max: Number(p.amount) });
                        setRefundAmount(String(p.amount));
                      }}
                      className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      <Undo2 className="me-1 inline h-3 w-3" /> طلب استرداد
                    </button>
                  )}
                </div>
                {p.refunds && p.refunds.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                    {p.refunds.map((r: unknown) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="font-mono">{r.receipt_reference}</span> ·{" "}
                          {Number(r.amount).toLocaleString("ar-SA")} · {r.status}
                        </span>
                        <span className="flex gap-1">
                          {r.status === "pending" && (
                            <>
                              <button
                                onClick={() => decide.mutate({ id: r.id, decision: "approved" })}
                                className="rounded border px-2 py-0.5 hover:bg-muted"
                              >
                                اعتماد
                              </button>
                              <button
                                onClick={() => decide.mutate({ id: r.id, decision: "rejected" })}
                                className="rounded border border-destructive/40 px-2 py-0.5 text-destructive hover:bg-destructive/10"
                              >
                                رفض
                              </button>
                            </>
                          )}
                          {r.status === "approved" && (
                            <button
                              onClick={() => decide.mutate({ id: r.id, decision: "completed" })}
                              className="rounded border border-emerald-400 px-2 py-0.5 text-emerald-700 hover:bg-emerald-50"
                            >
                              تنفيذ
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل دفعة</DialogTitle>
            <DialogDescription>
              يتم توليد مفتاح idempotency تلقائياً لمنع الازدواج عند إعادة الإرسال.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block">
              المبلغ
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="mt-1 w-full rounded-md border p-2"
              />
            </label>
            <label className="block">
              الطريقة
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="mt-1 w-full rounded-md border p-2"
              >
                {[
                  "cash",
                  "bank_transfer",
                  "mada",
                  "visa",
                  "mastercard",
                  "apple_pay",
                  "stc_pay",
                  "insurance",
                  "other",
                ].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              ملاحظة (اختياري)
              <textarea
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-md border p-2"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              onClick={() => setPayOpen(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              إلغاء
            </button>
            <button
              onClick={() => record.mutate()}
              disabled={record.isPending || !Number(payAmount)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              تأكيد
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إلغاء الفاتورة</DialogTitle>
            <DialogDescription>
              لا يمكن إلغاء فاتورة مدفوعة كلياً أو جزئياً — استخدم الاسترداد بدلاً من ذلك.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="سبب الإلغاء…"
            className="min-h-24 w-full rounded-md border p-2 text-sm"
          />
          <DialogFooter>
            <button
              onClick={() => setVoidOpen(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              تراجع
            </button>
            <button
              onClick={() => voidM.mutate()}
              disabled={voidM.isPending || voidReason.trim().length < 3}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-50"
            >
              تأكيد الإلغاء
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!refundOpen} onOpenChange={(o) => !o && setRefundOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>طلب استرداد</DialogTitle>
            <DialogDescription>
              الحد الأقصى: {refundOpen?.max.toLocaleString("ar-SA")} {invoice.currency ?? "SAR"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block">
              المبلغ
              <input
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="mt-1 w-full rounded-md border p-2"
              />
            </label>
            <label className="block">
              السبب
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="mt-1 min-h-16 w-full rounded-md border p-2"
              />
            </label>
          </div>
          <DialogFooter>
            <button
              onClick={() => setRefundOpen(null)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              تراجع
            </button>
            <button
              onClick={() => request.mutate()}
              disabled={
                request.isPending ||
                !Number(refundAmount) ||
                Number(refundAmount) > (refundOpen?.max ?? 0) ||
                refundReason.trim().length < 3
              }
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              إنشاء الطلب
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
