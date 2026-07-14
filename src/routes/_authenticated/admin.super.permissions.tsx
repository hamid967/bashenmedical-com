import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  importRolePermissions,
  listPermissionsCatalog,
  listRolePermissionsMatrix,
  setRolePermission,
  type AppRole,
} from "@/lib/rbac.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";
import { Download, History, Info, Loader2, Search, ShieldCheck, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_ROLES: AppRole[] = [
  "super_admin",
  "admin",
  "center_admin",
  "branch_manager",
  "doctor",
  "reception",
  "pharmacy",
  "reports_officer",
  "billing_officer",
  "insurance_officer",
  "support_agent",
  "content_manager",
  "auditor",
  "patient",
];

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "مسؤول أعلى",
  admin: "مسؤول",
  center_admin: "مسؤول المجمع",
  branch_manager: "مدير فرع",
  doctor: "طبيب",
  reception: "استقبال",
  pharmacy: "صيدلية",
  reports_officer: "التقارير",
  billing_officer: "الفوترة",
  insurance_officer: "التأمين",
  support_agent: "الدعم",
  content_manager: "المحتوى",
  auditor: "مدقق",
  patient: "مريض",
};

const catalogQuery = queryOptions({
  queryKey: ["rbac", "permissions-catalog"],
  queryFn: () => listPermissionsCatalog(),
  staleTime: 60_000,
});
const matrixQuery = queryOptions({
  queryKey: ["rbac", "role-permissions-matrix"],
  queryFn: () => listRolePermissionsMatrix(),
  staleTime: 30_000,
});

export const Route = createFileRoute("/_authenticated/admin/super/permissions")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQuery),
      context.queryClient.ensureQueryData(matrixQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "مصفوفة الصلاحيات | Super Admin" },
      { name: "description", content: "تحرير مصفوفة الأدوار × الصلاحيات (RBAC) لحظيًا." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="rbac.manage">
      <SuperPermissionsPage />
    </RequirePermission>
  ),
});

