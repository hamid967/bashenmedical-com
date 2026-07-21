import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listOwnerAudit } from "@/lib/owner/audit.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/owner/audit")({
  head: () => ({
    meta: [
      { title: "سجل النشاط | Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [actionLike, setActionLike] = useState("");
  const q = useQuery({
    queryKey: ["owner-audit", actionLike],
    queryFn: () => listOwnerAudit({ data: { limit: 200, action_like: actionLike || null } }),
  });

  function exportCsv() {
    if (!q.data) return;
    const rows = q.data.rows;
    const header = "created_at,action,actor,record_id,table_name,ip\n";
    const body = rows
      .map((r) =>
        [
          r.created_at,
          r.action,
          r.actor ?? "",
          r.record_id ?? "",
          r.table_name ?? "",
          r.ip_address ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">سجل النشاط</h1>
          <p className="text-sm text-slate-600 mt-1">آخر 200 حدث أمني/إداري.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!q.data}
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs disabled:opacity-40"
        >
          تصدير CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
        <input
          value={actionLike}
          onChange={(e) => setActionLike(e.target.value)}
          placeholder="فلترة بنوع الحدث (مثل owner.role)…"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
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
              {q.data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString("ar")}</td>
                  <td className="px-3 py-2 font-mono text-slate-800">{r.action}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">{r.actor?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">{r.record_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-slate-400">{r.ip_address ?? "—"}</td>
                </tr>
              ))}
              {q.data.rows.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">لا توجد أحداث</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
