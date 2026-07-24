import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listCmsEntries, createCmsEntry } from "@/lib/admin/cms/cms.functions";
import { CMS_KINDS, type CmsKind } from "@/lib/admin/cms/schemas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/cms/$kind")({
  head: ({ params }) => ({
    meta: [
      { title: `CMS — ${(CMS_KINDS as any)[params.kind]?.label ?? params.kind}` },
      { name: "description", content: "إدارة عناصر المحتوى" },
    ],
  }),
  component: CmsListPage,
});

function CmsListPage() {
  const { kind } = Route.useParams() as { kind: CmsKind };
  const def = CMS_KINDS[kind];
  const list = useServerFn(listCmsEntries);
  const create = useServerFn(createCmsEntry);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [title, setTitle] = useState("");

  const { data } = useSuspenseQuery({
    queryKey: ["cms", "list", kind, status, q],
    queryFn: () =>
      list({ data: { kind, status: (status || undefined) as any, q: q || undefined } }),
    staleTime: 15_000,
  });

  const createOne = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("أدخل عنوانًا");
      return create({ data: { kind, title: title.trim() } });
    },
    onSuccess: (r) => {
      toast.success("تم إنشاء المسودة");
      setTitle("");
      qc.invalidateQueries({ queryKey: ["cms"] });
      navigate({ to: "/admin/cms/$kind/$id", params: { kind, id: r.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الإنشاء"),
  });

  if (!def) return <div className="p-6">نوع محتوى غير معروف</div>;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex items-center gap-3">
        <Link to="/admin/cms" className="text-sm underline">← اللوحة</Link>
        <h1 className="text-xl font-bold">{def.label}</h1>
        {def.singleton && <Badge variant="secondary">مفرد</Badge>}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground mb-1">الحالة</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border rounded px-2 py-1 bg-background text-sm"
            >
              <option value="">كل الحالات</option>
              <option value="draft">مسودة</option>
              <option value="in_review">تحت المراجعة</option>
              <option value="approved">معتمدة</option>
              <option value="scheduled">مجدولة</option>
              <option value="published">منشورة</option>
              <option value="archived">مؤرشفة</option>
            </select>
          </label>
          <label className="text-sm flex-1 min-w-[180px]">
            <span className="block text-xs text-muted-foreground mb-1">بحث بالعنوان</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="border rounded px-2 py-1 bg-background text-sm w-full"
              placeholder="…"
            />
          </label>
          <div className="flex-1" />
          <label className="text-sm">
            <span className="block text-xs text-muted-foreground mb-1">إنشاء جديد</span>
            <div className="flex gap-1">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="العنوان"
                className="border rounded px-2 py-1 bg-background text-sm"
              />
              <Button size="sm" onClick={() => createOne.mutate()} disabled={createOne.isPending}>
                إنشاء
              </Button>
            </div>
          </label>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-start p-2">العنوان</th>
              <th className="text-start p-2">الحالة</th>
              <th className="text-start p-2">AR</th>
              <th className="text-start p-2">EN</th>
              <th className="text-start p-2">آخر تحديث</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 && (
              <tr><td className="p-3 text-muted-foreground" colSpan={5}>لا توجد عناصر.</td></tr>
            )}
            {(data ?? []).map((r: any) => (
              <tr key={r.id} className="border-t hover:bg-accent/30">
                <td className="p-2">
                  <Link to="/admin/cms/$kind/$id" params={{ kind, id: r.id }} className="hover:underline">
                    {r.title ?? "(بدون عنوان)"}
                  </Link>
                </td>
                <td className="p-2"><Badge variant="outline">{r.status}</Badge></td>
                <td className="p-2">
                  <CompletenessPill pct={r.locale_completeness?.ar ?? 0} />
                </td>
                <td className="p-2">
                  <CompletenessPill pct={r.locale_completeness?.en ?? 0} />
                </td>
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

function CompletenessPill({ pct }: { pct: number }) {
  const color =
    pct >= 100 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : pct > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    : "bg-red-500/15 text-red-700 dark:text-red-300";
  return <span className={`inline-block text-[11px] rounded px-2 py-0.5 ${color}`}>{pct}%</span>;
}
