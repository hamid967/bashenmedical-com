import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, AlertTriangle, Inbox, Users, Search } from "lucide-react";
import { listAdminPatients } from "@/lib/admin/patients.functions";
import { useActiveBranch } from "@/lib/active-branch";

export const Route = createFileRoute("/_authenticated/admin/patients")({
  head: () => ({
    meta: [
      { title: "المرضى | لوحة الإدارة" },
      { name: "description", content: "بحث وإدارة سجلات المرضى عبر الفروع." },
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
  component: PatientsPage,
});

function PatientsPage() {
  const listFn = useServerFn(listAdminPatients);
  const { branchId } = useActiveBranch();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const size = 50;
  const query = useQuery({
    queryKey: ["admin-patients", branchId, q, page],
    queryFn: () => listFn({ data: { branch_id: branchId || undefined, q: q || undefined, limit: size, offset: page * size } }),
  });

  return (
    <div className="container-app py-6">
      <header className="flex items-center gap-3 mb-4"><Users className="h-6 w-6" /><h1 className="text-2xl font-bold">المرضى</h1></header>
      <div className="mb-4 relative w-full max-w-md">
        <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="بحث بالاسم/MRN/الجوال" className="h-9 w-full ps-8 pe-2 rounded-md border bg-background text-sm" />
      </div>

      {query.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />)}</div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{(query.error as Error).message}</div>
      ) : !query.data || query.data.rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground"><Inbox className="mx-auto h-8 w-8 mb-2" /> لا يوجد مرضى.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-start p-3">MRN</th>
                <th className="text-start p-3">الاسم</th>
                <th className="text-start p-3">الجوال</th>
                <th className="text-start p-3">الجنس</th>
                <th className="text-start p-3">المدينة</th>
                <th className="text-start p-3">الفرع</th>
                <th className="text-start p-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs"><Link to="/admin/patients/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.mrn ?? r.id.slice(0, 8)}</Link></td>
                  <td className="p-3">{r.full_name_ar ?? r.full_name_en ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.phone ?? "—"}</td>
                  <td className="p-3">{r.gender ?? "—"}</td>
                  <td className="p-3">{r.city ?? "—"}</td>
                  <td className="p-3">{r.branch?.name_ar ?? r.branch?.name_en ?? "—"}</td>
                  <td className="p-3">{r.is_active ? "نشط" : "غير نشط"}</td>
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