function SuperPermissionsPage() {
  const qc = useQueryClient();
  const { data: catalog } = useSuspenseQuery(catalogQuery);
  const { data: matrix } = useSuspenseQuery(matrixQuery);
  const setPerm = useServerFn(setRolePermission);
  const importFn = useServerFn(importRolePermissions);
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importPayload, setImportPayload] = useState<Record<string, string[]> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [roleFocus, setRoleFocus] = useState<AppRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");

  const enabledSet = useMemo(
    () => new Set(matrix.map((r) => `${r.role}::${r.permission_key}`)),
    [matrix],
  );

  const categories = useMemo(
    () => Array.from(new Set(catalog.map((p) => p.category))).sort((a, b) => a.localeCompare(b, "ar")),
    [catalog],
  );

  const visibleRoles = useMemo<AppRole[]>(
    () => (roleFocus === "all" ? ALL_ROLES : [roleFocus]),
    [roleFocus],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return catalog.filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (q) {
        const hit =
          p.key.toLowerCase().includes(q) ||
          p.description_ar.toLowerCase().includes(q) ||
          (p.description_en ?? "").toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter !== "all" && roleFocus !== "all") {
        const on = roleFocus === "super_admin" || enabledSet.has(`${roleFocus}::${p.key}`);
        if (statusFilter === "enabled" && !on) return false;
        if (statusFilter === "disabled" && on) return false;
      }
      return true;
    });
  }, [catalog, filter, categoryFilter, statusFilter, roleFocus, enabledSet]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const p of filtered) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ar"));
  }, [filtered]);

  const activeFilterCount =
    (filter.trim() ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (roleFocus !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0);

  function clearAllFilters() {
    setFilter("");
    setCategoryFilter("all");
    setRoleFocus("all");
    setStatusFilter("all");
  }


  const mut = useMutation({
    mutationFn: async (v: { role: AppRole; permission_key: string; enabled: boolean }) => {
      await setPerm({ data: v });
      return v;
    },
    onMutate: (v) => {
      const cellKey = `${v.role}::${v.permission_key}`;
      setPending((s) => new Set(s).add(cellKey));
      // Snapshot for rollback
      const prev = qc.getQueryData(matrixQuery.queryKey) as
        | Array<{ role: AppRole; permission_key: string }>
        | undefined;
      // Optimistic update
      if (prev) {
        const next = v.enabled
          ? [...prev, { role: v.role, permission_key: v.permission_key }]
          : prev.filter(
              (r) => !(r.role === v.role && r.permission_key === v.permission_key),
            );
        qc.setQueryData(matrixQuery.queryKey, next);
      }
      return { prev, cellKey };
    },
    onError: (err: any, v, ctx) => {
      // 1) Rollback the optimistic cache change
      if (ctx?.prev !== undefined) {
        qc.setQueryData(matrixQuery.queryKey, ctx.prev);
      }
      // 2) Build a clear, human-friendly message
      const perm = catalog.find((p) => p.key === v.permission_key);
      const permLabel = perm?.description_ar || v.permission_key;
      const roleLabel = ROLE_LABEL[v.role] ?? v.role;
      const action = v.enabled ? "تفعيل" : "تعطيل";
      const raw = String(err?.message ?? "").trim();
      const reason =
        /forbidden|permission denied|42501|ليست لديك/i.test(raw)
          ? "ليست لديك الصلاحية الكافية."
          : /super_admin/i.test(raw)
            ? "هذا التعديل يتطلب صلاحية المسؤول الأعلى."
            : /network|fetch|failed to fetch|timeout/i.test(raw)
              ? "تعذّر الاتصال بالخادم — تحقّق من الشبكة."
              : raw || "حدث خطأ غير متوقّع.";
      toast.error(`تعذّر ${action} «${permLabel}» للدور «${roleLabel}»`, {
        description: reason + " — أُعيدت الحالة السابقة.",
        action: {
          label: "إعادة المحاولة",
          onClick: () => mut.mutate(v),
        },
      });
      // eslint-disable-next-line no-console
      console.error("[rbac] set_role_permission failed", { input: v, error: err });
    },
    onSuccess: () => {
      toast.success("تم التحديث");
    },
    onSettled: (_d, _e, _v, ctx) => {
      if (ctx?.cellKey) {
        setPending((s) => {
          const n = new Set(s);
          n.delete(ctx.cellKey);
          return n;
        });
      }
      // Reconcile with server truth regardless of success/failure
      qc.invalidateQueries({ queryKey: ["rbac", "role-permissions-matrix"] });
    },
    retry: false,
  });

  const enabledCount = matrix.length;

  function csvEscape(s: string) {
    if (s == null) return "";
    const needs = /[",\n\r]/.test(s);
    const v = String(s).replace(/"/g, '""');
    return needs ? `"${v}"` : v;
  }

  function handleExportCsv() {
    const header = [
      "permission_key",
      "category",
      "description_ar",
      "description_en",
      ...ALL_ROLES,
    ];
    const lines = [header.map(csvEscape).join(",")];
    const sorted = [...catalog].sort((a, b) =>
      a.category.localeCompare(b.category, "ar") || a.key.localeCompare(b.key),
    );
    for (const p of sorted) {
      const row = [
        p.key,
        p.category,
        p.description_ar ?? "",
        p.description_en ?? "",
        ...ALL_ROLES.map((r) =>
          r === "super_admin" ? "1" : enabledSet.has(`${r}::${p.key}`) ? "1" : "0",
        ),
      ];
      lines.push(row.map((v) => csvEscape(String(v))).join(","));
    }
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `rbac-permissions-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير المصفوفة");
  }

  function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let cur: string[] = [];
    let val = "";
    let inQ = false;
    const t = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (inQ) {
        if (c === '"') {
          if (t[i + 1] === '"') {
            val += '"';
            i++;
          } else inQ = false;
        } else val += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") {
          cur.push(val);
          val = "";
        } else if (c === "\n" || c === "\r") {
          if (c === "\r" && t[i + 1] === "\n") i++;
          cur.push(val);
          rows.push(cur);
          cur = [];
          val = "";
        } else val += c;
      }
    }
    if (val.length || cur.length) {
      cur.push(val);
      rows.push(cur);
    }
    return rows.filter((r) => r.length && r.some((c) => c.trim() !== ""));
  }

  async function handleFilePicked(file: File) {
    setImportError(null);
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("الملف فارغ.");
      const header = rows[0].map((h) => h.trim());
      const keyIdx = header.indexOf("permission_key");
      if (keyIdx < 0) throw new Error("عمود permission_key مفقود.");
      const roleCols: { role: AppRole; idx: number }[] = [];
      for (let i = 0; i < header.length; i++) {
        if (ALL_ROLES.includes(header[i] as AppRole)) {
          roleCols.push({ role: header[i] as AppRole, idx: i });
        }
      }
      if (roleCols.length === 0) throw new Error("لا توجد أعمدة أدوار في الملف.");
      const payload: Record<string, string[]> = {};
      for (const { role } of roleCols) payload[role] = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const key = (row[keyIdx] ?? "").trim();
        if (!key) continue;
        for (const { role, idx } of roleCols) {
          const v = (row[idx] ?? "").trim().toLowerCase();
          if (v === "1" || v === "true" || v === "yes" || v === "y" || v === "x") {
            payload[role].push(key);
          }
        }
      }
      setImportPayload(payload);
    } catch (err: any) {
      setImportPayload(null);
      setImportError(err?.message ?? "تعذّر قراءة الملف.");
    }
  }

  async function handleConfirmImport() {
    if (!importPayload) return;
    setImporting(true);
    try {
      const res: any = await importFn({
        data: {
          mode: importMode,
          payload: { version: 1, roles: importPayload },
        },
      });
      const parts = [`أُضيف: ${res.added ?? 0}`, `أُلغي: ${res.removed ?? 0}`];
      if (res.skipped_unknown?.length) parts.push(`تُخطّي غير معروف: ${res.skipped_unknown.length}`);
      if (res.skipped_roles?.length) parts.push(`تُخطّي أدوار: ${res.skipped_roles.length}`);
      if (res.errors?.length) parts.push(`أخطاء: ${res.errors.length}`);
      toast.success("تم الاستيراد — " + parts.join("، "));
      setImportOpen(false);
      setImportPayload(null);
      setImportFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["rbac", "role-permissions-matrix"] });
    } catch (err: any) {
      toast.error(err?.message ?? "تعذّر الاستيراد");
    } finally {
      setImporting(false);
    }
  }


  return (
    <div className="container-app py-8 space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Super Admin
          </div>
          <h1 className="text-3xl font-bold tracking-tight">مصفوفة الصلاحيات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تحرير الصلاحيات لكل دور — التعديل يُطبَّق مباشرةً على نظام RBAC.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{catalog.length} صلاحية</Badge>
          <Badge variant="outline">{ALL_ROLES.length} دور</Badge>
          <Badge variant="outline">{enabledCount} مُفعّلة</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleExportCsv}
          >
            <Download className="h-3.5 w-3.5" />
            تصدير CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setImportError(null);
              setImportPayload(null);
              setImportFileName(null);
              setImportMode("merge");
              setImportOpen(true);
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            استيراد CSV
          </Button>
          <Link
            to="/admin/super/permissions/audit"
            className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full border border-border bg-card hover:bg-accent px-3 h-8"
          >
            <History className="h-3.5 w-3.5" />
            سجل التدقيق
          </Link>
        </div>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="ابحث بالمفتاح أو الوصف أو التصنيف…"
          className="pr-9"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr>
              <th className="sticky right-0 z-20 bg-muted/40 px-3 py-2 text-right min-w-[260px]">
                الصلاحية
              </th>
              {ALL_ROLES.map((r) => (
                <th key={r} className="px-2 py-2 text-center whitespace-nowrap">
                  <div className="text-xs font-semibold">{ROLE_LABEL[r]}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{r}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr>
                <td colSpan={ALL_ROLES.length + 1} className="py-10 text-center text-muted-foreground">
                  لا توجد نتائج مطابقة.
                </td>
              </tr>
            )}
            {grouped.flatMap(([cat, perms]) => [
              <tr key={`cat-${cat}`} className="bg-muted/20">
                <td
                  colSpan={ALL_ROLES.length + 1}
                  className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground"
                >
                  {cat}
                </td>
              </tr>,
              ...perms.map((p) => (
                <tr key={p.key} className="border-t border-border hover:bg-muted/10">
                  <td className="sticky right-0 z-10 bg-card px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setDetailKey(p.key)}
                      className="group inline-flex items-start gap-1.5 text-right hover:text-primary transition"
                      title="عرض تفاصيل الصلاحية"
                    >
                      <Info className="mt-0.5 h-3.5 w-3.5 opacity-50 group-hover:opacity-100" />
                      <span>
                        <span className="block font-medium">{p.description_ar}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                          {p.key}
                        </span>
                      </span>
                    </button>
                  </td>
                  {ALL_ROLES.map((r) => {
                    const cellKey = `${r}::${p.key}`;
                    const on = r === "super_admin" ? true : enabledSet.has(cellKey);
                    const locked = r === "super_admin";
                    const isPending = pending.has(cellKey);
                    return (
                      <td key={r} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={locked || isPending}
                          onClick={() =>
                            mut.mutate({ role: r, permission_key: p.key, enabled: !on })
                          }
                          title={locked ? "دائمًا مُفعّل" : on ? "اضغط للتعطيل" : "اضغط للتفعيل"}
                          className={`inline-flex h-5 w-9 items-center rounded-full transition ${
                            on ? "bg-primary" : "bg-muted"
                          } ${locked ? "opacity-70 cursor-not-allowed" : "hover:opacity-80"}`}
                          aria-pressed={on}
                        >
                          {isPending ? (
                            <Loader2 className="h-3 w-3 mx-auto animate-spin text-background" />
                          ) : (
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-background transition ${
                                on ? "-translate-x-0.5" : "-translate-x-4"
                              }`}
                            />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        ملاحظة: <b>super_admin</b> يمتلك كامل الصلاحيات ولا يمكن تعديله. تعديل صلاحيات
        <b> admin</b> يتطلب أن تكون super_admin. تُسجَّل جميع التغييرات في سجل التدقيق.
      </p>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>استيراد مصفوفة الصلاحيات من CSV</DialogTitle>
            <DialogDescription>
              اختر ملف CSV بنفس صيغة التصدير (أعمدة: <code>permission_key</code> ثم أعمدة الأدوار
              بقيم 1/0). لن يتم تعديل دور <b>super_admin</b>. يتطلب تعديل دور <b>admin</b> صلاحية
              super_admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">وضع التطبيق</label>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">
                    دمج — إضافة الصلاحيات المفعّلة فقط (لا يُلغى شيء)
                  </SelectItem>
                  <SelectItem value="replace">
                    استبدال — مطابقة كاملة (يُلغى ما ليس في الملف)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">ملف CSV</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePicked(f);
                }}
                className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-muted file:text-foreground"
              />
              {importFileName && (
                <p className="text-xs text-muted-foreground">
                  الملف: <span className="font-mono">{importFileName}</span>
                </p>
              )}
              {importError && (
                <p className="text-xs text-destructive">{importError}</p>
              )}
              {importPayload && (
                <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                  معاينة: {Object.keys(importPayload).length} دور،{" "}
                  {Object.values(importPayload).reduce((a, b) => a + b.length, 0)} صلاحية مُفعّلة.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              إلغاء
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={!importPayload || importing}
              className="gap-1.5"
            >
              {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              تطبيق الاستيراد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PermissionDetailDialog
        permKey={detailKey}
        onClose={() => setDetailKey(null)}
        catalog={catalog}
        enabledSet={enabledSet}
      />
    </div>
  );
}

function PermissionDetailDialog({
  permKey,
  onClose,
  catalog,
  enabledSet,
}: {
  permKey: string | null;
  onClose: () => void;
  catalog: Array<{
    key: string;
    category: string;
    description_ar: string;
    description_en: string | null;
  }>;
  enabledSet: Set<string>;
}) {
  const perm = permKey ? catalog.find((p) => p.key === permKey) ?? null : null;
  const enabledRoles = useMemo<AppRole[]>(() => {
    if (!perm) return [];
    return ALL_ROLES.filter(
      (r) => r === "super_admin" || enabledSet.has(`${r}::${perm.key}`),
    );
  }, [perm, enabledSet]);

  const constraints = useMemo<string[]>(() => {
    if (!perm) return [];
    const list: string[] = [
      "دور super_admin يمتلك هذه الصلاحية دائمًا ولا يمكن تعطيلها.",
      "تعديل صلاحيات دور admin يتطلب صلاحية super_admin.",
      "يُسجَّل كل تغيير في سجل التدقيق مع تحديد المُنفِّذ ووقت التنفيذ.",
    ];
    if (/^rbac\./.test(perm.key)) {
      list.push("صلاحية حسّاسة: تمنح التحكم في نظام الأدوار والصلاحيات نفسه.");
    }
    if (/\.delete$|\.remove$/.test(perm.key)) {
      list.push("عملية حذف — لا يمكن التراجع عنها تلقائيًا.");
    }
    if (/audit|log/i.test(perm.key)) {
      list.push("تخصّ سجلات التدقيق — يُنصح بقصرها على أدوار الرقابة.");
    }
    return list;
  }, [perm]);

  return (
    <Dialog open={!!perm} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        {perm && (
          <>
            <DialogHeader>
              <DialogTitle className="text-right">{perm.description_ar}</DialogTitle>
              <DialogDescription className="text-right">
                <span className="font-mono text-xs">{perm.key}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 text-sm">
              <section>
                <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  التصنيف
                </h4>
                <Badge variant="secondary">{perm.category}</Badge>
              </section>

              {perm.description_en && (
                <section>
                  <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    الوصف (EN)
                  </h4>
                  <p dir="ltr" className="text-sm leading-relaxed">
                    {perm.description_en}
                  </p>
                </section>
              )}

              <section>
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                  الأدوار التي تمتلكها حاليًا ({enabledRoles.length})
                </h4>
                {enabledRoles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    لا يمتلك أي دور هذه الصلاحية حاليًا.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {enabledRoles.map((r) => (
                      <Badge
                        key={r}
                        variant={r === "super_admin" ? "default" : "outline"}
                        className="gap-1"
                      >
                        <span>{ROLE_LABEL[r]}</span>
                        <span className="font-mono text-[10px] opacity-70">{r}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                  الاستخدامات في التطبيق
                </h4>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li>
                    حماية الواجهات:{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {`<RequirePermission anyOf="${perm.key}">`}
                    </code>
                  </li>
                  <li>
                    فحص برمجي:{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {`hasPermission("${perm.key}")`}
                    </code>
                  </li>
                  <li>
                    تطبيقها على الخادم عبر سياسات RLS ودوال{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      has_permission()
                    </code>
                    .
                  </li>
                </ul>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                  القيود المرتبطة
                </h4>
                <ul className="list-disc space-y-1 pr-5 text-xs">
                  {constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </section>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                إغلاق
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
