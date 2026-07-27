import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  ShieldCheck,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import {
  listAdminInsuranceApprovals,
  listInsuranceProvidersForFilter,
} from "@/lib/admin/insurance.functions";
import { useActiveBranch } from "@/lib/active-branch";

type InsuranceSearch = {
  status?: string;
  provider?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
};

export const Route = createFileRoute("/_authenticated/admin/insurance")({
  head: () => ({
    meta: [
      { title: "التأمين والموافقات | لوحة الإدارة" },
      {
        name: "description",
        content:
          "استعراض طلبات وموافقات التأمين على مستوى المنصة مع البحث والتصفية والحفر إلى التفاصيل.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): InsuranceSearch => ({
    status: typeof raw.status === "string" ? raw.status : undefined,
    provider: typeof raw.provider === "string" ? raw.provider : undefined,
    q: typeof raw.q === "string" ? raw.q : undefined,
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" ? raw.to : undefined,
    page: typeof raw.page === "number" ? raw.page : Number(raw.page) || undefined,
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل طلبات التأمين</h2>
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
      لا توجد صفحة تأمين مطابقة.
    </div>
  ),
  component: InsurancePage,
});

const PAGE_SIZE = 50;

const STATUS_OPTIONS: Array<{ v: string; label: string }> = [
  { v: "", label: "كل الحالات" },
  { v: "pending", label: "قيد المراجعة" },
  { v: "submitted", label: "مُقدّمة" },
  { v: "approved", label: "معتمدة" },
  { v: "partial", label: "معتمدة جزئيًا" },
  { v: "rejected", label: "مرفوضة" },
  { v: "expired", label: "منتهية" },
  { v: "cancelled", label: "ملغاة" },
];

function statusBadge(status: string | null): string {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "approved":
      return `${base} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`;
    case "partial":
      return `${base} bg-amber-500/10 text-amber-700 dark:text-amber-400`;
    case "rejected":
      return `${base} bg-destructive/10 text-destructive`;
    case "expired":
      return `${base} bg-muted text-muted-foreground`;
    case "cancelled":
      return `${base} bg-muted text-muted-foreground`;
    case "submitted":
      return `${base} bg-primary/10 text-primary`;
    case "pending":
      return `${base} bg-sky-500/10 text-sky-700 dark:text-sky-400`;
    default:
      return `${base} bg-muted text-muted-foreground`;
  }
}

function fmtMoney(total: number | null, currency = "SAR"): string {
  if (total == null) return "—";
  try {
    return new Intl.NumberFormat("ar-SA", { style: "currency", currency }).format(Number(total));
  } catch {
    return `${total} ${currency}`;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function InsurancePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const listFn = useServerFn(listAdminInsuranceApprovals);
  const providersFn = useServerFn(listInsuranceProvidersForFilter);
  const { branchId, activeBranch, branches, isLoading: branchesLoading } = useActiveBranch();

  const [q, setQ] = useState(search.q ?? "");
  const [status, setStatus] = useState(search.status ?? "");
  const [provider, setProvider] = useState(search.provider ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const page = search.page ?? 0;

  const params = useMemo(
    () => ({
      branch_id: branchId ?? undefined,
      status: search.status || undefined,
      provider_id: search.provider || undefined,
      q: search.q || undefined,
      from: search.from ? new Date(search.from).toISOString() : undefined,
      to: search.to ? new Date(search.to).toISOString() : undefined,
      limit: PAGE_SIZE,
      offset: (search.page ?? 0) * PAGE_SIZE,
    }),
    [branchId, search.status, search.provider, search.q, search.from, search.to, search.page],
  );

  const list = useQuery({
    queryKey: ["admin-insurance", params],
    queryFn: () => listFn({ data: params }),
  });

  const providers = useQuery({
    queryKey: ["admin-insurance-providers"],
    queryFn: () => providersFn(),
    staleTime: 60_000,
  });

  const rows: unknown[] = list.data?.rows ?? [];
  const total: number = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = () => {
    navigate({
      search: (prev: InsuranceSearch) => ({
        ...prev,
        q: q || undefined,
        status: status || undefined,
        provider: provider || undefined,
        from: from || undefined,
        to: to || undefined,
        page: 0,
      }),
    });
  };

  const resetFilters = () => {
    setQ("");
    setStatus("");
    setProvider("");
    setFrom("");
    setTo("");
    navigate({ search: () => ({}) });
  };

  const setPage = (next: number) => {
    navigate({ search: (prev: InsuranceSearch) => ({ ...prev, page: next }) });
  };

  return (
    <div className="container-app py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            التأمين والموافقات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {branchId
              ? `طلبات التأمين المرتبطة بالفرع: ${activeBranch?.name_ar ?? activeBranch?.name_en ?? "—"}`
              : "عرض طلبات التأمين عبر كل الفروع — استخدم مبدّل الفرع في الأعلى للتصفية."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => list.refetch()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 ${list.isFetching ? "animate-spin" : ""}`} /> تحديث
        </button>
      </header>

      <section
        className="mt-6 grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-6"
        aria-label="عوامل التصفية"
      >
        <label className="flex flex-col gap-1 text-xs text-muted-foreground lg:col-span-2">
          <span>بحث (رقم الطلب / الخدمة / ملاحظات)</span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute inset-y-0 end-2 my-auto h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="APP-… أو نص"
              className="w-full rounded-md border bg-background px-3 py-2 pe-8 text-sm"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>الحالة</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>شركة التأمين</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">كل الشركات</option>
            {(providers.data?.rows ?? []).map((p: unknown) => (
              <option key={p.id} value={p.id}>
                {p.name_ar || p.name_en}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>من</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>إلى</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>
        <div className="flex items-end gap-2 lg:col-span-6">
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            تطبيق
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <X className="h-4 w-4" /> إعادة الضبط
          </button>
          <div className="ms-auto text-xs text-muted-foreground">
            {branchesLoading ? "…" : `${branches.length} فروع متاحة`} • الإجمالي: {total}
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start">رقم الطلب</th>
              <th className="px-3 py-2 text-start">المريض</th>
              <th className="px-3 py-2 text-start">شركة التأمين</th>
              <th className="px-3 py-2 text-start">الفرع</th>
              <th className="px-3 py-2 text-start">الحالة</th>
              <th className="px-3 py-2 text-start">المعتمد</th>
              <th className="px-3 py-2 text-start">حصة المريض</th>
              <th className="px-3 py-2 text-start">أُنشئ في</th>
              <th className="px-3 py-2" aria-label="إجراءات" />
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : list.isError ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center">
                  <div className="inline-flex flex-col items-center gap-2 text-destructive">
                    <AlertTriangle className="h-8 w-8" aria-hidden="true" />
                    <span className="text-sm">
                      {list.error instanceof Error ? list.error.message : "خطأ غير متوقع"}
                    </span>
                    <button
                      type="button"
                      onClick={() => list.refetch()}
                      className="mt-2 inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> إعادة المحاولة
                    </button>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-14 text-center">
                  <div className="inline-flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8" aria-hidden="true" />
                    <span className="text-sm">لا توجد طلبات مطابقة للتصفية.</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const branch = r.appointment?.branch;
                const patient = r.patient;
                const prov = r.provider;
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.request_number ?? r.id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {patient?.full_name_ar || patient?.full_name_en || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {patient?.mrn ? `MRN ${patient.mrn}` : (patient?.phone ?? "")}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {prov?.name_ar || prov?.name_en || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {branch?.name_ar || branch?.name_en || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusBadge(r.status)}>{r.status ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2 font-medium">{fmtMoney(r.approved_amount)}</td>
                    <td className="px-3 py-2">{fmtMoney(r.patient_share)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {fmtDate(r.created_at)}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <Link
                        to="/admin/insurance/$approvalId"
                        params={{ approvalId: r.id }}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                      >
                        <FileText className="h-3.5 w-3.5" /> التفاصيل
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <nav className="mt-4 flex items-center justify-between text-sm" aria-label="ترقيم الصفحات">
        <div className="text-muted-foreground">
          صفحة {page + 1} من {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage(page - 1)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" /> السابق
          </button>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(page + 1)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-40"
          >
            التالي <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </nav>
    </div>
  );
}
