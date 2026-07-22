import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listAuditLog, listAuditActions } from "@/lib/rbac.functions";
import { getMyRoles } from "@/lib/admin.functions";
import {
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Download,
  X,
  Copy,
  ChevronDown,
  ChevronLeft,
} from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";

// Fields we never expose in exports even if a legacy row still has them.
const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "encrypted_password",
  "auth_token",
  "storage_path",
  "file_url",
]);

function sanitize(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

function formatVal(v: any): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Human-readable "field: old → new" list, one per line. */
function formatChanges(metadata: any): string {
  if (!metadata || typeof metadata !== "object") return "";
  const clean = sanitize(metadata);
  const parts: string[] = [];
  if (clean.changes && typeof clean.changes === "object") {
    for (const [k, diff] of Object.entries<any>(clean.changes)) {
      parts.push(`${k}: ${formatVal(diff?.old)} → ${formatVal(diff?.new)}`);
    }
  }
  if (clean.new && typeof clean.new === "object" && !clean.changes) {
    for (const [k, v] of Object.entries<any>(clean.new)) {
      parts.push(`+ ${k}: ${formatVal(v)}`);
    }
  }
  if (clean.old && typeof clean.old === "object" && !clean.changes && !clean.new) {
    for (const [k, v] of Object.entries<any>(clean.old)) {
      parts.push(`- ${k}: ${formatVal(v)}`);
    }
  }
  return parts.join("\n");
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: Array<Record<string, unknown>>, filename: string) {
  const headers = [
    "created_at",
    "actor_name",
    "actor_phone",
    "action",
    "table_name",
    "record_id",
    "branch_name",
    "from_status",
    "to_status",
    "reason",
    "changes",
    "metadata",
    "ip_address",
    "user_agent",
    "appointment_id",
  ];
  const headerLabels = [
    "الوقت",
    "المستخدم",
    "الجوال",
    "العملية",
    "الجدول",
    "معرّف السجل",
    "الفرع",
    "من",
    "إلى",
    "السبب",
    "الحقول المتغيّرة (قبل → بعد)",
    "التفاصيل الخام (JSON)",
    "IP",
    "المتصفح",
    "معرّف الحجز",
  ];
  const lines = [headerLabels.join(",")];
  for (const r of rows) {
    const row = r as any;
    const enriched = {
      ...row,
      changes: formatChanges(row.metadata),
      metadata: sanitize(row.metadata),
    };
    lines.push(headers.map((h) => csvEscape(enriched[h])).join(","));
  }
  // Prepend BOM so Excel opens UTF-8 Arabic correctly
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type AuditSearch = {
  action?: string;
  from?: string;
  to?: string;
  id?: string;
};

export const Route = createFileRoute("/_authenticated/audit-log")({
  head: () => ({
    meta: [{ title: "سجل التدقيق | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (raw: Record<string, unknown>): AuditSearch => ({
    action: typeof raw.action === "string" ? raw.action : undefined,
    from: typeof raw.from === "string" ? raw.from : undefined,
    to: typeof raw.to === "string" ? raw.to : undefined,
    id: typeof raw.id === "string" ? raw.id : undefined,
  }),
  component: () => (
    <RequirePermission anyOf="audit.view">
      <AuditLogPage />
    </RequirePermission>
  ),
});

function AuditLogPage() {
  const search = Route.useSearch();
  const myRolesFn = useServerFn(getMyRoles);
  const listFn = useServerFn(listAuditLog);
  const actionsFn = useServerFn(listAuditActions);

  const myRoles = useQuery({ queryKey: ["my-roles"], queryFn: () => myRolesFn() });
  const isAdmin =
    (myRoles.data?.roles ?? []).includes("admin" as any) ||
    (myRoles.data?.roles ?? []).includes("super_admin" as any);

  const [action, setAction] = useState<string>(search.action ?? "");
  const [from, setFrom] = useState<string>(search.from ?? "");
  const [to, setTo] = useState<string>(search.to ?? "");
  const [limit, setLimit] = useState<number>(100);
  const [selected, setSelected] = useState<any | null>(null);
  const highlightId = search.id;

  const actions = useQuery({
    queryKey: ["audit-actions"],
    queryFn: () => actionsFn(),
    enabled: isAdmin,
  });

  const log = useQuery({
    queryKey: ["audit-log", action, from, to, limit],
    queryFn: () =>
      listFn({
        data: {
          action: action || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
          limit,
        },
      }),
    enabled: isAdmin,
  });

  // Auto-open the requested audit event when deep-linked via ?id=
  useEffect(() => {
    if (!highlightId || !log.data) return;
    const found = (log.data as any[]).find((r) => r.id === highlightId);
    if (found) setSelected(found);
  }, [highlightId, log.data]);

  if (myRoles.isLoading) {
    return (
      <div className="container-app py-16 text-center text-muted-foreground">جارٍ التحميل…</div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="container-app py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">هذه الصفحة للمسؤولين فقط.</p>
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">سجل التدقيق (Audit Log)</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            جميع العمليات الحساسة مع الوقت واسم المستخدم وعنوان IP والمتصفح.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/rbac"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            إدارة الصلاحيات
          </Link>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4" /> لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="block text-xs text-muted-foreground">العملية</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">الكل</option>
            {(actions.data ?? []).map((a) => (
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
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">إلى</label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">الحد</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="mt-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {[50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => log.refetch()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
        <button
          onClick={() => {
            const rows = log.data ?? [];
            if (rows.length === 0) return;
            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
            downloadCsv(rows as any, `audit-log-${stamp}.csv`);
          }}
          disabled={!log.data || log.data.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> تصدير CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right">الوقت</th>
              <th className="px-3 py-2 text-right">المستخدم</th>
              <th className="px-3 py-2 text-right">العملية</th>
              <th className="px-3 py-2 text-right">التفاصيل</th>
              <th className="px-3 py-2 text-right">IP</th>
              <th className="px-3 py-2 text-right">المتصفح</th>
            </tr>
          </thead>
          <tbody>
            {log.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {!log.isLoading && (log.data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  لا توجد سجلات
                </td>
              </tr>
            )}
            {(log.data ?? []).map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelected(r)}
                className={`cursor-pointer border-t border-border align-top hover:bg-muted/40 ${r.id === highlightId ? "bg-primary/10 ring-1 ring-primary/40" : ""}`}
              >
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {new Date(r.created_at).toLocaleString("ar-SA")}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.actor_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.actor_phone || ""}</div>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {r.action}
                  </span>
                  {r.from_status && r.to_status && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.from_status} → {r.to_status}
                    </div>
                  )}
                </td>
                <td className="max-w-md px-3 py-2 text-xs">
                  {r.reason && <div className="mb-1">{r.reason}</div>}
                  {r.metadata && (
                    <pre
                      dir="ltr"
                      className="max-h-24 overflow-auto rounded bg-muted/50 p-1.5 text-[10px] leading-tight"
                    >
                      {JSON.stringify(r.metadata, null, 2)}
                    </pre>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs" dir="ltr">
                  {r.ip_address || "—"}
                </td>
                <td
                  className="max-w-xs truncate px-3 py-2 text-xs"
                  dir="ltr"
                  title={r.user_agent ?? ""}
                >
                  {r.user_agent || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <AuditDetailModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 break-words text-sm ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function AuditDetailModal({ row, onClose }: { row: any; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-border bg-card p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">تفاصيل العملية</h2>
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
              ID: {row.id}
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="الوقت" value={new Date(row.created_at).toLocaleString("ar-SA")} />
          <Field
            label="العملية"
            value={
              <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {row.action}
              </span>
            }
          />
          <Field label="المستخدم" value={row.actor_name} />
          <Field label="جوال المستخدم" value={row.actor_phone} mono />
          <Field label="معرّف المستخدم" value={row.actor} mono />
          <Field label="معرّف الحجز" value={row.appointment_id} mono />
          <Field label="من حالة" value={row.from_status} />
          <Field label="إلى حالة" value={row.to_status} />
          <Field label="الجدول" value={row.table_name} mono />
          <Field label="معرّف السجل" value={row.record_id} mono />
          <Field label="الفرع" value={row.branch_name} />
          <Field label="معرّف الفرع" value={row.branch_id} mono />
          <Field label="عنوان IP" value={row.ip_address} mono />
          <div className="sm:col-span-2">
            <Field label="المتصفح (User Agent)" value={row.user_agent} mono />
          </div>
          <div className="sm:col-span-2">
            <Field label="السبب" value={row.reason} />
          </div>
          <div className="sm:col-span-2 space-y-3">
            <MetadataBlocks metadata={row.metadata} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(row, null, 2));
              toast.success("تم نسخ السجل كاملاً");
            }}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            نسخ السجل كاملاً
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

function copyJson(value: any, label: string) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`تم نسخ ${label}`))
    .catch(() => toast.error("تعذّر النسخ"));
}

function JsonBlock({
  title,
  value,
  tone = "neutral",
  defaultOpen = true,
}: {
  title: string;
  value: any;
  tone?: "before" | "after" | "diff" | "neutral";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneClasses: Record<string, string> = {
    before: "border-destructive/30 bg-destructive/5",
    after: "border-emerald-500/30 bg-emerald-500/5",
    diff: "border-primary/30 bg-primary/5",
    neutral: "border-border bg-muted/40",
  };
  return (
    <div className={`rounded-lg border ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-right text-sm font-semibold"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          <span>{title}</span>
        </button>
        <button
          type="button"
          onClick={() => copyJson(value, title)}
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs hover:bg-muted"
          aria-label={`نسخ ${title}`}
        >
          <Copy className="h-3.5 w-3.5" />
          نسخ
        </button>
      </div>
      {open && (
        <pre
          dir="ltr"
          className="max-h-72 overflow-auto border-t border-border/60 bg-background/50 p-3 text-xs leading-relaxed"
        >
          {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function MetadataBlocks({ metadata }: { metadata: any }) {
  if (!metadata || typeof metadata !== "object") {
    return <div className="text-sm text-muted-foreground">لا توجد بيانات إضافية.</div>;
  }
  const clean = sanitize(metadata) as any;
  const changes = clean.changes && typeof clean.changes === "object" ? clean.changes : null;
  const beforeVal =
    clean.old ??
    (changes
      ? Object.fromEntries(Object.entries<any>(changes).map(([k, v]) => [k, v?.old]))
      : null);
  const afterVal =
    clean.new ??
    (changes
      ? Object.fromEntries(Object.entries<any>(changes).map(([k, v]) => [k, v?.new]))
      : null);

  // Anything not covered by before/after/changes we still show as a raw block.
  const { old: _o, new: _n, changes: _c, ...rest } = clean;
  const hasRest = Object.keys(rest).length > 0;

  return (
    <>
      <div className="text-xs font-medium text-muted-foreground">التفاصيل (Metadata)</div>
      {changes && <JsonBlock title="الحقول المتغيّرة (Diff)" value={changes} tone="diff" />}
      {beforeVal && (
        <JsonBlock title="قبل (Before)" value={beforeVal} tone="before" defaultOpen={!changes} />
      )}
      {afterVal && (
        <JsonBlock title="بعد (After)" value={afterVal} tone="after" defaultOpen={!changes} />
      )}
      {hasRest && <JsonBlock title="بيانات إضافية" value={rest} defaultOpen={false} />}
      {!changes && !beforeVal && !afterVal && !hasRest && (
        <div className="text-sm text-muted-foreground">—</div>
      )}
    </>
  );
}
