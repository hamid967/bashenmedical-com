import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listOwnerPages, deleteOwnerPage } from "@/lib/owner/pages.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owner/pages/")({
  head: () => ({ meta: [{ title: "الصفحات · Site Builder" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: OwnerPagesList,
});

function OwnerPagesList() {
  const router = useRouter();
  const list = useServerFn(listOwnerPages);
  const del = useServerFn(deleteOwnerPage);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["owner", "pages"], queryFn: () => list() });

  async function handleDelete(id: string, title: string) {
    if (!confirm(`حذف الصفحة "${title}" نهائياً؟`)) return;
    setBusy(id);
    try {
      await del({ data: { id } });
      toast.success("تم حذف الصفحة");
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحذف");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 md:p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6" /> إدارة الصفحات
          </h1>
          <p className="text-sm text-slate-500 mt-1">أنشئ صفحات مخصصة (عنّا، الرسالة، إلخ) وانشرها للجمهور.</p>
        </div>
        <Button asChild>
          <Link to="/owner/pages/$id" params={{ id: "new" }}><Plus className="h-4 w-4 ml-1" /> صفحة جديدة</Link>
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-center text-slate-500">جاري التحميل…</div>
        ) : q.error ? (
          <div className="p-8 text-center text-red-600">{(q.error as Error).message}</div>
        ) : !q.data?.length ? (
          <div className="p-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <div className="text-slate-700 font-medium">لا توجد صفحات بعد</div>
            <div className="text-sm text-slate-500 mt-1">ابدأ بإنشاء أول صفحة.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-right">العنوان</th>
                <th className="px-4 py-3 text-right">Slug</th>
                <th className="px-4 py-3 text-right">الحالة</th>
                <th className="px-4 py-3 text-right">في القائمة</th>
                <th className="px-4 py-3 text-right">آخر تحديث</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((p: any) => (
                <tr key={p.id} className="border-t hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.title_ar}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">/p/{p.slug}</td>
                  <td className="px-4 py-3">
                    {p.status === "published" ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">منشورة</Badge>
                    ) : (
                      <Badge variant="secondary">مسودة</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.show_in_nav ? "نعم" : "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{new Date(p.updated_at).toLocaleString("ar-SA")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {p.status === "published" && (
                        <Button asChild size="icon" variant="ghost" title="عرض">
                          <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                        </Button>
                      )}
                      <Button asChild size="icon" variant="ghost" title="تعديل">
                        <Link to="/owner/pages/$id" params={{ id: p.id }}><Pencil className="h-4 w-4" /></Link>
                      </Button>
                      <Button
                        size="icon" variant="ghost" title="حذف"
                        disabled={busy === p.id}
                        onClick={() => handleDelete(p.id, p.title_ar)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
