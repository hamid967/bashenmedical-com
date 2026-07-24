import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCmsReviewQueue } from "@/lib/admin/cms/cms.functions";
import { CMS_KINDS } from "@/lib/admin/cms/schemas";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/cms/review")({
  head: () => ({ meta: [{ title: "طابور مراجعة المحتوى" }] }),
  component: ReviewQueue,
});

function ReviewQueue() {
  const fetchFn = useServerFn(listCmsReviewQueue);
  const { data } = useSuspenseQuery({
    queryKey: ["cms", "review-queue"],
    queryFn: () => fetchFn(),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex items-center gap-3">
        <Link to="/admin/cms" className="text-sm underline">← اللوحة</Link>
        <h1 className="text-xl font-bold">طابور المراجعة</h1>
        <Badge variant="secondary">{data.length}</Badge>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-start p-2">النوع</th>
              <th className="text-start p-2">العنوان</th>
              <th className="text-start p-2">اكتمال AR</th>
              <th className="text-start p-2">آخر تحديث</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td className="p-4 text-muted-foreground" colSpan={4}>لا توجد عناصر بانتظار المراجعة.</td></tr>
            )}
            {data.map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-accent/30">
                <td className="p-2 text-xs">{(CMS_KINDS as any)[r.kind]?.label ?? r.kind}</td>
                <td className="p-2">
                  <Link to="/admin/cms/$kind/$id" params={{ kind: r.kind, id: r.id }} className="hover:underline">
                    {r.title ?? "(بدون عنوان)"}
                  </Link>
                </td>
                <td className="p-2 text-xs">{r.locale_completeness?.ar ?? 0}%</td>
                <td className="p-2 text-xs text-muted-foreground">
                  {new Date(r.updated_at).toLocaleString("ar")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
