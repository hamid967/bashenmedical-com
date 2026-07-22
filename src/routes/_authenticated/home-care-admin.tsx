import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, HomeIcon } from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import { listHomeCareRequests, updateHomeCareRequest } from "@/lib/home-care.functions";

export const Route = createFileRoute("/_authenticated/home-care-admin")({
  head: () => ({
    meta: [
      { title: "طلبات الرعاية المنزلية — لوحة الإدارة" },
      { name: "description", content: "متابعة وتحديث طلبات الرعاية المنزلية." },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="patients.view">
      <HomeCareAdminPage />
    </RequirePermission>
  ),
});

const STATUS_AR: Record<string, string> = {
  new: "جديد",
  reviewed: "تمت المراجعة",
  contacted: "تم التواصل",
  waiting_patient: "بانتظار المريض",
  scheduled: "تم الجدولة",
  completed: "مكتمل",
  cancelled: "ملغي",
};
const STATUSES = [
  "new",
  "reviewed",
  "contacted",
  "waiting_patient",
  "scheduled",
  "completed",
  "cancelled",
] as const;

function HomeCareAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listHomeCareRequests);
  const updateFn = useServerFn(updateHomeCareRequest);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const listQuery = useQuery({
    queryKey: ["admin", "home-care", statusFilter, search],
    queryFn: () =>
      listFn({ data: { status: statusFilter || undefined, search: search || undefined } }),
  });

  const mutation = useMutation({
    mutationFn: (v: { id: string; status?: string; notes?: string }) =>
      updateFn({ data: v as any }),
    onSuccess: () => {
      toast.success("تم التحديث");
      qc.invalidateQueries({ queryKey: ["admin", "home-care"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل التحديث"),
  });

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  return (
    <div className="container max-w-6xl py-6 space-y-6" dir="rtl">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <HomeIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">طلبات الرعاية المنزلية</h1>
            <p className="text-sm text-muted-foreground">مراجعة وتحديث الطلبات الواردة.</p>
          </div>
        </div>
        <button
          onClick={() => listQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </header>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم / الجوال / الخدمة"
            className="w-full rounded-md border border-input bg-background pr-10 pl-3 py-2 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">كل الحالات</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_AR[s]}
            </option>
          ))}
        </select>
      </div>

      {listQuery.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          لا توجد طلبات مطابقة.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right">
              <tr>
                <th className="p-3">المريض</th>
                <th className="p-3">الجوال</th>
                <th className="p-3">الخدمة</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="p-3 font-medium">{r.patient_name || "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.patient_phone || "—"}</td>
                  <td className="p-3">
                    {r.service || "—"}
                    {r.address && (
                      <div className="text-xs text-muted-foreground mt-1">{r.address}</div>
                    )}
                    {r.notes && (
                      <div className="text-xs text-muted-foreground mt-1">📝 {r.notes}</div>
                    )}
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    {r.preferred_date || "—"}
                    {r.preferred_time && <div>{r.preferred_time}</div>}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs">
                      {STATUS_AR[r.status] ?? r.status ?? "جديد"}
                    </span>
                  </td>
                  <td className="p-3">
                    <select
                      value={r.status ?? "new"}
                      disabled={mutation.isPending}
                      onChange={(e) => mutation.mutate({ id: r.id, status: e.target.value })}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_AR[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
