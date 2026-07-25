import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Scale,
  FileText,
  CreditCard,
  Undo2,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Pencil,
  History,
  X,
} from "lucide-react";
import {
  getReconciliationDetail,
  applyReconciliationAdjustment,
  revokeReconciliationAdjustment,
  type ReconciliationFieldDiff,
  type ReconciliationAdjustmentRow,
  type ReconciliationNphiesCandidate,
} from "@/lib/admin/reconciliation.functions";

export const Route = createFileRoute("/_authenticated/admin/reconciliation/$invoiceId")({
  head: () => ({
    meta: [
      { title: "تفاصيل تسوية الفاتورة | لوحة الإدارة" },
      {
        name: "description",
        content: "تفاصيل مطابقة الفاتورة مع المدفوعات ومطالبة NPHIES وأسباب الفروقات.",
      },
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
      الفاتورة غير موجودة.
    </div>
  ),
  component: ReconciliationDetailPage,
});

function money(n: number | null | undefined, ccy = "SAR"): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  try {
    return new Intl.NumberFormat("ar-SA", { style: "currency", currency: ccy }).format(Number(n));
  } catch {
    return `${n} ${ccy}`;
  }
}

function ReconciliationDetailPage() {
  const { invoiceId } = Route.useParams();
  const runFn = useServerFn(getReconciliationDetail);

  const q = useQuery({
    queryKey: ["admin-reconciliation-detail", invoiceId],
    queryFn: () => runFn({ data: { invoice_id: invoiceId } }),
  });

  if (q.isLoading) {
    return (
      <div className="container-app py-8 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="container-app py-16 text-center text-destructive">
        {q.error instanceof Error ? q.error.message : "تعذّر تحميل التفاصيل"}
      </div>
    );
  }

  const {
    row,
    invoice,
    payments,
    refunds,
    nphies,
    fieldDiffs,
    flagsExplained,
    activeAdjustment,
    adjustmentHistory,
  } = q.data;
  const ccy = invoice.currency;

  return (
    <div className="container-app py-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            <Link
              to="/admin/reconciliation"
              className="inline-flex items-center gap-1 hover:underline"
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              العودة إلى التسوية اليومية
            </Link>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="h-6 w-6" aria-hidden="true" />
            تفاصيل تسوية الفاتورة
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{invoice.invoice_number ?? invoice.id.slice(0, 8)}</span>
            {" — "}
            {row.patient_name ?? "—"}
            {row.branch_name ? ` • ${row.branch_name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> تحديث
          </button>
        </div>
      </header>

      {/* Summary */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <SummaryTile label="المفوتر" value={money(row.billed, ccy)} />
        <SummaryTile label="المحصّل الصافي" value={money(row.net_collected, ccy)} />
        <SummaryTile label="مسترد" value={money(row.refunded, ccy)} />
        <SummaryTile label="تغطية NPHIES" value={money(row.nphies_covered, ccy)} />
        <SummaryTile label="حصة متوقعة" value={money(row.expected_patient_share, ccy)} />
        <SummaryTile
          label="الفرق"
          value={money(row.variance, ccy)}
          tone={
            Math.abs(row.variance) <= 0.009
              ? "success"
              : row.variance < 0
                ? "danger"
                : "warning"
          }
        />
      </section>

      {/* Flags */}
      {flagsExplained.length > 0 ? (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            أسباب الفروقات ({flagsExplained.length})
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {flagsExplained.map((f) => (
              <li key={f.code} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                <div>
                  <div className="font-medium">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          الفاتورة مطابقة بالكامل — لا توجد فروقات.
        </section>
      )}

      {/* Manual adjustment tools */}
      <AdjustmentPanel
        invoiceId={invoice.id}
        currency={ccy}
        activeAdjustment={activeAdjustment}
        history={adjustmentHistory}
        nphiesCandidates={nphies}
      />



      {/* Field-level diffs */}
      <section>
        <h2 className="text-lg font-semibold mb-3">مقارنة الحقول</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">الحقل</th>
                <th className="px-3 py-2 text-end">القيمة المتوقعة</th>
                <th className="px-3 py-2 text-end">القيمة الفعلية</th>
                <th className="px-3 py-2 text-end">الفرق</th>
                <th className="px-3 py-2 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {fieldDiffs.map((d) => (
                <FieldRow key={d.key} d={d} ccy={ccy} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Links to source records */}
      <section className="grid gap-4 md:grid-cols-3">
        <SourceCard
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          title="الفاتورة الأصلية"
          subtitle={invoice.invoice_number ?? invoice.id.slice(0, 8)}
          href={`/admin/billing/${invoice.id}`}
          meta={[
            ["الحالة", invoice.status ?? "—"],
            ["تاريخ الإصدار", invoice.issued_at ?? "—"],
            ["تاريخ السداد", invoice.paid_at?.slice(0, 10) ?? "—"],
          ]}
        />
        <SourceCard
          icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
          title="الموعد المرتبط"
          subtitle={row.appointment_ref ?? "—"}
          href={row.appointment_id ? `/admin/appointments/${row.appointment_id}` : undefined}
          meta={[
            ["المريض", row.patient_name ?? "—"],
            ["الهوية", row.patient_national_id ?? "—"],
            ["الفرع", row.branch_name ?? "—"],
          ]}
        />
        <SourceCard
          icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
          title="مطالبة NPHIES المطابقة"
          subtitle={row.nphies_request_id ? row.nphies_request_id.slice(0, 8) : "لا توجد"}
          href={row.nphies_request_id ? `/admin/nphies?request=${row.nphies_request_id}` : undefined}
          meta={[
            ["الوضع", row.nphies_mode ?? "—"],
            [
              "الأهلية",
              row.nphies_eligible === true
                ? "مؤهل"
                : row.nphies_eligible === false
                  ? "غير مؤهل"
                  : "—",
            ],
            ["تغطية", money(row.nphies_covered, ccy)],
          ]}
        />
      </section>

      {/* Payments */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5" aria-hidden="true" /> المدفوعات ({payments.length})
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">التاريخ</th>
                <th className="px-3 py-2 text-start">القناة</th>
                <th className="px-3 py-2 text-start">المرجع</th>
                <th className="px-3 py-2 text-end">المبلغ</th>
                <th className="px-3 py-2 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    لا توجد مدفوعات على هذه الفاتورة.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-t align-top">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(p.paid_at ?? p.created_at).toLocaleString("ar-SA")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{p.method ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground">{p.gateway ?? ""}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      {p.gateway_ref ?? p.idempotency_key ?? p.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {money(p.amount, p.currency ?? ccy)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={p.status} />
                      {p.is_mock ? (
                        <span className="ms-1 rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-600">
                          MOCK
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Refunds */}
      {refunds.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Undo2 className="h-5 w-5" aria-hidden="true" /> المستردات ({refunds.length})
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">التاريخ</th>
                  <th className="px-3 py-2 text-start">السبب</th>
                  <th className="px-3 py-2 text-start">قرار</th>
                  <th className="px-3 py-2 text-start">إيصال</th>
                  <th className="px-3 py-2 text-end">المبلغ</th>
                  <th className="px-3 py-2 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.processed_at ?? r.created_at).toLocaleString("ar-SA")}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.decision_reason ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">
                      {r.receipt_reference ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">{money(r.amount, ccy)}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* NPHIES candidates */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" /> مطالبات NPHIES في نفس اليوم (
          {nphies.length})
        </h2>
        {nphies.length === 0 ? (
          <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            لم يُعثر على مطالبات NPHIES مطابقة (الطبيب × الهوية × التاريخ).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">الوقت</th>
                  <th className="px-3 py-2 text-start">الوضع</th>
                  <th className="px-3 py-2 text-start">الأهلية</th>
                  <th className="px-3 py-2 text-start">السبب</th>
                  <th className="px-3 py-2 text-end">التغطية %</th>
                  <th className="px-3 py-2 text-end">التغطية</th>
                  <th className="px-3 py-2 text-end">حصة المريض</th>
                  <th className="px-3 py-2 text-start">مطابقة</th>
                </tr>
              </thead>
              <tbody>
                {nphies.map((n) => (
                  <tr
                    key={n.id}
                    className={`border-t align-top ${n.matched ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("ar-SA")}
                    </td>
                    <td className="px-3 py-2 text-xs">{n.mode}</td>
                    <td className="px-3 py-2 text-xs">
                      {n.eligible === true
                        ? "مؤهل"
                        : n.eligible === false
                          ? "غير مؤهل"
                          : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {n.reason ?? n.error_message ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {n.coverage_percent != null ? `${n.coverage_percent}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {money(n.covered_amount, ccy)}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {money(n.patient_share, ccy)}
                    </td>
                    <td className="px-3 py-2">
                      {n.matched ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                          مختارة
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">مرشحة</span>
                      )}
                    </td>
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

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-destructive"
          : "";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const ok = status === "succeeded" || status === "paid";
  const failed = status === "failed" || status === "canceled";
  const cls = ok
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : failed
      ? "bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] ${cls}`}>{status ?? "—"}</span>
  );
}

function FieldRow({ d, ccy }: { d: ReconciliationFieldDiff; ccy: string }) {
  const isMoney = typeof d.expected === "number" || typeof d.actual === "number";
  const fmt = (v: number | string | null) =>
    v == null ? "—" : typeof v === "number" ? money(v, ccy) : v;
  const toneCls =
    d.status === "match"
      ? "text-emerald-600 dark:text-emerald-400"
      : d.status === "diff"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{d.label}</div>
        {d.note ? <div className="text-[11px] text-muted-foreground">{d.note}</div> : null}
      </td>
      <td className="px-3 py-2 text-end tabular-nums">{fmt(d.expected)}</td>
      <td className="px-3 py-2 text-end tabular-nums">{fmt(d.actual)}</td>
      <td className={`px-3 py-2 text-end tabular-nums ${toneCls}`}>
        {d.delta == null ? "—" : isMoney ? money(d.delta, ccy) : d.delta}
      </td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${
            d.status === "match"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : d.status === "diff"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {d.status === "match" ? "مطابق" : d.status === "diff" ? "فرق" : "معلوماتي"}
        </span>
      </td>
    </tr>
  );
}

function SourceCard({
  icon,
  title,
  subtitle,
  href,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href?: string;
  meta: Array<[string, string]>;
}) {
  const inner = (
    <div className="rounded-lg border p-4 transition hover:bg-muted/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon} {title}
        </div>
        {href ? <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : null}
      </div>
      <div className="mt-1 font-mono text-xs text-muted-foreground">{subtitle}</div>
      <dl className="mt-3 space-y-1 text-xs">
        {meta.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-end font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  return href ? (
    <a href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
      {inner}
    </a>
  ) : (
    <div className="opacity-70">{inner}</div>
  );
}

function AdjustmentPanel({
  invoiceId,
  currency,
  activeAdjustment,
  history,
  nphiesCandidates,
}: {
  invoiceId: string;
  currency: string;
  activeAdjustment: ReconciliationAdjustmentRow | null;
  history: ReconciliationAdjustmentRow[];
  nphiesCandidates: ReconciliationNphiesCandidate[];
}) {
  const qc = useQueryClient();
  const applyFn = useServerFn(applyReconciliationAdjustment);
  const revokeFn = useServerFn(revokeReconciliationAdjustment);
  const [open, setOpen] = useState(false);
  const [linkMode, setLinkMode] = useState<"keep" | "link" | "unlink">(
    activeAdjustment?.unlink_nphies
      ? "unlink"
      : activeAdjustment?.linked_nphies_request_id
        ? "link"
        : "keep",
  );
  const [linkedId, setLinkedId] = useState<string>(
    activeAdjustment?.linked_nphies_request_id ?? "",
  );
  const [overrideShareEnabled, setOverrideShareEnabled] = useState(
    activeAdjustment?.override_expected_share != null,
  );
  const [overrideShare, setOverrideShare] = useState<string>(
    activeAdjustment?.override_expected_share != null
      ? String(activeAdjustment.override_expected_share)
      : "",
  );
  const [statusOverride, setStatusOverride] = useState<string>(
    activeAdjustment?.override_invoice_status ?? "",
  );
  const [resolved, setResolved] = useState<boolean>(!!activeAdjustment?.resolved);
  const [reason, setReason] = useState<string>("");

  const apply = useMutation({
    mutationFn: (data: Parameters<typeof applyFn>[0]["data"]) => applyFn({ data }),
    onSuccess: () => {
      toast.success("تم حفظ التعديل");
      setOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-reconciliation-detail", invoiceId] });
      qc.invalidateQueries({ queryKey: ["admin-reconciliation"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر الحفظ"),
  });

  const revoke = useMutation({
    mutationFn: (data: { id: string; revoke_reason: string }) => revokeFn({ data }),
    onSuccess: () => {
      toast.success("تم إلغاء التعديل");
      qc.invalidateQueries({ queryKey: ["admin-reconciliation-detail", invoiceId] });
      qc.invalidateQueries({ queryKey: ["admin-reconciliation"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذّر الإلغاء"),
  });

  const submit = () => {
    if (reason.trim().length < 3) {
      toast.error("سبب التعديل مطلوب (٣ أحرف على الأقل)");
      return;
    }
    const payload: Parameters<typeof applyFn>[0]["data"] = {
      invoice_id: invoiceId,
      reason: reason.trim(),
      unlink_nphies: linkMode === "unlink",
      linked_nphies_request_id: linkMode === "link" && linkedId ? linkedId : null,
      override_expected_share:
        overrideShareEnabled && overrideShare !== "" ? Number(overrideShare) : null,
      override_invoice_status:
        (statusOverride || null) as
          | "issued"
          | "pending"
          | "paid"
          | "cancelled"
          | "refunded"
          | null,
      resolved,
    };
    apply.mutate(payload);
  };

  return (
    <section className="rounded-lg border">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-sm font-semibold">أدوات التعديل اليدوي للمطابقة</h2>
          {activeAdjustment ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
              تعديل نشط
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
        >
          {open ? (
            <>
              <X className="h-3.5 w-3.5" /> إغلاق
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" /> {activeAdjustment ? "استبدال التعديل" : "تعديل يدوي"}
            </>
          )}
        </button>
      </header>

      {activeAdjustment ? (
        <div className="border-b bg-primary/5 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-semibold">التعديل الحالي</div>
              <div className="mt-1 text-xs text-muted-foreground">
                بواسطة {activeAdjustment.created_by_name ?? "—"} •{" "}
                {new Date(activeAdjustment.created_at).toLocaleString("ar-SA")}
              </div>
              <div className="mt-2">
                <span className="text-xs text-muted-foreground">السبب:</span>{" "}
                <span className="font-medium">{activeAdjustment.reason}</span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs">
                {activeAdjustment.unlink_nphies && <li>• فصل مطالبة NPHIES</li>}
                {activeAdjustment.linked_nphies_request_id && (
                  <li>
                    • ربط مطالبة NPHIES:{" "}
                    <span className="font-mono">
                      {activeAdjustment.linked_nphies_request_id.slice(0, 8)}
                    </span>
                  </li>
                )}
                {activeAdjustment.override_expected_share != null && (
                  <li>
                    • حصة المريض المتوقعة: {money(activeAdjustment.override_expected_share, currency)}
                  </li>
                )}
                {activeAdjustment.override_invoice_status && (
                  <li>• حالة الفاتورة: {activeAdjustment.override_invoice_status}</li>
                )}
                {activeAdjustment.resolved && <li>• تم الإقرار (Resolved)</li>}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => {
                const r = window.prompt("سبب إلغاء التعديل:", "");
                if (r && r.trim().length >= 3) {
                  revoke.mutate({ id: activeAdjustment.id, revoke_reason: r.trim() });
                } else if (r != null) {
                  toast.error("السبب قصير جداً");
                }
              }}
              disabled={revoke.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              <Undo2 className="h-3.5 w-3.5" /> إلغاء التعديل
            </button>
          </div>
        </div>
      ) : null}

      {open && (
        <div className="space-y-4 px-4 py-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">مطالبة NPHIES</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="linkMode"
                checked={linkMode === "keep"}
                onChange={() => setLinkMode("keep")}
              />
              <span>الإبقاء على المطابقة التلقائية</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="linkMode"
                checked={linkMode === "link"}
                onChange={() => setLinkMode("link")}
              />
              <span>ربط مطالبة محددة</span>
            </label>
            {linkMode === "link" && (
              <select
                value={linkedId}
                onChange={(e) => setLinkedId(e.target.value)}
                className="ms-6 w-full max-w-md rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">— اختر مطالبة —</option>
                {nphiesCandidates.map((n) => (
                  <option key={n.id} value={n.id}>
                    {new Date(n.created_at).toLocaleString("ar-SA")} •{" "}
                    {n.eligible === true ? "مؤهل" : n.eligible === false ? "غير مؤهل" : "—"} •
                    تغطية {money(n.covered_amount, currency)} • حصة {money(n.patient_share, currency)}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="linkMode"
                checked={linkMode === "unlink"}
                onChange={() => setLinkMode("unlink")}
              />
              <span>فصل المطالبة (اعتبار الفاتورة نقدية)</span>
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">
              حصة المريض المتوقعة
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overrideShareEnabled}
                onChange={(e) => setOverrideShareEnabled(e.target.checked)}
              />
              <span>تجاوز القيمة يدوياً</span>
            </label>
            {overrideShareEnabled && (
              <div className="ms-6 flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={overrideShare}
                  onChange={(e) => setOverrideShare(e.target.value)}
                  className="w-40 rounded-md border bg-background px-2 py-1.5 text-sm tabular-nums"
                />
                <span className="text-xs text-muted-foreground">{currency}</span>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">حالة الفاتورة</legend>
            <select
              value={statusOverride}
              onChange={(e) => setStatusOverride(e.target.value)}
              className="w-full max-w-xs rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— لا تغيير —</option>
              <option value="issued">issued</option>
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="cancelled">cancelled</option>
              <option value="refunded">refunded</option>
            </select>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={resolved}
              onChange={(e) => setResolved(e.target.checked)}
            />
            <span>وسم الفرق كمعالج (Resolved)</span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              سبب التعديل <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="مثال: خطأ في إسناد المطالبة — تم التحقق مع قسم التأمين"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              يُحفظ السبب في سجل المراجعة ولا يمكن تعديله لاحقاً.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={apply.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {apply.isPending ? "جارٍ الحفظ…" : "حفظ التعديل"}
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="border-t px-4 py-3">
          <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
            <History className="h-3.5 w-3.5" /> سجل التعديلات ({history.length})
          </h3>
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li
                key={h.id}
                className={`rounded-md border p-3 ${
                  h.revoked_at ? "opacity-60 line-through decoration-muted-foreground/50" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("ar-SA")} • {h.created_by_name ?? "—"}
                    </div>
                    <div className="mt-1 font-medium">{h.reason}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                      {h.unlink_nphies && <Tag>فصل NPHIES</Tag>}
                      {h.linked_nphies_request_id && <Tag>ربط NPHIES</Tag>}
                      {h.override_expected_share != null && (
                        <Tag>حصة={money(h.override_expected_share, currency)}</Tag>
                      )}
                      {h.override_invoice_status && <Tag>حالة={h.override_invoice_status}</Tag>}
                      {h.resolved && <Tag>Resolved</Tag>}
                    </div>
                    {h.revoked_at && (
                      <div className="mt-2 text-[11px] text-muted-foreground no-underline">
                        أُلغي بواسطة {h.revoked_by_name ?? "—"} في{" "}
                        {new Date(h.revoked_at).toLocaleString("ar-SA")} — {h.revoke_reason}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{children}</span>
  );
}

