import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCmsAudit } from "@/lib/admin/cms/cms.functions";
import { Card } from "@/components/ui-v3";

export const Route = createFileRoute("/_authenticated/admin/cms/audit")({
  head: () => ({ meta: [{ title: "سجل تدقيق CMS" }] }),
  component: AuditPage,
});

function AuditPage() {
  const fetchFn = useServerFn(listCmsAudit);
  const { data } = useSuspenseQuery({
    queryKey: ["cms", "audit", "all"],
    queryFn: () => fetchFn({ data: { limit: 300 } }),
    staleTime: 15_000,
  });
  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex items-center gap-3">
        <Link to="/admin/cms" className="text-sm underline">← اللوحة</Link>
        <h1 className="text-xl font-bold">سجل التدقيق</h1>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-start p-2">الوقت</th>
              <th className="text-start p-2">الإجراء</th>
              <th className="text-start p-2">Entry</th>
              <th className="text-start p-2">Actor</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td className="p-4 text-muted-foreground" colSpan={4}>لا يوجد سجل بعد.</td></tr>
            )}
            {data.map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-2 text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("ar")}
                </td>
                <td className="p-2 font-mono text-xs">{a.action}</td>
                <td className="p-2 font-mono text-[11px] text-muted-foreground">
                  {a.entry_id?.slice(0, 8) ?? "—"}
                </td>
                <td className="p-2 font-mono text-[11px] text-muted-foreground">
                  {a.actor_id?.slice(0, 8) ?? "system"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
