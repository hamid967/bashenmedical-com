import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listMyPayments } from "@/lib/portal/invoices.functions";
import { Wallet, Receipt, ArrowLeft, CheckCircle2, Clock, AlertCircle } from "lucide-react";

const paymentsQuery = queryOptions({
  queryKey: ["portal", "payments"],
  queryFn: () => listMyPayments(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/payments")({
  loader: async ({ context }) => context.queryClient.ensureQueryData(paymentsQuery),
  head: () => ({
    meta: [
      { title: "المدفوعات | بوابة المريض" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalPaymentsPage,
});

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
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
const methodLabel: Record<string, string> = {
  card: "بطاقة ائتمانية",
  mada: "مدى",
  apple_pay: "Apple Pay",
  bank_transfer: "تحويل بنكي",
  counter: "في العيادة",
};

function PortalPaymentsPage() {
  const { data } = useSuspenseQuery(paymentsQuery);
  const succeeded = data.payments.filter((p) => ["succeeded", "paid", "completed"].includes(p.status));
  const totalPaid = succeeded.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const pendingCount = data.payments.filter((p) => ["pending", "processing"].includes(p.status)).length;

  return (
    <div className="portal-magazine min-h-full">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-8 space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--mag-ink-3)] font-semibold">
              المدفوعات
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mt-1">سجل مدفوعاتي</h1>
            <p className="text-sm text-[color:var(--mag-ink-3)] mt-2 max-w-2xl">
              كل الدفعات المرتبطة بفواتيرك، مع طريقة الدفع والحالة.
            </p>
          </div>
          <Link
            to="/portal/invoices"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold text-[color:var(--portal-on-primary)] bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)]"
          >
            <Receipt className="h-4 w-4" /> الذهاب إلى الفواتير
          </Link>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat icon={CheckCircle2} label="إجمالي المدفوع" value={fmtSAR(totalPaid)} tone="success" />
          <Stat icon={Wallet} label="عدد العمليات" value={String(data.payments.length)} />
          <Stat icon={Clock} label="قيد المعالجة" value={String(pendingCount)} tone={pendingCount > 0 ? "warning" : "default"} />
        </section>

        {data.payments.length === 0 ? (
          <div className="mag-card p-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-[color:var(--mag-subtle)] grid place-items-center text-[color:var(--mag-ink-3)] mb-3">
              <Wallet className="h-7 w-7" />
            </div>
            <p className="text-[color:var(--mag-ink-2)]">لا توجد مدفوعات مسجلة بعد.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.payments.map((p) => {
              const ok = ["succeeded", "paid", "completed"].includes(p.status);
              return (
                <li key={p.id} className="mag-card mag-card-hover p-4 sm:p-5 flex flex-wrap items-center gap-4">
                  <div
                    className={`h-11 w-11 rounded-xl grid place-items-center ${
                      ok
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold">
                      {p.invoice_number ? `فاتورة #${p.invoice_number}` : "فاتورة"}
                    </div>
                    <div className="text-xs text-[color:var(--mag-ink-3)] mt-0.5">
                      {methodLabel[p.method] ?? p.method} · {fmtDate(p.paid_at ?? p.created_at)}
                      {p.is_mock && <span className="ms-2 text-amber-700">(محاكاة)</span>}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-lg font-bold">{fmtSAR(Number(p.amount), p.currency)}</div>
                    <div className="text-xs text-[color:var(--mag-ink-3)]">{p.status}</div>
                  </div>
                  <Link
                    to="/portal/invoices"
                    className="p-2 rounded-md hover:bg-[color:var(--mag-subtle)] text-[color:var(--mag-ink-3)]"
                    aria-label="عرض الفاتورة"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneCls =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warning"
      ? "bg-amber-50 text-amber-700"
      : "bg-[color:var(--mag-subtle)] text-[color:var(--mag-ink-2)]";
  return (
    <div className="mag-card p-5">
      <div className={`h-10 w-10 rounded-xl grid place-items-center ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-sm text-[color:var(--mag-ink-2)] mt-1">{label}</div>
      </div>
    </div>
  );
}
