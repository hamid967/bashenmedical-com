import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Save, ArrowUp, ArrowDown, Power, PowerOff } from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import {
  listServiceCatalog,
  upsertServiceCatalog,
  toggleServiceActive,
  reorderServiceCatalog,
} from "@/lib/service-catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/service-catalog")({
  head: () => ({
    meta: [
      { title: "كتالوج الخدمات — لوحة الإدارة" },
      { name: "description", content: "إدارة خدمات نموذج الاستفسار: التفعيل والترتيب والإضافة." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="settings.manage">
      <ServiceCatalogAdmin />
    </RequirePermission>
  ),
});

type Row = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  display_order: number;
  is_active: boolean;
};

function ServiceCatalogAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listServiceCatalog);
  const upsertFn = useServerFn(upsertServiceCatalog);
  const toggleFn = useServerFn(toggleServiceActive);
  const reorderFn = useServerFn(reorderServiceCatalog);

  const listQuery = useQuery({
    queryKey: ["admin", "service-catalog"],
    queryFn: () => listFn(),
    staleTime: 10_000,
  });

  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (listQuery.data) {
      setRows(
        (listQuery.data as Row[]).map((r) => ({
          id: r.id,
          slug: r.slug,
          name_ar: r.name_ar,
          name_en: r.name_en,
          display_order: r.display_order,
          is_active: r.is_active,
        })),
      );
    }
  }, [listQuery.data]);

  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState({
    slug: "",
    name_ar: "",
    name_en: "",
    display_order: 100,
    is_active: true,
  });

  const dirty = useMemo(() => {
    const orig = (listQuery.data ?? []) as Row[];
    if (orig.length !== rows.length) return false; // reorder only handles existing
    return rows.some((r, i) => {
      const o = orig.find((x) => x.id === r.id);
      return !o || o.display_order !== r.display_order;
    });
  }, [rows, listQuery.data]);

  const upsertMut = useMutation({
    mutationFn: (v: any) => upsertFn({ data: v }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      setShowAdd(false);
      setNewRow({ slug: "", name_ar: "", name_en: "", display_order: 100, is_active: true });
      qc.invalidateQueries({ queryKey: ["admin", "service-catalog"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الحفظ"),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "service-catalog"] }),
    onError: (e: any) => toast.error(e?.message ?? "تعذّر تغيير الحالة"),
  });

  const reorderMut = useMutation({
    mutationFn: () =>
      reorderFn({
        data: { items: rows.map((r, i) => ({ id: r.id, display_order: (i + 1) * 10 })) },
      }),
    onSuccess: () => {
      toast.success("تم حفظ الترتيب");
      qc.invalidateQueries({ queryKey: ["admin", "service-catalog"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر حفظ الترتيب"),
  });

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  }

  function updateInline(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="admin-console p-4 lg:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">كتالوج الخدمات</h1>
          <p className="text-sm text-[color:var(--ac-muted)]">
            يظهر في نموذج استفسار الواتساب وصفحات الخدمات — رتّبها بالسحب أو بالأسهم، وفعّل أو أوقف
            أي خدمة.
          </p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button
              onClick={() => reorderMut.mutate()}
              disabled={reorderMut.isPending}
              className="inline-flex items-center gap-2 px-3 h-10 rounded-lg bg-[color:var(--ac-accent)] text-white text-sm"
            >
              {reorderMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ الترتيب
            </button>
          )}
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-2 px-3 h-10 rounded-lg border border-[color:var(--ac-line)] text-sm"
          >
            <Plus className="h-4 w-4" />
            إضافة خدمة
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-[color:var(--ac-line)] bg-[color:var(--ac-surface)] p-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block mb-1 font-medium">المعرّف (slug)</span>
            <input
              className="w-full h-10 px-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent"
              value={newRow.slug}
              onChange={(e) => setNewRow({ ...newRow, slug: e.target.value.trim() })}
              placeholder="مثال: home_visit"
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 font-medium">ترتيب العرض</span>
            <input
              type="number"
              className="w-full h-10 px-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent"
              value={newRow.display_order}
              onChange={(e) => setNewRow({ ...newRow, display_order: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 font-medium">الاسم (عربي)</span>
            <input
              className="w-full h-10 px-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent"
              value={newRow.name_ar}
              onChange={(e) => setNewRow({ ...newRow, name_ar: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="block mb-1 font-medium">Name (English)</span>
            <input
              className="w-full h-10 px-3 rounded-lg border border-[color:var(--ac-line)] bg-transparent"
              value={newRow.name_en}
              onChange={(e) => setNewRow({ ...newRow, name_en: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2 flex items-center justify-between gap-3">
            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={newRow.is_active}
                onChange={(e) => setNewRow({ ...newRow, is_active: e.target.checked })}
              />
              مفعّلة
            </label>
            <button
              onClick={() => upsertMut.mutate(newRow)}
              disabled={upsertMut.isPending || !newRow.slug || !newRow.name_ar || !newRow.name_en}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-[color:var(--ac-accent)] text-white text-sm disabled:opacity-50"
            >
              {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-[color:var(--ac-line)] bg-[color:var(--ac-surface)] overflow-hidden">
        {listQuery.isLoading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ac-muted)]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[color:var(--ac-muted)]">لا توجد خدمات.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--ac-subtle)] text-[color:var(--ac-ink-3)]">
              <tr className="text-right">
                <th className="px-3 py-2 w-20">الترتيب</th>
                <th className="px-3 py-2">المعرّف</th>
                <th className="px-3 py-2">الاسم (AR)</th>
                <th className="px-3 py-2">Name (EN)</th>
                <th className="px-3 py-2 w-24">الحالة</th>
                <th className="px-3 py-2 w-40">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-[color:var(--ac-line)]">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="p-1 rounded hover:bg-[color:var(--ac-subtle)] disabled:opacity-30"
                        aria-label="أعلى"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === rows.length - 1}
                        className="p-1 rounded hover:bg-[color:var(--ac-subtle)] disabled:opacity-30"
                        aria-label="أسفل"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[color:var(--ac-muted)]">{r.slug}</td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full h-9 px-2 rounded border border-transparent hover:border-[color:var(--ac-line)] focus:border-[color:var(--ac-accent)] bg-transparent"
                      value={r.name_ar}
                      onChange={(e) => updateInline(r.id, { name_ar: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full h-9 px-2 rounded border border-transparent hover:border-[color:var(--ac-line)] focus:border-[color:var(--ac-accent)] bg-transparent"
                      value={r.name_en}
                      onChange={(e) => updateInline(r.id, { name_en: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.is_active
                          ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-700 border border-green-500/30"
                          : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border border-border"
                      }
                    >
                      {r.is_active ? "مفعّلة" : "موقوفة"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          upsertMut.mutate({
                            id: r.id,
                            slug: r.slug,
                            name_ar: r.name_ar,
                            name_en: r.name_en,
                            display_order: r.display_order,
                            is_active: r.is_active,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2 h-8 rounded border border-[color:var(--ac-line)] text-xs"
                      >
                        <Save className="h-3.5 w-3.5" /> حفظ
                      </button>
                      <button
                        onClick={() => toggleMut.mutate({ id: r.id, is_active: !r.is_active })}
                        className="inline-flex items-center gap-1 px-2 h-8 rounded border border-[color:var(--ac-line)] text-xs"
                      >
                        {r.is_active ? (
                          <>
                            <PowerOff className="h-3.5 w-3.5" /> إيقاف
                          </>
                        ) : (
                          <>
                            <Power className="h-3.5 w-3.5" /> تفعيل
                          </>
                        )}
                      </button>
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
