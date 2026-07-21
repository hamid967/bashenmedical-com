import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  listOwnerServices,
  deleteOwnerService,
  toggleOwnerService,
} from "@/lib/owner/services.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Stethoscope } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owner/services/")({
  head: () => ({ meta: [{ title: "الخدمات · Site Builder" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: OwnerServicesList,
});

function OwnerServicesList() {
  const router = useRouter();
  const list = useServerFn(listOwnerServices);
  const del = useServerFn(deleteOwnerService);
  const toggle = useServerFn(toggleOwnerService);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["owner", "services"], queryFn: () => list() });

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف الخدمة "${name}" نهائياً؟`)) return;
    setBusy(id);
    try {
      await del({ data: { id } });
      toast.success("تم الحذف");
      q.refetch();
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الحذف");
    } finally { setBusy(null); }
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
            <Stethoscope className="h-6 w-6" /> إدارة الخدمات
          </h1>
          <p className="text-sm text-slate-500 mt-1">أضف الخدمات الطبية، الأسعار، والصور — تظهر مباشرة في الموقع.</p>
        </div>
        <Button asChild>
          <Link to="/owner/services/$id" params={{ id: "new" }}><Plus className="h-4 w-4 ml-1" /> خدمة جديدة</Link>
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {q.isLoading ? (
          <div className="p-8 text-center text-slate-500">جاري التحميل…</div>
        ) : q.error ? (
          <div className="p-8 text-center text-red-600">{(q.error as Error).message}</div>
        ) : !q.data?.length ? (
          <div className="p-12 text-center">
            <Stethoscope className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <div className="text-slate-700 font-medium">لا توجد خدمات</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-right">الترتيب</th>
                <th className="px-4 py-3 text-right">الاسم</th>
                <th className="px-4 py-3 text-right">Slug</th>
                <th className="px-4 py-3 text-right">السعر من</th>
                <th className="px-4 py-3 text-right">المدة</th>
                <th className="px-4 py-3 text-right">مفعّلة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s: any) => (
                <tr key={s.id} className="border-t hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-500">{s.display_order}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.name_ar}</div>
                    <div className="text-xs text-slate-500">{s.name_en}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{s.slug}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {s.price_from != null ? (
                      <span>{Number(s.price_from).toLocaleString("ar-SA")} <Badge variant="outline" className="text-[10px]">ر.س</Badge></span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.duration_min ? `${s.duration_min} د` : "—"}</td>
                  <td className="px-4 py-3">
                    <Switch checked={s.is_active} onCheckedChange={(v) => handleToggle(s.id, v)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button asChild size="icon" variant="ghost" title="تعديل">
                        <Link to="/owner/services/$id" params={{ id: s.id }}><Pencil className="h-4 w-4" /></Link>
                      </Button>
                      <Button size="icon" variant="ghost" title="حذف"
                        disabled={busy === s.id}
                        onClick={() => handleDelete(s.id, s.name_ar)}>
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
