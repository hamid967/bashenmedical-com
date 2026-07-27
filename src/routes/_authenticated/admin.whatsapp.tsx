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
  MessageCircle,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { listAdminWhatsappRequests } from "@/lib/admin/whatsapp.functions";
import { useActiveBranch } from "@/lib/active-branch";

type WhatsappSearch = {
  internal_status?: string;
  handoff_status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
};

export const Route = createFileRoute("/_authenticated/admin/whatsapp")({
  head: () => ({
    meta: [
      { title: "طلبات واتساب | لوحة الإدارة" },
      {
        name: "description",
        content:
          "استعراض طلبات الاستفسار الواردة عبر واتساب مع حالة التحويل وسجلات التسليم والحفر إلى التفاصيل.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): WhatsappSearch => ({
    internal_status: typeof raw.internal_status === "string" ? raw.internal_status : undefined,
    handoff_status: typeof raw.handoff_status === "string" ? raw.handoff_status : undefined,
    q: typeof raw.q === "string" ? raw.q : undefined,
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" ? raw.to : undefined,
    page: typeof raw.page === "number" ? raw.page : Number(raw.page) || undefined,
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل طلبات واتساب</h2>
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
  component: WhatsappPage,
});

const PAGE_SIZE = 50;

const INTERNAL_STATUS: Array<{ v: string; label: string }> = [
  { v: "", label: "كل حالات المعالجة" },
  { v: "new", label: "جديد" },
  { v: "contacted", label: "تم التواصل" },
  { v: "awaiting_patient", label: "بانتظار المريض" },
  { v: "appointment_created", label: "أُنشئ موعد" },
  { v: "completed", label: "مكتمل" },
  { v: "cancelled", label: "ملغى" },
];

const HANDOFF_STATUS: Array<{ v: string; label: string }> = [
  { v: "", label: "كل حالات التحويل" },
  { v: "not_opened", label: "لم يُفتح" },
  { v: "opened", label: "فُتح" },
  { v: "delivery_unverified", label: "تسليم غير مؤكد" },
  { v: "delivered", label: "تم التسليم" },
  { v: "failed", label: "فشل" },
];

function pillClass(kind: "internal" | "handoff", v: string | null): string {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  if (kind === "handoff") {
    switch (v) {
      case "delivered":
        return `${base} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`;
      case "opened":
        return `${base} bg-primary/10 text-primary`;
      case "delivery_unverified":
        return `${base} bg-amber-500/10 text-amber-700 dark:text-amber-400`;
      case "failed":
        return `${base} bg-destructive/10 text-destructive`;
      default:
        return `${base} bg-muted text-muted-foreground`;
    }
  }
  switch (v) {
    case "completed":
    case "appointment_created":
      return `${base} bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`;
    case "contacted":
    case "awaiting_patient":
      return `${base} bg-primary/10 text-primary`;
    case "cancelled":
      return `${base} bg-muted text-muted-foreground`;
    case "new":
      return `${base} bg-amber-500/10 text-amber-700 dark:text-amber-400`;
    default:
      return `${base} bg-muted text-muted-foreground`;
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

function WhatsappPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const listFn = useServerFn(listAdminWhatsappRequests);
  const { branchId, activeBranch, branches, isLoading: branchesLoading } = useActiveBranch();

  const [q, setQ] = useState(search.q ?? "");
  const [internalStatus, setInternalStatus] = useState(search.internal_status ?? "");
  const [handoffStatus, setHandoffStatus] = useState(search.handoff_status ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const page = search.page ?? 0;

  const params = useMemo(
    () => ({
      branch_id: branchId ?? undefined,
      internal_status: (search.internal_status as unknown) || undefined,
      handoff_status: (search.handoff_status as unknown) || undefined,
      q: search.q || undefined,
      from: search.from ? new Date(search.from).toISOString() : undefined,
      to: search.to ? new Date(search.to).toISOString() : undefined,
      limit: PAGE_SIZE,
      offset: (search.page ?? 0) * PAGE_SIZE,
    }),
    [
      branchId,
      search.internal_status,
      search.handoff_status,
      search.q,
      search.from,
      search.to,
      search.page,
    ],
  );

  const list = useQuery({
    queryKey: ["admin-whatsapp", params],
    queryFn: () => listFn({ data: params }),
  });

  const rows: unknown[] = list.data?.rows ?? [];
  const total: number = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = () => {
    navigate({
      search: (prev: WhatsappSearch) => ({
        ...prev,
        q: q || undefined,
        internal_status: internalStatus || undefined,
        handoff_status: handoffStatus || undefined,
        from: from || undefined,
        to: to || undefined,
        page: 0,
      }),
    });
  };

  const resetFilters = () => {
    setQ("");
    setInternalStatus("");
    setHandoffStatus("");
    setFrom("");
    setTo("");
    navigate({ search: () => ({}) });
  };

  const setPage = (next: number) => {
    navigate({ search: (prev: WhatsappSearch) => ({ ...prev, page: next }) });
  };

  return (
    <div className="container-app py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
            طلبات واتساب
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {branchId
              ? `الطلبات المرتبطة بالفرع: ${activeBranch?.name_ar ?? activeBranch?.name_en ?? "—"}`
              : "عرض طلبات واتساب عبر كل الفروع — استخدم مبدّل الفرع في الأعلى للتصفية."}
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
          <span>بحث (رقم الطلب / الاسم / الجوال / الخدمة)</span>
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
              placeholder="BMC-WA-… أو نص"
              className="w-full rounded-md border bg-background px-3 py-2 pe-8 text-sm"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>حالة المعالجة</span>
          <select
            value={internalStatus}
            onChange={(e) => setInternalStatus(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {INTERNAL_STATUS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>حالة التحويل</span>
          <select
            value={handoffStatus}
            onChange={(e) => setHandoffStatus(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            {HANDOFF_STATUS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
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
              <th className="px-3 py-2 text-start">المُستفسر</th>
              <th className="px-3 py-2 text-start">الخدمة</th>
              <th className="px-3 py-2 text-start">الفرع</th>
              <th className="px-3 py-2 text-start">المعالجة</th>
              <th className="px-3 py-2 text-start">التحويل</th>
              <th className="px-3 py-2 text-start">أُنشئ في</th>
              <th className="px-3 py-2" aria-label="إجراءات" />
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    </td>
                  ))}
                </tr>
              ))
            ) : list.isError ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center">
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
                <td colSpan={8} className="px-3 py-14 text-center">
                  <div className="inline-flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8" aria-hidden="true" />
                    <span className="text-sm">لا توجد طلبات واتساب مطابقة للتصفية.</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const branch = r.branch;
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs">{r.request_number}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.mobile_e164 || r.mobile_number || ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {r.service_label || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {branch?.name_ar || branch?.name_en || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={pillClass("internal", r.internal_status)}>
                        {r.internal_status ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={pillClass("handoff", r.whatsapp_handoff_status)}>
                        {r.whatsapp_handoff_status ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {fmtDate(r.created_at)}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <Link
                        to="/admin/whatsapp/$inquiryId"
                        params={{ inquiryId: r.id }}
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
