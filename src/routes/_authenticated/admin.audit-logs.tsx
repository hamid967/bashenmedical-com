import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { RefreshCw, Search, X, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { listAdminAuditLogs, listAuditFacets } from "@/lib/admin/audit-logs.functions";
import { getMyRoles } from "@/lib/admin.functions";
import { ExportMenu } from "@/components/admin/v2/ExportMenu";
import type { Column } from "@/lib/export-utils";

type AuditSearch = {
  q?: string;
  entity_type?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
};

export const Route = createFileRoute("/_authenticated/admin/audit-logs")({
  head: () => ({
    meta: [
      { title: "سجل التدقيق (Audit Logs) | لوحة الإدارة" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): AuditSearch => ({
    q: typeof raw.q === "string" ? raw.q : undefined,
    entity_type: typeof raw.entity_type === "string" ? raw.entity_type : undefined,
    action: typeof raw.action === "string" ? raw.action : undefined,
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" ? raw.to : undefined,
    page: typeof raw.page === "number" ? raw.page : Number(raw.page) || undefined,
  }),
  component: AuditLogsPage,
});

const PAGE_SIZE = 50;

const AUDIT_EXPORT_COLS: Column<any>[] = [
  {
    header: "الوقت",
    accessor: (r) => (r.created_at ? new Date(r.created_at).toLocaleString("ar-SA") : ""),
  },
  { header: "الكيان", accessor: (r) => r.entity_type ?? "" },
  { header: "العملية", accessor: (r) => r.action ?? "" },
  { header: "معرّف السجل", accessor: (r) => r.entity_id ?? "" },
  { header: "المستخدم", accessor: (r) => r.actor_id ?? "" },
  { header: "الدور", accessor: (r) => r.actor_role ?? "" },
  { header: "IP", accessor: (r) => r.ip_address ?? "" },
  { header: "User-Agent", accessor: (r) => r.user_agent ?? "" },
];

function AuditLogsPage() {
  const search = Route.useSearch();
  const rolesFn = useServerFn(getMyRoles);
  const listFn = useServerFn(listAdminAuditLogs);
  const facetsFn = useServerFn(listAuditFacets);

  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isStaff = useMemo(() => {
    const r = rolesQ.data?.roles ?? [];
    return r.includes("admin" as any) || r.includes("super_admin" as any);
  }, [rolesQ.data]);

  const [q, setQ] = useState(search.q ?? "");
  const [entityType, setEntityType] = useState(search.entity_type ?? "");
  const [action, setAction] = useState(search.action ?? "");
  const [from, setFrom] = useState(search.from ?? "");
  const [to, setTo] = useState(search.to ?? "");
  const [page, setPage] = useState<number>(search.page ?? 0);
  const [selected, setSelected] = useState<any | null>(null);

  const facets = useQuery({
    queryKey: ["audit-facets"],
    queryFn: () => facetsFn(),
    enabled: isStaff,
  });

  const list = useQuery({
    queryKey: ["admin-audit-logs", q, entityType, action, from, to, page],
    queryFn: () =>
      listFn({
        data: {
          q: q || undefined,
          entity_type: entityType || undefined,
          action: action || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
    enabled: isStaff,
  });

  if (rolesQ.isLoading) {
    return (
      <div className="container-app py-16 text-center text-muted-foreground">جارٍ التحميل…</div>
    );
  }
  if (!isStaff) {
    return (
      <div className="container-app py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">هذه الصفحة للمسؤولين فقط.</p>
      </div>
    );
  }

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setQ("");
    setEntityType("");
    setAction("");
    setFrom("");
    setTo("");
    setPage(0);
  };

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">سجل التدقيق (Audit Logs)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            بحث في تعديلات السجلات وتغييرات الحالة والعمليات الحساسة عبر النظام.
          </p>
        </div>
        <Link
          to="/admin"
          className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
        >
          لوحة التحكم
        </Link>
      </div>

      <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="block text-xs text-muted-foreground">بحث</label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="entity_id / action / IP"
              className="w-full rounded-md border border-input bg-background px-8 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">نوع الكيان</label>
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(0);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">الكل</option>
            {(facets.data?.entity_types ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">العملية</label>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(0);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">الكل</option>
            {(facets.data?.actions ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">من</label>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">إلى</label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div className="md:col-span-6 flex flex-wrap gap-2">
          <button
            onClick={() => list.refetch()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            <X className="h-4 w-4" /> مسح الفلاتر
          </button>
          <ExportMenu
            allowed={isStaff}
            disabled={list.isLoading}
            filename="audit-logs"
            title="سجل التدقيق (Audit Logs)"
            subtitle={`فلاتر: ${entityType || "الكل"} / ${action || "الكل"}${from ? ` — من ${from}` : ""}${to ? ` — إلى ${to}` : ""}${q ? ` — بحث: ${q}` : ""}`}
            meta={{ الإجمالي: String(total) }}
            columns={AUDIT_EXPORT_COLS}
            rows={rows}
            fetchAll={async () => {
              const CHUNK = 500;
              const MAX = 5000;
              const cap = Math.min(total, MAX);
              const out: any[] = [];
              for (let off = 0; off < cap; off += CHUNK) {
                const res = await listFn({
                  data: {
                    q: q || undefined,
                    entity_type: entityType || undefined,
                    action: action || undefined,
                    from: from ? new Date(from).toISOString() : undefined,
                    to: to ? new Date(to).toISOString() : undefined,
                    limit: CHUNK,
                    offset: off,
                  },
                });
                out.push(...(res?.rows ?? []));
                if (!res?.rows?.length) break;
              }
              return out;
            }}
          />
          <div className="ms-auto text-xs text-muted-foreground self-center">
            الإجمالي: {total.toLocaleString("ar-SA")}
          </div>
        </div>
      </div>

      {/* Table below */}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right">الوقت</th>
              <th className="px-3 py-2 text-right">الكيان</th>
              <th className="px-3 py-2 text-right">العملية</th>
              <th className="px-3 py-2 text-right">المستخدم / الدور</th>
              <th className="px-3 py-2 text-right">معرّف السجل</th>
              <th className="px-3 py-2 text-right">IP</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {!list.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  لا توجد نتائج
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr
                key={r.id}
                onClick={() => setSelected(r)}
                className="cursor-pointer border-t border-border hover:bg-muted/40"
              >
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {new Date(r.created_at).toLocaleString("ar-SA")}
                </td>
                <td className="px-3 py-2 text-xs font-mono">{r.entity_type}</td>
                <td className="px-3 py-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {r.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="font-mono">{r.actor_id ? r.actor_id.slice(0, 8) : "—"}</div>
                  <div className="text-muted-foreground">{r.actor_role || ""}</div>
                </td>
                <td
                  className="max-w-[220px] truncate px-3 py-2 font-mono text-xs"
                  dir="ltr"
                  title={r.entity_id ?? ""}
                >
                  {r.entity_id || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs" dir="ltr">
                  {r.ip_address || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          صفحة {page + 1} من {totalPages}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" /> السابق
          </button>
          <button
            onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
            disabled={page + 1 >= totalPages}
            className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            التالي <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {selected && <DetailModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetailModal({ row, onClose }: { row: any; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">تفاصيل العملية</h2>
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
              {row.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-input p-1.5 hover:bg-muted"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="الوقت" value={new Date(row.created_at).toLocaleString("ar-SA")} />
          <Info label="العملية" value={row.action} />
          <Info label="نوع الكيان" value={row.entity_type} mono />
          <Info label="معرّف السجل" value={row.entity_id} mono />
          <Info label="المستخدم" value={row.actor_id} mono />
          <Info label="دور المستخدم" value={row.actor_role} />
          <Info label="IP" value={row.ip_address} mono />
          <div className="sm:col-span-2">
            <Info label="User-Agent" value={row.user_agent} mono />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <JsonPane title="قبل (before)" value={row.before_data} />
          <JsonPane title="بعد (after)" value={row.after_data} />
        </div>
        {row.metadata && (
          <div className="mt-3">
            <JsonPane title="metadata" value={row.metadata} />
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 break-words text-sm ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {value ? String(value) : <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function JsonPane({ title, value }: { title: string; value: any }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <pre
        dir="ltr"
        className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-tight"
      >
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
