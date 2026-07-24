import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, AlertTriangle, Inbox, FileText, Search } from "lucide-react";
import { listAdminReports } from "@/lib/admin/reports.functions";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [
      { title: "قائمة التقارير | لوحة الإدارة" },
      { name: "description", content: "متابعة التقارير الطبية والمخبرية والأشعة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><RefreshCw className="inline h-4 w-4" /> إعادة المحاولة</button>
    </div>
  ),
  notFoundComponent: () => <div className="container-app py-16 text-center text-muted-foreground">غير موجود.</div>,
  component: ReportsPage,
});

function ReportsPage() {
  const listFn = useServerFn(listAdminReports);
  const [kind, setKind] = useState<"medical" | "lab" | "radiology">("medical");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const size = 50;
  const query = useQuery({
    queryKey: ["admin-reports", kind, status, q, page],
    queryFn: () => listFn({ data: { kind, status: status || undefined, q: q || undefined, limit: size, offset: page * size } }),
  });

  return (
    <div className="container-app py-6">
      <header className="flex items-center gap-3 mb-4"><FileText className="h-6 w-6" /><h1 className="text-2xl font-bold">التقارير</h1></header>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["medical", "lab", "radiology"] as const).map((k) => (
          <button key={k} onClick={() => { setKind(k); setPage(0); }} className={`rounded-md px-3 py-1.5 text-sm ${kind === k ? "bg-primary text-primary-foreground" : "border"}`}>
            {k === "medical" ? "طبية" : k === "lab" ? "مخبرية" : "أشعة"}
          </button>
        ))}
        <div className="relative">
          <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="بحث بالعنوان" className="h-9 ps-8 pe-2 rounded-md border bg-background text-sm w-64" />
        </div>
        <input value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} placeholder="الحالة (اختياري)" className="h-9 px-2 rounded-md border bg-background text-sm w-40" />
      </div>

      {query.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />)}</div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{(query.error as Error).message}</div>
      ) : !query.data || query.data.rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground"><Inbox className="mx-auto h-8 w-8 mb-2" /> لا توجد تقارير.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-start p-3">العنوان</th>
                <th className="text-start p-3">النوع</th>
                <th className="text-start p-3">المريض</th>
                <th className="text-start p-3">MRN</th>
                <th className="text-start p-3">التاريخ</th>
                <th className="text-start p-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">{r.title_ar ?? r.title_en ?? r.title ?? "—"}</td>
                  <td className="p-3">{r.report_type ?? r.test_type ?? r.modality ?? "—"}</td>
                  <td className="p-3">{r.patient?.full_name_ar ?? r.patient?.full_name_en ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.patient?.mrn ?? "—"}</td>
                  <td className="p-3">{r.report_date ?? r.published_at?.slice(0, 10) ?? r.created_at?.slice(0, 10) ?? "—"}</td>
                  <td className="p-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status ?? "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t p-2 text-xs text-muted-foreground">
            <span>الإجمالي: {query.data.total}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded border px-2 py-1 disabled:opacity-40">السابق</button>
              <button disabled={(page + 1) * size >= query.data.total} onClick={() => setPage((p) => p + 1)} className="rounded border px-2 py-1 disabled:opacity-40">التالي</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
