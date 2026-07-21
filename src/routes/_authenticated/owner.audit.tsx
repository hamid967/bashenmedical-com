import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listOwnerAudit } from "@/lib/owner/audit.functions";
import { Loader2, RotateCcw, Save, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owner/audit")({
  head: () => ({
    meta: [
      { title: "سجل النشاط | Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuditPage,
});

type Filters = {
  from: string; // yyyy-mm-dd
  to: string;
  actionPrefix: string;
  actionLike: string;
  actorQuery: string;
  limit: number;
};

const STORAGE_KEY = "owner-audit-filters:v1";
const DEFAULT_FILTERS: Filters = {
  from: "",
  to: "",
  actionPrefix: "",
  actionLike: "",
  actorQuery: "",
  limit: 200,
};

const ACTION_PREFIXES = [
  { value: "", label: "كل الأنواع" },
  { value: "owner.", label: "أعمال المالك (owner.*)" },
  { value: "owner.role", label: "أدوار (owner.role_*)" },
  { value: "owner.user", label: "حسابات (owner.user_*)" },
  { value: "owner.password", label: "كلمات مرور" },
  { value: "admin.", label: "أعمال المشرف (admin.*)" },
  { value: "auth.", label: "مصادقة (auth.*)" },
  { value: "content.", label: "محتوى (content.*)" },
];

function loadSaved(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function AuditPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFilters(loadSaved());
    setHydrated(true);
  }, []);

  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  const queryPayload = useMemo(() => {
    const fromIso = filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : null;
    const toIso = filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : null;
    return {
      limit: filters.limit,
      action_prefix: filters.actionPrefix || null,
      action_like: filters.actionLike || null,
      actor_query: filters.actorQuery.trim() || null,
      from: fromIso,
      to: toIso,
    };
  }, [filters]);

  const q = useQuery({
    queryKey: ["owner-audit", queryPayload],
    queryFn: () => listOwnerAudit({ data: queryPayload }),
    enabled: hydrated,
  });

  const saveSettings = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
      toast.success("تم حفظ إعدادات الفلترة");
    } catch {
      toast.error("تعذّر الحفظ");
    }
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  function exportCsv() {
    if (!q.data) return;
    const rows = q.data.rows;
    const header = "created_at,action,actor_id,actor_email,actor_name,record_id,table_name,ip\n";
    const body = rows
      .map((r) => {
        const a = (q.data.actors as any)?.[r.actor ?? ""] ?? {};
        return [
          r.created_at,
          r.action,
          r.actor ?? "",
          a.email ?? "",
          a.full_name ?? "",
          r.record_id ?? "",
          r.table_name ?? "",
          r.ip_address ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",");
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeFilterCount =
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.actionPrefix ? 1 : 0) +
    (filters.actionLike ? 1 : 0) +
    (filters.actorQuery ? 1 : 0);

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="mb-6 flex justify-between items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">سجل النشاط</h1>
          <p className="text-sm text-slate-600 mt-1">
            {q.data ? `${q.data.rows.length} حدث` : "…"}
            {activeFilterCount > 0 && ` · ${activeFilterCount} فلتر نشط`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={saveSettings}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs flex items-center gap-1.5 hover:bg-slate-50"
          >
            <Save className="h-3.5 w-3.5" /> حفظ الإعدادات
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 rounded border border-slate-300 text-xs flex items-center gap-1.5 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> إعادة تعيين
          </button>
          <button
            onClick={exportCsv}
            disabled={!q.data}
            className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> تصدير CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">من تاريخ</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => patch({ from: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => patch({ to: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">نوع الحدث</label>
          <select
            value={filters.actionPrefix}
            onChange={(e) => patch({ actionPrefix: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            {ACTION_PREFIXES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">بحث حر بالحدث</label>
          <input
            value={filters.actionLike}
            onChange={(e) => patch({ actionLike: e.target.value })}
            placeholder="role_grant, password_reset…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-[11px] text-slate-500 block mb-1">المستخدم (اسم/بريد/جوال/معرف)</label>
          <input
            value={filters.actorQuery}
            onChange={(e) => patch({ actorQuery: e.target.value })}
            placeholder="مثال: ahmed@…, +9665…, 3f2a…"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {q.isLoading && <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
        {q.error && <div className="p-4 text-sm text-red-600">{(q.error as Error).message}</div>}
        {q.data && (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-right px-3 py-2">الوقت</th>
                <th className="text-right px-3 py-2">الحدث</th>
                <th className="text-right px-3 py-2">الفاعل</th>
                <th className="text-right px-3 py-2">السجل</th>
                <th className="text-right px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.rows.map((r) => {
                const a = (q.data.actors as any)?.[r.actor ?? ""] ?? {};
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString("ar")}</td>
                    <td className="px-3 py-2 font-mono text-slate-800">{r.action}</td>
                    <td className="px-3 py-2">
                      {r.actor ? (
                        <div>
                          <div className="text-slate-800">{a.full_name || a.email || r.actor.slice(0, 8)}</div>
                          {a.email && a.full_name && (
                            <div className="text-[10px] text-slate-400 font-mono">{a.email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-500">{r.record_id?.slice(0, 8) ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{r.ip_address ?? "—"}</td>
                  </tr>
                );
              })}
              {q.data.rows.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد أحداث مطابقة</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
