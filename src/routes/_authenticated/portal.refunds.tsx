import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listMyRefunds,
  requestRefund,
  cancelMyRefund,
} from "@/lib/portal/refunds.functions";
import { listMyPayments } from "@/lib/portal/invoices.functions";
import {
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  AlertCircle,
  Loader2,
  Plus,
  X,
  ReceiptText,
  Send,
  FileText,
  ChevronLeft,
} from "lucide-react";

const refundsQuery = queryOptions({
  queryKey: ["portal", "refunds"],
  queryFn: () => listMyRefunds(),
  staleTime: 15_000,
});
const paymentsQuery = queryOptions({
  queryKey: ["portal", "payments"],
  queryFn: () => listMyPayments(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/portal/refunds")({
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData(refundsQuery),
  head: () => ({
    meta: [
      { title: "طلبات الاسترداد | بوابة المريض" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalRefundsPage,
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
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}
type Status = "pending" | "approved" | "processed" | "rejected" | "canceled";
const STATUS_META: Record<Status, { label: string; cls: string; icon: any }> = {
  pending: { label: "قيد المراجعة", cls: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "معتمدة (قيد الصرف)", cls: "bg-sky-50 text-sky-700", icon: CheckCircle2 },
  processed: { label: "تمت المعالجة", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "مرفوضة", cls: "bg-red-50 text-[color:var(--mag-danger)]", icon: XCircle },
  canceled: { label: "أُلغيت", cls: "bg-slate-100 text-slate-600", icon: Ban },
};
function statusMeta(s: string) {
  return STATUS_META[(s as Status)] ?? { label: s, cls: "bg-slate-100 text-slate-600", icon: AlertCircle };
}

/* ---------------- page ---------------- */

function PortalRefundsPage() {
  const { data } = useSuspenseQuery(refundsQuery);
  const [openNew, setOpenNew] = useState(false);
  const [prefillPaymentId, setPrefillPaymentId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const kpis = useMemo(() => {
    const list = data.refunds;
    const pending = list.filter((r) => r.status === "pending").length;
    const processed = list.filter((r) => r.status === "processed");
    const refundedTotal = processed.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return { count: list.length, pending, refunded: refundedTotal };
  }, [data.refunds]);

  const selected = useMemo(
    () => data.refunds.find((r) => r.id === detailsId) ?? null,
    [data.refunds, detailsId],
  );

  return (
    <div className="portal-magazine min-h-full">
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-8 space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[color:var(--mag-ink-3)] font-semibold">
              الاسترداد والإلغاء
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mt-1">طلبات الاسترداد</h1>
            <p className="text-sm text-[color:var(--mag-ink-3)] mt-2 max-w-2xl">
              اطلب استرداد أي دفعة سبق تسديدها، وتابع حالة الطلب حتى الصرف. يخضع كل طلب لمراجعة قسم
              المحاسبة قبل التنفيذ.
            </p>
          </div>
          <button
            onClick={() => { setPrefillPaymentId(null); setOpenNew(true); }}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)]"
          >
            <Plus className="h-4 w-4" />
            طلب استرداد جديد
          </button>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard icon={RotateCcw} label="إجمالي الطلبات" value={String(kpis.count)} />
          <KpiCard icon={Clock} label="قيد المراجعة" value={String(kpis.pending)} tone="warn" />
          <KpiCard icon={CheckCircle2} label="مبالغ مُستردة" value={fmtSAR(kpis.refunded)} tone="success" />
        </section>

        {/* List */}
        {data.refunds.length === 0 ? (
          <EmptyState onNew={() => { setPrefillPaymentId(null); setOpenNew(true); }} />
        ) : (
          <ul className="space-y-3">
            {data.refunds.map((r) => (
              <RefundRow key={r.id} r={r} onOpen={() => setDetailsId(r.id)} />
            ))}
          </ul>
        )}
      </div>

      {openNew && (
        <NewRefundDrawer
          onClose={() => setOpenNew(false)}
          prefillPaymentId={prefillPaymentId}
        />
      )}
      {selected && (
        <RefundDetailsDrawer r={selected} onClose={() => setDetailsId(null)} />
      )}
    </div>
  );
}

/* ---------------- KPI ---------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "default" | "success" | "warn";
}) {
  const toneCls =
    tone === "success" ? "bg-emerald-50 text-emerald-700"
    : tone === "warn" ? "bg-amber-50 text-amber-700"
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

/* ---------------- row ---------------- */

type RefundRow = Awaited<ReturnType<typeof listMyRefunds>>["refunds"][number];

function RefundRow({ r, onOpen }: { r: RefundRow; onOpen: () => void }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelMyRefund);
  const meta = statusMeta(r.status);
  const Icon = meta.icon;
  const canCancel = r.status === "pending";
  const lastUpdate = r.processed_at ?? r.updated_at;

  const mutation = useMutation({
    mutationFn: () => cancelFn({ data: { id: r.id } }),
    onSuccess: () => {
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["portal", "refunds"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إلغاء الطلب"),
  });

  return (
    <li className="mag-card mag-card-hover p-4 sm:p-5 flex flex-wrap items-center gap-4">
      <button
        onClick={onOpen}
        className={`h-11 w-11 rounded-xl grid place-items-center ${meta.cls} hover:opacity-90`}
        aria-label="تفاصيل الطلب"
      >
        <Icon className="h-5 w-5" />
      </button>
      <button onClick={onOpen} className="flex-1 min-w-[220px] text-start">
        <div className="font-semibold flex items-center gap-2">
          <ReceiptText className="h-4 w-4 text-[color:var(--mag-ink-3)]" />
          {r.invoice_number ? `فاتورة #${r.invoice_number}` : "دفعة"}
          <span className="text-xs text-[color:var(--mag-ink-3)] font-normal">
            · {r.payment_method ?? "—"}
          </span>
        </div>
        {r.reason && (
          <div className="text-xs text-[color:var(--mag-ink-3)] mt-1 line-clamp-2 max-w-lg">
            السبب: {r.reason}
          </div>
        )}
        <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>طُلب في {fmtDate(r.created_at)}</span>
          <span>· آخر تحديث: {fmtDateTime(lastUpdate)}</span>
        </div>
      </button>
      <div className="text-end">
        <div className="text-lg font-bold">{fmtSAR(r.amount, r.currency)}</div>
        <div className="text-xs text-[color:var(--mag-ink-3)]">
          من دفعة {fmtSAR(r.payment_amount, r.currency)}
        </div>
      </div>
      <span className={`mag-chip ${meta.cls}`}>{meta.label}</span>
      <button
        onClick={onOpen}
        className="h-9 px-3 rounded-full border border-[color:var(--mag-line)] bg-white text-xs font-semibold text-[color:var(--mag-ink-2)] hover:bg-[color:var(--mag-subtle)] inline-flex items-center gap-1"
      >
        <FileText className="h-3.5 w-3.5" />
        التفاصيل
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {canCancel && (
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="h-9 px-3 rounded-full border border-[color:var(--mag-line)] bg-white text-xs font-semibold text-[color:var(--mag-danger)] hover:bg-red-50 disabled:opacity-60 inline-flex items-center gap-1"
        >
          {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          إلغاء الطلب
        </button>
      )}
    </li>
  );
}

/* ---------------- details drawer with timeline ---------------- */

type TimelineStep = {
  key: string;
  title: string;
  at: string | null;
  note?: string | null;
  state: "done" | "current" | "upcoming" | "skipped" | "failed";
  icon: any;
};

function buildTimeline(r: RefundRow): TimelineStep[] {
  const status = r.status as Status;
  const lastAt = r.processed_at ?? r.updated_at;

  const submitted: TimelineStep = {
    key: "submitted",
    title: "تم إرسال الطلب",
    at: r.created_at,
    note: r.reason ? `سبب الطلب: ${r.reason}` : null,
    state: "done",
    icon: Send,
  };

  if (status === "pending") {
    return [
      submitted,
      { key: "review", title: "قيد مراجعة المحاسبة", at: null, state: "current", icon: Clock,
        note: "سيتم مراجعة الطلب خلال أيام العمل الرسمية." },
      { key: "processed", title: "المعالجة والصرف", at: null, state: "upcoming", icon: CheckCircle2 },
    ];
  }

  if (status === "approved") {
    return [
      submitted,
      { key: "review", title: "تمت الموافقة على الطلب", at: lastAt, state: "done", icon: CheckCircle2,
        note: r.decision_reason ?? null },
      { key: "processed", title: "قيد الصرف", at: null, state: "current", icon: RotateCcw,
        note: "جارٍ تحويل المبلغ إلى وسيلة الدفع الأصلية." },
    ];
  }

  if (status === "processed") {
    return [
      submitted,
      { key: "review", title: "تمت الموافقة على الطلب", at: null, state: "done", icon: CheckCircle2 },
      { key: "processed", title: "تمت معالجة الاسترداد", at: lastAt, state: "done", icon: CheckCircle2,
        note: r.decision_reason ?? "تم إعادة المبلغ إلى وسيلة الدفع الأصلية." },
    ];
  }

  if (status === "rejected") {
    return [
      submitted,
      { key: "review", title: "تم رفض الطلب", at: lastAt, state: "failed", icon: XCircle,
        note: r.decision_reason ?? "لم يتم ذكر سبب. يرجى التواصل مع قسم المحاسبة." },
      { key: "processed", title: "لن تتم المعالجة", at: null, state: "skipped", icon: Ban },
    ];
  }

  // canceled
  return [
    submitted,
    { key: "review", title: "تم إلغاء الطلب", at: lastAt, state: "failed", icon: Ban,
      note: r.decision_reason ?? "تم إلغاء الطلب قبل اكتمال المراجعة." },
    { key: "processed", title: "لن تتم المعالجة", at: null, state: "skipped", icon: Ban },
  ];
}

function RefundDetailsDrawer({ r, onClose }: { r: RefundRow; onClose: () => void }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelMyRefund);
  const meta = statusMeta(r.status);
  const steps = useMemo(() => buildTimeline(r), [r]);
  const canCancel = r.status === "pending";

  const mutation = useMutation({
    mutationFn: () => cancelFn({ data: { id: r.id } }),
    onSuccess: () => {
      toast.success("تم إلغاء الطلب");
      qc.invalidateQueries({ queryKey: ["portal", "refunds"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إلغاء الطلب"),
  });

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative ms-auto h-full w-full max-w-lg bg-white shadow-xl flex flex-col">
        <div className="h-14 px-5 flex items-center justify-between border-b border-[color:var(--mag-line)]">
          <div className="font-bold">تفاصيل طلب الاسترداد</div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[color:var(--mag-subtle)]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Summary */}
          <section className="mag-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-[color:var(--mag-ink-3)]">
                {r.invoice_number ? `فاتورة #${r.invoice_number}` : "دفعة"}
              </div>
              <span className={`mag-chip ${meta.cls}`}>{meta.label}</span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-[color:var(--mag-ink-3)]">المبلغ المطلوب استرداده</div>
                <div className="text-2xl font-bold">{fmtSAR(r.amount, r.currency)}</div>
              </div>
              <div className="text-end">
                <div className="text-[11px] text-[color:var(--mag-ink-3)]">من دفعة</div>
                <div className="text-sm font-semibold">{fmtSAR(r.payment_amount, r.currency)}</div>
                <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-0.5">
                  {r.payment_method ?? "—"} · دُفعت في {fmtDate(r.payment_paid_at)}
                </div>
              </div>
            </div>
            <div className="pt-2 mt-1 border-t border-[color:var(--mag-line)] text-[11px] text-[color:var(--mag-ink-3)] flex flex-wrap gap-x-4 gap-y-1">
              <span>معرّف الطلب: <span className="font-mono">{r.id.slice(0, 8)}…</span></span>
              <span>آخر تحديث: {fmtDateTime(r.processed_at ?? r.updated_at)}</span>
            </div>
          </section>

          {/* Timeline */}
          <section>
            <div className="text-sm font-semibold mb-3">مراحل الطلب</div>
            <ol className="relative ms-3 border-s-2 border-[color:var(--mag-line)] space-y-5 ps-5">
              {steps.map((s) => {
                const Icon = s.icon;
                const dot =
                  s.state === "done" ? "bg-emerald-500 text-white"
                  : s.state === "current" ? "bg-amber-500 text-white animate-pulse"
                  : s.state === "failed" ? "bg-[color:var(--mag-danger)] text-white"
                  : s.state === "skipped" ? "bg-slate-200 text-slate-400"
                  : "bg-white text-[color:var(--mag-ink-3)] border border-[color:var(--mag-line)]";
                const titleCls =
                  s.state === "upcoming" || s.state === "skipped"
                    ? "text-[color:var(--mag-ink-3)]"
                    : "text-[color:var(--mag-ink-1)]";
                return (
                  <li key={s.key} className="relative">
                    <span className={`absolute -start-[34px] top-0 h-7 w-7 rounded-full grid place-items-center ${dot}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className={`font-semibold text-sm ${titleCls}`}>{s.title}</div>
                    <div className="text-[11px] text-[color:var(--mag-ink-3)] mt-0.5">
                      {s.at ? fmtDateTime(s.at) : s.state === "current" ? "الآن" : "—"}
                    </div>
                    {s.note && (
                      <div className={[
                        "mt-2 text-xs rounded-lg p-3",
                        s.state === "failed"
                          ? "bg-red-50 text-[color:var(--mag-danger)]"
                          : "bg-[color:var(--mag-subtle)] text-[color:var(--mag-ink-2)]",
                      ].join(" ")}>
                        {s.note}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        {canCancel && (
          <div className="p-4 border-t border-[color:var(--mag-line)] flex items-center gap-3">
            <button
              onClick={onClose}
              className="h-11 px-4 rounded-full border border-[color:var(--mag-line)] bg-white text-sm font-semibold"
            >
              إغلاق
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 h-11 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-danger)] hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              إلغاء طلب الاسترداد
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="mag-card p-10 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-[color:var(--mag-subtle)] grid place-items-center text-[color:var(--mag-ink-3)] mb-3">
        <RotateCcw className="h-7 w-7" />
      </div>
      <p className="text-[color:var(--mag-ink-2)]">لا توجد طلبات استرداد.</p>
      <button
        onClick={onNew}
        className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)]"
      >
        <Plus className="h-4 w-4" /> إنشاء طلب
      </button>
    </div>
  );
}

/* ---------------- new refund drawer ---------------- */

function NewRefundDrawer({
  onClose,
  prefillPaymentId,
}: {
  onClose: () => void;
  prefillPaymentId: string | null;
}) {
  const qc = useQueryClient();
  const { data: paysRes, isLoading } = useQuery(paymentsQuery);
  const requestFn = useServerFn(requestRefund);

  // Only refundable, non-mock payments
  const refundable = useMemo(() => {
    const list = paysRes?.payments ?? [];
    return list.filter(
      (p) =>
        !p.is_mock &&
        ["succeeded", "completed", "paid", "partially_refunded"].includes(p.status),
    );
  }, [paysRes?.payments]);

  const [paymentId, setPaymentId] = useState<string>(prefillPaymentId ?? "");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const selected = useMemo(
    () => refundable.find((p) => p.id === paymentId) ?? null,
    [refundable, paymentId],
  );

  const mutation = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          payment_id: paymentId,
          reason: reason.trim(),
          amount: amount ? Number(amount) : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("تم إرسال طلب الاسترداد. سيتم مراجعته من قبل قسم المحاسبة.");
      qc.invalidateQueries({ queryKey: ["portal", "refunds"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إرسال الطلب"),
  });

  const canSubmit = !!paymentId && reason.trim().length >= 3 && !mutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative ms-auto h-full w-full max-w-lg bg-white shadow-xl flex flex-col">
        <div className="h-14 px-5 flex items-center justify-between border-b border-[color:var(--mag-line)]">
          <div className="font-bold">طلب استرداد جديد</div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-[color:var(--mag-subtle)]" aria-label="إغلاق">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-[color:var(--mag-ink-3)]">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري تحميل الدفعات…
            </div>
          ) : refundable.length === 0 ? (
            <div className="mag-card p-5 text-sm text-[color:var(--mag-ink-2)] flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                لا توجد دفعات قابلة للاسترداد على حسابك حاليًا. الدفعات التجريبية (وضع محاكاة)
                لا يمكن استردادها عبر البوابة.
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-semibold block mb-2">الدفعة</label>
                <div className="space-y-2">
                  {refundable.map((p) => {
                    const active = paymentId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPaymentId(p.id)}
                        className={[
                          "w-full text-start p-3 rounded-xl border transition-colors",
                          active
                            ? "border-[color:var(--mag-accent)] bg-[color:var(--mag-accent-soft)]"
                            : "border-[color:var(--mag-line)] bg-white hover:bg-[color:var(--mag-subtle)]",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">
                              {p.invoice_number ? `فاتورة #${p.invoice_number}` : "دفعة"} · {p.method}
                            </div>
                            <div className="text-xs text-[color:var(--mag-ink-3)] mt-0.5">
                              {fmtDate(p.paid_at ?? p.created_at)} · {p.status}
                            </div>
                          </div>
                          <div className="text-sm font-bold">
                            {fmtSAR(Number(p.amount), p.currency)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold block mb-2">
                  المبلغ المطلوب استرداده
                  <span className="text-xs text-[color:var(--mag-ink-3)] font-normal ms-2">
                    (اتركه فارغًا لاسترداد كامل المتاح)
                  </span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  max={selected ? Number(selected.amount) : undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={selected ? String(Number(selected.amount).toFixed(2)) : "—"}
                  className="w-full h-11 px-3 rounded-xl border border-[color:var(--mag-line)] bg-white text-sm outline-none focus:border-[color:var(--mag-accent)]"
                />
              </div>

              <div>
                <label className="text-sm font-semibold block mb-2">سبب الطلب</label>
                <textarea
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="اذكر سبب طلب الاسترداد (لن يقل عن 3 أحرف)"
                  className="w-full min-h-[100px] p-3 rounded-xl border border-[color:var(--mag-line)] bg-white text-sm outline-none focus:border-[color:var(--mag-accent)] resize-y"
                />
              </div>

              <div className="mag-card p-3 bg-[color:var(--mag-accent-soft)] text-xs text-[color:var(--mag-ink-2)]">
                يتم تحويل الطلب فور إرساله إلى قسم المحاسبة للمراجعة. عند اعتماد الطلب ومعالجته،
                يتم تحديث حالة الفاتورة والدفعة تلقائيًا.
              </div>
            </>
          )}
        </div>

        {refundable.length > 0 && (
          <div className="p-4 border-t border-[color:var(--mag-line)] flex items-center gap-3">
            <button
              onClick={onClose}
              className="h-11 px-4 rounded-full border border-[color:var(--mag-line)] bg-white text-sm font-semibold"
            >
              إلغاء
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!canSubmit}
              className="flex-1 h-11 rounded-full text-sm font-semibold text-white bg-[color:var(--mag-accent)] hover:bg-[color:var(--mag-accent-ink)] disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              إرسال طلب الاسترداد
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
