import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  listOwnerExcellence,
  deleteOwnerExcellence,
  toggleOwnerExcellence,
} from "@/lib/owner/excellence.functions";
import { Button } from "@/components/ui-v3";
import { Switch } from "@/components/ui-v3";
import { Plus, Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owner/excellence/")({
  head: () => ({
    meta: [
      { title: "مراكز التميز · Site Builder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OwnerExcellenceList,
});

function OwnerExcellenceList() {
  const router = useRouter();
  const list = useServerFn(listOwnerExcellence);
  const del = useServerFn(deleteOwnerExcellence);
  const toggle = useServerFn(toggleOwnerExcellence);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["owner", "excellence"], queryFn: () => list() });

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف مركز التميز "${name}" نهائياً؟`)) return;
    setBusy(id);
    try {
      await del({ data: { id } });
      toast.success("تم الحذف");
      q.refetch();
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحذف");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(id: string, v: boolean) {
    try {
      await toggle({ data: { id, is_active: v } });
      q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التحديث");
    }
  }

  return (
    <div className="p-6 md:p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-6 w-6" /> مراكز التميز
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            تظهر في شريط الصفحة الرئيسية وصفحات /excellence.
          </p>
        </div>
        <Button asChild>
          <Link to="/owner/excellence/$id" params={{ id: "new" }}>
            <Plus className="h-4 w-4 ml-1" /> مركز جديد
          </Link>
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-center text-slate-500">جاري التحميل…</div>
        ) : q.error ? (
          <div className="p-8 text-center text-red-600">{(q.error as Error).message}</div>
        ) : !q.data?.length ? (
          <div className="p-12 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <div className="text-slate-700 font-medium">لا توجد مراكز تميز</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-right">الترتيب</th>
                <th className="px-4 py-3 text-right">الاسم</th>
                <th className="px-4 py-3 text-right">Slug</th>
                <th className="px-4 py-3 text-right">مفعّل</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s: any) => (
                <tr key={s.id} className="border-t hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-500">{s.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.name_ar}</div>
                    <div className="text-xs text-slate-500">{s.name_en}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.slug}</td>
                  <td className="px-4 py-3">
                    <Switch checked={s.is_active} onCheckedChange={(v) => handleToggle(s.id, v)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button asChild size="icon" variant="ghost" title="تعديل" aria-label="تعديل">
                        <Link to="/owner/excellence/$id" params={{ id: s.id }}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="حذف"
                        aria-label="حذف"
                        disabled={busy === s.id}
                        onClick={() => handleDelete(s.id, s.name_ar)}
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
