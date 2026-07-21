import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  listMyInvoices,
  getMyInvoice,
  createDemoInvoicePayment,
} from "@/lib/portal/invoices.functions";
import {
  Receipt,
  FileText,
  CreditCard,
  Landmark,
  Smartphone,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Wallet,
  Loader2,
  Info,
} from "lucide-react";
import {
  PortalPageHeader,
  PortalStatCard,
  PortalEmptyState,
} from "@/components/portal/ui";

const invoicesQuery = (status: "all" | "outstanding" | "paid") =>
  queryOptions({
    queryKey: ["portal", "invoices", status],
    queryFn: () => listMyInvoices({ data: { status, limit: 100 } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/_authenticated/portal/invoices")({
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData(invoicesQuery("all")),
  head: () => ({
    meta: [
      { title: "الفواتير | بوابة المريض" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalInvoicesPage,
});

/* ---------------- helpers ---------------- */

function fmtSAR(n: number, currency = "SAR") {
  try {
    return new Intl.NumberFormat("ar-SA", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
function statusLabel(s: string) {
  const map: Record<string, string> = {
    paid: "مسددة",
    settled: "مسددة",
    unpaid: "غير مسددة",
    pending: "بانتظار الدفع",
    partially_paid: "مسددة جزئياً",
  };
  return map[s] ?? s;
}
function statusStyle(s: string): string {
  if (s === "paid" || s === "settled") return "bg-emerald-50 text-emerald-700";
  if (s === "partially_paid") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-[color:var(--mag-danger)]";
}

/* ---------------- page ---------------- */

function PortalInvoicesPage() {
  const [filter, setFilter] = useState<"all" | "outstanding" | "paid">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useSuspenseQuery(invoicesQuery(filter));

  const kpis = data.summary;

  return (
    <div className="portal-magazine min-h-full">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-8 space-y-8">
        {/* Header */}
        <PortalPageHeader
          eyebrow="الفواتير والدفعات"
          title="فواتيري"
          description="اطلع على فواتيرك، حمّل نسخة PDF، وادفع المستحقات إلكترونيًا."
          breadcrumbs={[{ label: "الرئيسية", to: "/portal" }, { label: "الفواتير" }]}
          actions={
            <Link
              to="/portal/payments"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)] text-sm font-semibold hover:bg-[color:var(--portal-surface-2)]"
            >
              <Wallet className="h-4 w-4" />
              سجل المدفوعات
            </Link>
          }
        />

        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PortalStatCard
            icon={<Receipt className="h-5 w-5" />}
            label="إجمالي الفواتير"
            value={fmtSAR(kpis.total)}
            hint={`${kpis.count} فاتورة`}
            tone="primary"
          />
          <PortalStatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="المسدد"
            value={fmtSAR(kpis.paid)}
            tone="success"
          />
          <PortalStatCard
            icon={<AlertCircle className="h-5 w-5" />}
            label="المستحق"
            value={fmtSAR(kpis.outstanding)}
            tone={kpis.outstanding > 0 ? "error" : "muted"}
          />
        </section>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-[color:var(--mag-line)]">
          {(["all", "outstanding", "paid"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={[
                "px-4 h-11 text-sm font-semibold border-b-2 -mb-px transition-colors",
                filter === t
                  ? "border-[color:var(--mag-accent)] text-[color:var(--mag-accent-ink)]"
                  : "border-transparent text-[color:var(--mag-ink-3)] hover:text-[color:var(--mag-ink-2)]",
              ].join(" ")}
            >
              {t === "all" ? "الكل" : t === "outstanding" ? "المستحقة" : "المسددة"}
            </button>
          ))}
        </div>

        {/* List */}
        {data.invoices.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ul className="space-y-3">
            {data.invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} onOpen={() => setOpenId(inv.id)} />
            ))}
          </ul>
        )}

        {/* Integration note */}
        <div className="mag-card p-4 flex items-start gap-3 bg-[color:var(--mag-accent-soft)]">
          <Info className="h-5 w-5 text-[color:var(--mag-accent-ink)] shrink-0 mt-0.5" />
          <div className="text-sm text-[color:var(--mag-ink-2)]">
            <b>الدفع الإلكتروني الحقيقي (Mada/Apple Pay/بطاقات ائتمانية)</b> قيد ربط بوابة الدفع
            المعتمدة. حاليًا يعمل زر «الدفع» بوضع محاكاة موثّق لأغراض العرض، مع تسجيل كامل للعملية
            في سجل المدفوعات. سيتم تفعيل البوابة الفعلية فور اعتماد المزوّد.
          </div>
        </div>
      </div>

      {openId && <InvoiceDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/* ---------------- KPI ---------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "danger";
}) {
  const toneCls =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "danger"
      ? "bg-red-50 text-[color:var(--mag-danger)]"
      : "bg-[color:var(--mag-subtle)] text-[color:var(--mag-ink-2)]";
  return (
    <div className="mag-card p-5">
      <div className="flex items-center justify-between">
        <div className={`h-10 w-10 rounded-xl grid place-items-center ${toneCls}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-sm text-[color:var(--mag-ink-2)] mt-1">{label}</div>
        {hint && <div className="text-xs text-[color:var(--mag-ink-3)] mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

/* ---------------- row ---------------- */

function InvoiceRow({
  inv,
  onOpen,
}: {
  inv: {
    id: string;
    invoice_number: string | null;
    total: number;
    paid_amount: number;
    due_amount: number;
    currency: string;
    status: string;
    issued_at: string;
    paid_at: string | null;
  };
  onOpen: () => void;
}) {
  const isPaid = inv.status === "paid" || inv.status === "settled";
  return (
    <li className="mag-card mag-card-hover p-4 sm:p-5 flex flex-wrap items-center gap-4">
      <div className="h-11 w-11 rounded-xl bg-[color:var(--mag-accent-soft)] text-[color:var(--mag-accent-ink)] grid place-items-center">
        <Receipt className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-[180px]">
        <div className="font-semibold">
          {inv.invoice_number ? `فاتورة #${inv.invoice_number}` : "فاتورة"}
        </div>
        <div className="text-xs text-[color:var(--mag-ink-3)] mt-0.5 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          صدرت في {fmtDate(inv.issued_at)}
        </div>
      </div>
      <div className="text-end">
        <div className="text-lg font-bold">{fmtSAR(inv.total, inv.currency)}</div>
        {!isPaid && inv.due_amount > 0 && (
          <div className="text-xs text-[color:var(--mag-danger)] mt-0.5">
            المتبقي {fmtSAR(inv.due_amount, inv.currency)}
          </div>
        )}
      </div>
      <span className={`mag-chip ${statusStyle(inv.status)}`}>{statusLabel(inv.status)}</span>
      <button
        onClick={onOpen}
        className="h-10 px-4 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)] transition-colors"
      >
        {isPaid ? "التفاصيل" : "دفع الآن"}
      </button>
    </li>
  );
}

function EmptyState({ filter }: { filter: "all" | "outstanding" | "paid" }) {
  const msg =
    filter === "outstanding"
      ? "لا توجد فواتير مستحقة. جميع مدفوعاتك محدّثة."
      : filter === "paid"
      ? "لا توجد فواتير مسددة بعد."
      : "لا توجد فواتير حتى الآن.";
  return (
    <div className="mag-card p-10 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-[color:var(--mag-subtle)] grid place-items-center text-[color:var(--mag-ink-3)] mb-3">
        <Receipt className="h-7 w-7" />
      </div>
      <p className="text-[color:var(--mag-ink-2)]">{msg}</p>
    </div>
  );
}

/* ---------------- drawer ---------------- */

const invoiceDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ["portal", "invoice", id],
    queryFn: () => getMyInvoice({ data: { id } }),
    staleTime: 15_000,
  });

function InvoiceDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useQueryDetail(id);

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative ms-auto h-full w-full max-w-lg bg-[color:var(--portal-surface)] shadow-xl flex flex-col">
        <div className="h-14 px-5 flex items-center justify-between border-b border-[color:var(--mag-line)]">
          <div className="font-bold">تفاصيل الفاتورة</div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[color:var(--mag-subtle)]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-[color:var(--mag-ink-3)]">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…
            </div>
          ) : error ? (
            <div className="text-sm text-[color:var(--mag-danger)]">
              {(error as Error).message || "تعذّر التحميل"}
            </div>
          ) : data ? (
            <InvoiceDetails data={data} onPaid={() => refetch()} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function useQueryDetail(id: string) {
  return useSuspenseQueryOrFallback(id);
}

// Non-suspense variant since drawer opens after page loads
function useSuspenseQueryOrFallback(id: string) {
  return useQuery(invoiceDetailQuery(id));
}

function InvoiceDetails({
  data,
  onPaid,
}: {
  data: Awaited<ReturnType<typeof getMyInvoice>>;
  onPaid: () => void;
}) {
  const { invoice, payments } = data;
  const isPaid = invoice.status === "paid" || invoice.status === "settled";
  const qc = useQueryClient();
  const payFn = useServerFn(createDemoInvoicePayment);
  const [method, setMethod] = useState<"card" | "mada" | "apple_pay" | "bank_transfer" | "counter">("mada");

  const mutation = useMutation({
    mutationFn: () => payFn({ data: { invoice_id: invoice.id, method } }),
    onSuccess: (res) => {
      toast.success(
        res.invoice_status === "paid"
          ? "تم تسجيل الدفع بنجاح (وضع محاكاة)"
          : "تم تسجيل دفعة جزئية (وضع محاكاة)",
      );
      qc.invalidateQueries({ queryKey: ["portal", "invoices"] });
      onPaid();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إتمام الدفع"),
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-[color:var(--mag-ink-3)]">رقم الفاتورة</div>
        <div className="text-lg font-bold">
          {invoice.invoice_number ? `#${invoice.invoice_number}` : invoice.id.slice(0, 8)}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className={`mag-chip ${statusStyle(invoice.status)}`}>{statusLabel(invoice.status)}</span>
          <span className="text-xs text-[color:var(--mag-ink-3)]">صدرت في {fmtDate(invoice.issued_at)}</span>
        </div>
      </div>

      <div className="mag-card p-4">
        <SummaryRow label="الإجمالي" value={fmtSAR(invoice.total, invoice.currency)} />
        <SummaryRow label="المسدد" value={fmtSAR(invoice.paid_amount, invoice.currency)} tone="success" />
        <SummaryRow
          label="المتبقي"
          value={fmtSAR(invoice.due_amount, invoice.currency)}
          tone={invoice.due_amount > 0 ? "danger" : "default"}
          strong
        />
      </div>

      {invoice.notes && (
        <div className="text-sm text-[color:var(--mag-ink-2)]">
          <div className="font-semibold mb-1">ملاحظات</div>
          <div className="whitespace-pre-wrap">{invoice.notes}</div>
        </div>
      )}

      {invoice.pdf_path && (
        <a
          href={invoice.pdf_path}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-[color:var(--mag-line)] bg-[color:var(--portal-surface)] text-sm font-semibold hover:bg-[color:var(--mag-subtle)]"
        >
          <FileText className="h-4 w-4" />
          تحميل PDF
        </a>
      )}

      {/* Pay */}
      {!isPaid && invoice.due_amount > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold">اختر وسيلة الدفع</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "mada", label: "مدى", icon: CreditCard },
              { key: "apple_pay", label: "Apple Pay", icon: Smartphone },
              { key: "card", label: "بطاقة ائتمانية", icon: CreditCard },
              { key: "bank_transfer", label: "تحويل بنكي", icon: Landmark },
              { key: "counter", label: "الدفع في العيادة", icon: Building2 },
            ].map((m) => {
              const Icon = m.icon;
              const active = method === (m.key as typeof method);
              return (
                <button
                  key={m.key}
                  onClick={() => setMethod(m.key as typeof method)}
                  className={[
                    "h-12 px-3 rounded-xl border text-sm font-semibold flex items-center gap-2 justify-center transition-colors",
                    active
                      ? "border-[color:var(--mag-accent)] bg-[color:var(--mag-accent-soft)] text-[color:var(--mag-accent-ink)]"
                      : "border-[color:var(--mag-line)] bg-white text-[color:var(--mag-ink-2)] hover:bg-[color:var(--mag-subtle)]",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" /> {m.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="w-full h-12 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            دفع {fmtSAR(invoice.due_amount, invoice.currency)}
          </button>
          <p className="text-[11px] text-[color:var(--mag-ink-3)] text-center">
            وضع محاكاة موثّق — سيتم استبداله ببوابة الدفع المعتمدة عند الاعتماد.
          </p>
        </div>
      )}

      {/* Payments history */}
      {payments.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2">سجل الدفعات</div>
          <ul className="space-y-2">
            {payments.map((p) => {
              const succeeded = ["succeeded", "paid", "completed", "partially_refunded"].includes(p.status);
              const refundable = succeeded && !p.is_mock;
              return (
                <li key={p.id} className="mag-card p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{fmtSAR(Number(p.amount), p.currency)}</div>
                    <div className="text-xs text-[color:var(--mag-ink-3)]">
                      {p.method} · {fmtDate(p.paid_at ?? p.created_at)}
                      {p.is_mock && <span className="ms-2 text-amber-700">(محاكاة)</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`mag-chip ${succeeded ? "bg-emerald-50 text-emerald-700" : p.status === "refunded" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>
                      {p.status}
                    </span>
                    {refundable && (
                      <Link
                        to="/portal/refunds"
                        className="h-8 px-3 rounded-full border border-[color:var(--mag-line)] bg-[color:var(--portal-surface)] text-xs font-semibold hover:bg-[color:var(--mag-subtle)]"
                      >
                        طلب استرداد
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone = "default",
  strong,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
  strong?: boolean;
}) {
  const cls =
    tone === "success"
      ? "text-emerald-700"
      : tone === "danger"
      ? "text-[color:var(--mag-danger)]"
      : "text-[color:var(--mag-ink)]";
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-[color:var(--mag-ink-3)]">{label}</span>
      <span className={`${cls} ${strong ? "text-lg font-bold" : "text-sm font-semibold"}`}>{value}</span>
    </div>
  );
}
