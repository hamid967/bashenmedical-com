import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, AlertTriangle, Inbox, CalendarCheck, Search } from "lucide-react";
import { listAdminAppointments } from "@/lib/admin/appointments.functions";
import { useActiveBranch } from "@/lib/active-branch";

export const Route = createFileRoute("/_authenticated/admin/appointments")({
  head: () => ({
    meta: [
      { title: "المواعيد | لوحة الإدارة" },
      { name: "description", content: "إدارة مواعيد المرضى عبر الفروع مع البحث والتصفية." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="container-app py-16 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
      <h2 className="mt-4 text-lg font-semibold">تعذّر تحميل المواعيد</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="container-app py-16 text-center text-muted-foreground">غير موجود.</div>,
  component: AppointmentsPage,
});

const STATUSES = ["", "new", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show"];

function AppointmentsPage() {
  const listFn = useServerFn(listAdminAppointments);
  const { branchId } = useActiveBranch();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const size = 50;
  const query = useQuery({
    queryKey: ["admin-appointments", branchId, status, q, page],
    queryFn: () => listFn({ data: { branch_id: branchId || undefined, status: status || undefined, q: q || undefined, limit: size, offset: page * size } }),
  });

  return (
    <div className="container-app py-6">
      <header className="flex items-center gap-3 mb-4">
        <CalendarCheck className="h-6 w-6" />
        <h1 className="text-2xl font-bold">المواعيد</h1>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="بحث بالاسم/الجوال/الرقم المرجعي"
            className="h-9 ps-8 pe-2 rounded-md border bg-background text-sm w-72"
          />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="h-9 px-2 rounded-md border bg-background text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{s || "كل الحالات"}</option>)}
        </select>
      </div>

      {query.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />)}</div>
      ) : query.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{(query.error as Error).message}</div>
      ) : !query.data || query.data.rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground"><Inbox className="mx-auto h-8 w-8 mb-2" /> لا توجد مواعيد.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-start p-3">المرجع</th>
                <th className="text-start p-3">المريض</th>
                <th className="text-start p-3">الجوال</th>
                <th className="text-start p-3">التاريخ</th>
                <th className="text-start p-3">الوقت</th>
                <th className="text-start p-3">الطبيب</th>
                <th className="text-start p-3">الفرع</th>
                <th className="text-start p-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {query.data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs"><Link to="/admin/appointments/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.reference_number ?? r.id.slice(0, 8)}</Link></td>
                  <td className="p-3">{r.patient_name ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.patient_phone ?? "—"}</td>
                  <td className="p-3">{r.appointment_date ?? "—"}</td>
                  <td className="p-3">{r.appointment_time ?? "—"}</td>
                  <td className="p-3">{r.doctor?.name_ar ?? r.doctor?.name_en ?? "—"}</td>
                  <td className="p-3">{r.branch?.name_ar ?? r.branch?.name_en ?? "—"}</td>
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
