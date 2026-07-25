import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  Scale,
  Download,
  Inbox,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { getDailyReconciliation } from "@/lib/admin/reconciliation.functions";
import { useActiveBranch } from "@/lib/active-branch";

type Search = { date?: string };

export const Route = createFileRoute("/_authenticated/admin/reconciliation")({
  head: () => ({
    meta: [
      { title: "التسوية المالية اليومية | لوحة الإدارة" },
      {
        name: "description",
        content:
          "مطابقة الفواتير والمدفوعات مع مطالبات NPHIES يومياً وعرض الفروقات القابلة للتتبع.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): Search => ({
    date: typeof raw.date === "string" ? raw.date : undefined,
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل التسوية</h2>
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
      لا توجد صفحة مطابقة.
    </div>
  ),
  component: ReconciliationPage,
});

const FLAG_LABEL: Record<string, string> = {
  variance: "فرق مالي",
  missing_nphies: "لا توجد مطالبة NPHIES",
  collected_not_marked_paid: "محصّلة ولم توسم مدفوعة",
  marked_paid_underpaid: "مدفوعة ولكن ناقصة",
  zero_billed: "قيمة صفرية",
};

function money(n: number | null | undefined, ccy = "SAR"): string {
  if (n == null || Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("ar-SA", { style: "currency", currency: ccy }).format(Number(n));
  } catch {
    return `${n} ${ccy}`;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ReconciliationPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const runFn = useServerFn(getDailyReconciliation);
  const { branchId, activeBranch } = useActiveBranch();
  const date = search.date ?? todayIso();
  const [showOnlyVariance, setShowOnlyVariance] = useState(false);

  const params = useMemo(
    () => ({ date, branch_id: branchId ?? undefined }),
    [date, branchId],
  );

  const q = useQuery({
    queryKey: ["admin-reconciliation", params],
    queryFn: () => runFn({ data: params }),
  });

  const summary = q.data?.summary;
  const rows = q.data?.rows ?? [];
  const unmatched = q.data?.unmatchedNphies ?? [];

  const filtered = showOnlyVariance
    ? rows.filter((r) => r.flags.includes("variance") || r.flags.length > 0)
    : rows;

  const setDate = (next: string) => {
    navigate({ search: () => ({ date: next }) });
  };

  const exportCsv = () => {
    const headers = [
      "invoice_number",
      "status",
      "branch",
      "patient",
      "national_id",
      "billed",
      "collected",
      "refunded",
      "net_collected",
      "nphies_covered",
      "expected_patient_share",
      "variance",
      "flags",
      "invoice_id",
      "nphies_request_id",
      "appointment_ref",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")].concat(
      rows.map((r) =>
        [
          r.invoice_number,
          r.status,
          r.branch_name,
          r.patient_name,
          r.patient_national_id,
          r.billed,
          r.collected,
          r.refunded,
          r.net_collected,
          r.nphies_covered,
          r.expected_patient_share,
          r.variance,
          r.flags.join("|"),
          r.invoice_id,
          r.nphies_request_id,
          r.appointment_ref,
        ]
          .map(escape)
          .join(","),
      ),
    );
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation-${date}${branchId ? `-${branchId}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container-app py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="h-6 w-6" aria-hidden="true" />
            التسوية المالية اليومية
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            مطابقة الفواتير والمدفوعات مع مطالبات NPHIES{" "}
            {branchId && activeBranch
              ? `— ${activeBranch.name_ar ?? activeBranch.name_en}`
              : "— كل الفروع"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => q.refetch()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> تحديث
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6" aria-label="ملخّص اليوم">
        <SummaryCard label="عدد الفواتير" value={summary?.invoice_count ?? "—"} />
        <SummaryCard label="إجمالي الفواتير" value={money(summary?.total_billed)} />
        <SummaryCard label="المحصّل الصافي" value={money(summary?.total_net_collected)} />
        <SummaryCard label="تغطية NPHIES" value={money(summary?.total_nphies_covered)} />
        <SummaryCard
          label="حصة المريض المتوقعة"
          value={money(summary?.total_expected_patient_share)}
        />
        <SummaryCard
          label="إجمالي الفرق"
          value={money(summary?.total_variance)}
          tone={
            summary && Math.abs(summary.total_variance) > 0.009
              ? summary.total_variance < 0
                ? "danger"
                : "warning"
              : "success"
          }
        />
      </section>

      <section className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
          {summary?.discrepancy_count ?? 0} فروقات
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          {summary?.matched_nphies ?? 0} مطالبة NPHIES مطابقة
        </span>
        <span>مطالبات NPHIES بدون فاتورة: {summary?.unmatched_nphies_requests ?? 0}</span>
        <label className="ms-auto inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={showOnlyVariance}
            onChange={(e) => setShowOnlyVariance(e.target.checked)}
          />
          <span>عرض الفروقات فقط</span>
        </label>
      </section>

      {/* Rows */}
      <section className="mt-6 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start">الفاتورة</th>
              <th className="px-3 py-2 text-start">الفرع / المريض</th>
              <th className="px-3 py-2 text-end">المفوتر</th>
              <th className="px-3 py-2 text-end">المحصّل</th>
              <th className="px-3 py-2 text-end">تغطية NPHIES</th>
              <th className="px-3 py-2 text-end">حصة المتوقعة</th>
              <th className="px-3 py-2 text-end">الفرق</th>
              <th className="px-3 py-2 text-start">إشارات</th>
              <th className="px-3 py-2 text-start">تتبّع</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : q.isError ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-destructive">
                  {q.error instanceof Error ? q.error.message : "خطأ غير متوقع"}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-14 text-center">
                  <div className="inline-flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8" aria-hidden="true" />
                    <span className="text-sm">
                      {rows.length === 0
                        ? "لا توجد فواتير صادرة في هذا اليوم."
                        : "لا توجد فروقات — كل الفواتير مطابقة."}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const hasVar = Math.abs(r.variance) > 0.009;
                return (
                  <tr key={r.invoice_id} className="border-t align-top hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs">
                      <div>{r.invoice_number ?? r.invoice_id.slice(0, 8)}</div>
                      <div className="text-[10px] text-muted-foreground">{r.status ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.patient_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.branch_name ?? "—"}
                        {r.patient_national_id ? ` • ${r.patient_national_id}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">{money(r.billed, r.currency)}</td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      <div>{money(r.net_collected, r.currency)}</div>
                      {r.refunded > 0 ? (
                        <div className="text-[10px] text-muted-foreground">
                          استرداد: {money(r.refunded, r.currency)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {r.nphies_covered != null ? (
                        <>
                          <div>{money(r.nphies_covered, r.currency)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {r.nphies_mode ?? "—"} •{" "}
                            {r.nphies_eligible === true
                              ? "مؤهل"
                              : r.nphies_eligible === false
                                ? "غير مؤهل"
                                : "—"}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {money(r.expected_patient_share, r.currency)}
                    </td>
                    <td
                      className={`px-3 py-2 text-end font-medium tabular-nums ${
                        hasVar
                          ? r.variance < 0
                            ? "text-destructive"
                            : "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {money(r.variance, r.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.flags.length === 0 ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                            مطابق
                          </span>
                        ) : (
                          r.flags.map((f) => (
                            <span
                              key={f}
                              className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-400"
                            >
                              {FLAG_LABEL[f] ?? f}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <a
                          className="text-primary hover:underline"
                          href={`/admin/billing/${r.invoice_id}`}
                        >
                          فاتورة
                        </a>
                        {r.appointment_id ? (
                          <a
                            className="text-primary hover:underline"
                            href={`/admin/appointments/${r.appointment_id}`}
                          >
                            الموعد {r.appointment_ref ? `#${r.appointment_ref}` : ""}
                          </a>
                        ) : null}
                        {r.nphies_request_id ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            NPHIES {r.nphies_request_id.slice(0, 8)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {/* Unmatched NPHIES */}
      {unmatched.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />
            مطالبات NPHIES بدون فاتورة مطابقة ({unmatched.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            مطالبات سُجّلت في NPHIES في هذا اليوم ولم يُعثر لها على فاتورة مقابلة عبر (الطبيب × الهوية).
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">وقت المطالبة</th>
                  <th className="px-3 py-2 text-start">الوضع</th>
                  <th className="px-3 py-2 text-start">الهوية</th>
                  <th className="px-3 py-2 text-start">الطبيب</th>
                  <th className="px-3 py-2 text-end">التغطية</th>
                  <th className="px-3 py-2 text-end">حصة المريض</th>
                  <th className="px-3 py-2 text-start">مؤهل</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((n) => (
                  <tr key={n.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString("ar-SA")}
                    </td>
                    <td className="px-3 py-2 text-xs">{n.mode}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {n.patient_national_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {n.doctor_id ? n.doctor_id.slice(0, 8) : "—"}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">{money(n.covered_amount)}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{money(n.patient_share)}</td>
                    <td className="px-3 py-2 text-xs">
                      {n.eligible === true ? "نعم" : n.eligible === false ? "لا" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "success" | "warning" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : tone === "success"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "";
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
