import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  listOwnerSpecialties,
  deleteOwnerSpecialty,
  toggleOwnerSpecialty,
  reorderOwnerSpecialties,
} from "@/lib/owner/specialties.functions";
import { Button } from "@/components/ui-v3";
import { Switch } from "@/components/ui-v3";
import { Plus, Pencil, Trash2, Layers, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/owner/specialties/")({
  head: () => ({
    meta: [{ title: "التخصصات · Site Builder" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: OwnerSpecialtiesList,
});

function OwnerSpecialtiesList() {
  const router = useRouter();
  const list = useServerFn(listOwnerSpecialties);
  const del = useServerFn(deleteOwnerSpecialty);
  const toggle = useServerFn(toggleOwnerSpecialty);
  const reorder = useServerFn(reorderOwnerSpecialties);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["owner", "specialties"], queryFn: () => list() });

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف التخصص "${name}" نهائياً؟`)) return;
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

  async function move(id: string, dir: -1 | 1) {
    const rows = [...(q.data ?? [])];
    const idx = rows.findIndex((r: any) => r.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= rows.length) return;
    const tmp = rows[idx];
    rows[idx] = rows[j];
    rows[j] = tmp;
    const order = rows.map((r: any, i: number) => ({ id: r.id, sort_order: (i + 1) * 10 }));
    try {
      await reorder({ data: { order } });
      q.refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر إعادة الترتيب");
    }
  }

  return (
    <div className="p-6 md:p-8" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="h-6 w-6" /> إدارة التخصصات
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            تظهر في صفحة التخصصات، الحجز، ودليل الأطباء.
          </p>
        </div>
        <Button asChild>
          <Link to="/owner/specialties/$id" params={{ id: "new" }}>
            <Plus className="h-4 w-4 ml-1" /> تخصص جديد
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
            <Layers className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <div className="text-slate-700 font-medium">لا توجد تخصصات</div>
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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-slate-100"
                        onClick={() => move(s.id, -1)}
                        aria-label="أعلى"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-slate-100"
                        onClick={() => move(s.id, 1)}
                        aria-label="أسفل"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <span className="text-slate-500 ms-1">{s.sort_order}</span>
                    </div>
                  </td>
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
                        <Link to="/owner/specialties/$id" params={{ id: s.id }}>
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
