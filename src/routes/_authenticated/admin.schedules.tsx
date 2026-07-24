import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw, AlertTriangle, Inbox, ClipboardList } from "lucide-react";
import { listAdminAvailabilitySlots, listAdminDoctorLeaves } from "@/lib/admin/schedules.functions";
import { useActiveBranch } from "@/lib/active-branch";

export const Route = createFileRoute("/_authenticated/admin/schedules")({
  head: () => ({
    meta: [
      { title: "الجداول والإجازات | لوحة الإدارة" },
      { name: "description", content: "استعراض توفر الأطباء وإجازاتهم عبر الفروع." },
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
  component: SchedulesPage,
});

function SchedulesPage() {
  const [tab, setTab] = useState<"slots" | "leaves">("slots");
  const slotsFn = useServerFn(listAdminAvailabilitySlots);
  const leavesFn = useServerFn(listAdminDoctorLeaves);
  const { branchId } = useActiveBranch();
  const slots = useQuery({
    queryKey: ["admin-slots", branchId],
    queryFn: () => slotsFn({ data: { branch_id: branchId || undefined, limit: 100, offset: 0 } }),
    enabled: tab === "slots",
  });
  const leaves = useQuery({
    queryKey: ["admin-leaves", branchId],
    queryFn: () => leavesFn({ data: { branch_id: branchId || undefined, limit: 100, offset: 0 } }),
    enabled: tab === "leaves",
  });
  const q: any = tab === "slots" ? slots : leaves;

  return (
    <div className="container-app py-6">
      <header className="flex items-center gap-3 mb-4"><ClipboardList className="h-6 w-6" /><h1 className="text-2xl font-bold">الجداول والإجازات</h1></header>
      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab("slots")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "slots" ? "bg-primary text-primary-foreground" : "border"}`}>الأوقات المتاحة</button>
        <button onClick={() => setTab("leaves")} className={`rounded-md px-3 py-1.5 text-sm ${tab === "leaves" ? "bg-primary text-primary-foreground" : "border"}`}>الإجازات</button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />)}</div>
      ) : q.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{(q.error as Error).message}</div>
      ) : !q.data || q.data.rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground"><Inbox className="mx-auto h-8 w-8 mb-2" /> لا توجد بيانات.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              {tab === "slots" ? (
                <tr>
                  <th className="text-start p-3">التاريخ</th>
                  <th className="text-start p-3">من</th>
                  <th className="text-start p-3">إلى</th>
                  <th className="text-start p-3">الطبيب</th>
                  <th className="text-start p-3">الفرع</th>
                  <th className="text-start p-3">الحالة</th>
                </tr>
              ) : (
                <tr>
                  <th className="text-start p-3">من تاريخ</th>
                  <th className="text-start p-3">إلى تاريخ</th>
                  <th className="text-start p-3">يوم كامل</th>
                  <th className="text-start p-3">الطبيب</th>
                  <th className="text-start p-3">الفرع</th>
                  <th className="text-start p-3">السبب</th>
                </tr>
              )}
            </thead>
            <tbody>
              {q.data.rows.map((r: any) =>
                tab === "slots" ? (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">{r.slot_date}</td>
                    <td className="p-3">{r.start_time}</td>
                    <td className="p-3">{r.end_time}</td>
                    <td className="p-3">{r.doctor?.name_ar ?? r.doctor?.name_en ?? "—"}</td>
                    <td className="p-3">{r.branch?.name_ar ?? r.branch?.name_en ?? "—"}</td>
                    <td className="p-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status ?? "—"}</span></td>
                  </tr>
                ) : (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">{r.start_date}</td>
                    <td className="p-3">{r.end_date}</td>
                    <td className="p-3">{r.all_day ? "نعم" : "لا"}</td>
                    <td className="p-3">{r.doctor?.name_ar ?? r.doctor?.name_en ?? "—"}</td>
                    <td className="p-3">{r.branch?.name_ar ?? r.branch?.name_en ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <div className="border-t p-2 text-xs text-muted-foreground">الإجمالي: {q.data.total}</div>
        </div>
      )}
    </div>
  );
}
