import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listUsersWithRoles,
  assignRole,
  revokeRole,
  listBranchesForRbac,
  listPermissionsCatalog,
  listRolePermissionsMatrix,
  setRolePermission,
  exportRolePermissions,
  importRolePermissions,
  type AppRole,
} from "@/lib/rbac.functions";
import { getMyRoles } from "@/lib/admin.functions";
import { ShieldCheck, UserPlus, X, ArrowRight, Users, KeyRound, Layers, Download, Upload } from "lucide-react";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/rbac")({
  head: () => ({
    meta: [
      { title: "إدارة الأدوار والصلاحيات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="rbac.manage">
      <RbacPage />
    </RequirePermission>
  ),
});

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "مسؤول أعلى",
  admin: "مسؤول",
  center_admin: "مسؤول المجمع",
  branch_manager: "مدير فرع",
  doctor: "طبيب",
  reception: "استقبال",
  pharmacy: "صيدلية",
  reports_officer: "مسؤول التقارير",
  billing_officer: "مسؤول الفوترة",
  insurance_officer: "مسؤول التأمين",
  support_agent: "دعم فني",
  content_manager: "مدير المحتوى",
  auditor: "مدقق",
  patient: "مريض",
};
const ROLES: AppRole[] = ["super_admin", "admin", "doctor", "reception", "pharmacy"];

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  super_admin: "أعلى صلاحية، يتحكم بكل الإعدادات ولا يمكن حذفه بالكامل.",
  admin: "مسؤول تشغيل المجمع؛ يدير المستخدمين والصلاحيات والتقارير.",
  center_admin: "مسؤول عام على مستوى المجمع الطبي.",
  branch_manager: "مدير فرع؛ يشرف على عمليات الفرع اليومية.",
  doctor: "الطبيب المعالج؛ يطّلع على المرضى ويكتب البيانات السريرية.",
  reception: "موظف الاستقبال؛ يدير المواعيد وملفات المرضى.",
  pharmacy: "الصيدلي؛ يدير المخزون والوصفات الطبية.",
  reports_officer: "مسؤول التقارير الطبية؛ يرفع ويراجع التقارير.",
  billing_officer: "مسؤول الفوترة والمدفوعات.",
  insurance_officer: "مسؤول التأمين والموافقات.",
  support_agent: "الدعم الفني والاستفسارات.",
  content_manager: "مدير محتوى الموقع والمقالات الصحية.",
  auditor: "مدقق؛ اطلاع فقط على سجلات التدقيق.",
  patient: "المريض؛ صلاحيات البوابة الشخصية فقط.",
};

type Tab = "users" | "roles" | "permissions";

function RbacPage() {
  const qc = useQueryClient();
  const myRolesFn = useServerFn(getMyRoles);
  const listFn = useServerFn(listUsersWithRoles);
  const branchesFn = useServerFn(listBranchesForRbac);
  const assignFn = useServerFn(assignRole);
  const revokeFn = useServerFn(revokeRole);
  const catalogFn = useServerFn(listPermissionsCatalog);
  const matrixFn = useServerFn(listRolePermissionsMatrix);
  const toggleFn = useServerFn(setRolePermission);

  const myRoles = useQuery({ queryKey: ["my-roles"], queryFn: () => myRolesFn() });
  const isSuper = (myRoles.data?.roles ?? []).includes("super_admin" as any);
  const isAdmin = (myRoles.data?.roles ?? []).includes("admin" as any) || isSuper;

  const [tab, setTab] = useState<Tab>("users");

  if (myRoles.isLoading) {
    return <div className="container-app py-16 text-center text-muted-foreground">جارٍ التحميل…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="container-app py-16 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">هذه الصفحة للمسؤولين فقط.</p>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: any }> = [
    { id: "users", label: "المستخدمون", icon: Users },
    { id: "roles", label: "الأدوار", icon: Layers },
    { id: "permissions", label: "الصلاحيات", icon: KeyRound },
  ];

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">إعدادات الأدوار والصلاحيات</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تعريف الأدوار، تحديد صلاحيات كل دور، وربطها بالمستخدمين والفروع.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/audit-log"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            سجل التدقيق
          </Link>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4" /> لوحة التحكم
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "users" && (
        <UsersTab
          listFn={listFn}
          branchesFn={branchesFn}
          assignFn={assignFn}
          revokeFn={revokeFn}
          isSuper={isSuper}
          qc={qc}
        />
      )}
      {tab === "roles" && <RolesTab />}
      {tab === "permissions" && (
        <PermissionsTab
          catalogFn={catalogFn}
          matrixFn={matrixFn}
          toggleFn={toggleFn}
          isSuper={isSuper}
          qc={qc}
        />
      )}
    </div>
  );
}

/* ------------------------------- Users tab ------------------------------ */

function UsersTab(props: {
  listFn: any;
  branchesFn: any;
  assignFn: any;
  revokeFn: any;
  isSuper: boolean;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { listFn, branchesFn, assignFn, revokeFn, isSuper, qc } = props;
  const users = useQuery({ queryKey: ["rbac-users"], queryFn: () => listFn() });
  const branches = useQuery({ queryKey: ["rbac-branches"], queryFn: () => branchesFn() });

  const [q, setQ] = useState("");
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("reception");
  const [newBranch, setNewBranch] = useState<string>("");

  const assignMut = useMutation({
    mutationFn: (v: { user_id: string; role: AppRole; branch_id: string | null }) =>
      assignFn({ data: v }),
    onSuccess: () => {
      toast.success("تم تعيين الصلاحية");
      qc.invalidateQueries({ queryKey: ["rbac-users"] });
      setOpenFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر التعيين"),
  });

  const revokeMut = useMutation({
    mutationFn: (v: { user_id: string; role: AppRole }) => revokeFn({ data: v }),
    onSuccess: () => {
      toast.success("تم إلغاء الصلاحية");
      qc.invalidateQueries({ queryKey: ["rbac-users"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر الإلغاء"),
  });

  const filtered = useMemo(() => {
    const list = users.data ?? [];
    if (!q.trim()) return list;
    const s = q.trim().toLowerCase();
    return list.filter(
      (u: any) =>
        (u.full_name ?? "").toLowerCase().includes(s) ||
        (u.email ?? "").toLowerCase().includes(s) ||
        (u.phone ?? "").toLowerCase().includes(s),
    );
  }, [users.data, q]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم أو البريد أو الجوال"
          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right">المستخدم</th>
              <th className="px-3 py-2 text-right">الجوال</th>
              <th className="px-3 py-2 text-right">الأدوار</th>
              <th className="px-3 py-2 text-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {!users.isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  لا توجد نتائج
                </td>
              </tr>
            )}
            {filtered.map((u: any) => {
              const branchMap = new Map<string, string>(
                (branches.data ?? []).map((b: any) => [b.id as string, b.name_ar as string]),
              );
              return (
                <tr key={u.user_id} className="border-t border-border align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{u.email || "—"}</div>
                  </td>
                  <td className="px-3 py-3">{u.phone || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.roles.length === 0 && (
                        <span className="text-xs text-muted-foreground">بدون أدوار</span>
                      )}
                      {u.roles.map((r: any) => (
                        <span
                          key={`${r.role}-${r.branch_id ?? "all"}`}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          {ROLE_LABELS[r.role as AppRole] ?? r.role}
                          {r.branch_id && (
                            <span className="text-primary/70">
                              · {branchMap.get(r.branch_id) ?? "فرع"}
                            </span>
                          )}
                          {(isSuper || (r.role !== "admin" && r.role !== "super_admin")) && (
                            <button
                              onClick={() => {
                                if (!confirm(`إلغاء دور ${ROLE_LABELS[r.role as AppRole]}؟`))
                                  return;
                                revokeMut.mutate({ user_id: u.user_id, role: r.role });
                              }}
                              className="rounded-full p-0.5 hover:bg-destructive/20"
                              title="إلغاء"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {openFor === u.user_id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as AppRole)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          {ROLES.filter((r) =>
                            isSuper ? true : r !== "super_admin" && r !== "admin",
                          ).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={newBranch}
                          onChange={(e) => setNewBranch(e.target.value)}
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          <option value="">كل الفروع</option>
                          {(branches.data ?? []).map((b: any) => (
                            <option key={b.id} value={b.id}>
                              {b.name_ar}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            assignMut.mutate({
                              user_id: u.user_id,
                              role: newRole,
                              branch_id: newBranch || null,
                            })
                          }
                          disabled={assignMut.isPending}
                          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          حفظ
                        </button>
                        <button
                          onClick={() => setOpenFor(null)}
                          className="rounded-md border border-input px-2.5 py-1 text-xs hover:bg-muted"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setOpenFor(u.user_id);
                          setNewRole("reception");
                          setNewBranch("");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs hover:bg-muted"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> إضافة دور
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- Roles tab ------------------------------ */

function RolesTab() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ROLES.map((r) => (
        <div key={r} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold">{ROLE_LABELS[r]}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {r}
            </span>
          </div>
        </div>
      ))}
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground md:col-span-2">
        الأدوار محددة على مستوى النظام. لإضافة أدوار جديدة يلزم تعديل مخطط قاعدة البيانات.
        استخدم تبويب <strong>الصلاحيات</strong> لتخصيص ما يستطيع كل دور فعله.
      </div>
    </div>
  );
}

/* --------------------------- Permissions tab ---------------------------- */

function PermissionsTab(props: {
  catalogFn: any;
  matrixFn: any;
  toggleFn: any;
  isSuper: boolean;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { catalogFn, matrixFn, toggleFn, isSuper, qc } = props;
  const catalog = useQuery({ queryKey: ["rbac-perm-catalog"], queryFn: () => catalogFn() });
  const matrix = useQuery({ queryKey: ["rbac-perm-matrix"], queryFn: () => matrixFn() });

  const set = useMemo(() => {
    const s = new Set<string>();
    for (const r of matrix.data ?? []) s.add(`${r.role}::${r.permission_key}`);
    return s;
  }, [matrix.data]);

  const toggleMut = useMutation({
    mutationFn: (v: { role: AppRole; permission_key: string; enabled: boolean }) =>
      toggleFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["rbac-perm-matrix"] });
      const prev = qc.getQueryData<any[]>(["rbac-perm-matrix"]) ?? [];
      const next = v.enabled
        ? [...prev, { role: v.role, permission_key: v.permission_key }]
        : prev.filter(
            (r) => !(r.role === v.role && r.permission_key === v.permission_key),
          );
      qc.setQueryData(["rbac-perm-matrix"], next);
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["rbac-perm-matrix"], ctx.prev);
      toast.error(e?.message ?? "تعذّر تحديث الصلاحية");
    },
    onSuccess: () => toast.success("تم التحديث"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["rbac-perm-matrix"] }),
  });

  if (catalog.isLoading || matrix.isLoading) {
    return <div className="py-8 text-center text-muted-foreground">جارٍ التحميل…</div>;
  }
  if (catalog.isError) {
    return (
      <div className="py-8 text-center text-destructive">
        {(catalog.error as any)?.message ?? "تعذّر تحميل الصلاحيات"}
      </div>
    );
  }

  // group by category
  const byCat = new Map<string, typeof catalog.data>();
  for (const p of catalog.data ?? []) {
    const arr = byCat.get(p.category) ?? ([] as any);
    arr.push(p);
    byCat.set(p.category, arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          فعّل أو عطّل كل صلاحية لكل دور. صلاحيات <strong>المسؤول الأعلى</strong> و
          <strong> المسؤول</strong> لا يمكن تعديلها إلا بواسطة المسؤول الأعلى.
        </p>
        <ImportExportToolbar isSuper={isSuper} qc={qc} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="sticky right-0 z-10 bg-muted/50 px-3 py-2 text-right">الصلاحية</th>
              {ROLES.map((r) => (
                <th key={r} className="px-3 py-2 text-center">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(byCat.entries()).flatMap(([cat, perms]) => [
              <tr key={`cat-${cat}`} className="bg-muted/30">
                <td
                  colSpan={ROLES.length + 1}
                  className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground"
                >
                  {cat}
                </td>
              </tr>,
              ...(perms ?? []).map((p: any) => (
                <tr key={p.key} className="border-t border-border">
                  <td className="sticky right-0 z-10 bg-card px-3 py-2 text-right">
                    <div className="font-medium">{p.description_ar}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {p.key}
                    </div>
                  </td>
                  {ROLES.map((r) => {
                    const on = r === "super_admin" ? true : set.has(`${r}::${p.key}`);
                    const locked =
                      r === "super_admin" || (!isSuper && r === "admin");
                    return (
                      <td key={r} className="px-3 py-2 text-center">
                        <button
                          disabled={locked || toggleMut.isPending}
                          onClick={() =>
                            toggleMut.mutate({
                              role: r,
                              permission_key: p.key,
                              enabled: !on,
                            })
                          }
                          title={locked ? "غير قابل للتعديل" : on ? "تعطيل" : "تفعيل"}
                          className={`inline-flex h-5 w-9 items-center rounded-full transition ${
                            on ? "bg-primary" : "bg-muted"
                          } ${locked ? "opacity-60" : "hover:opacity-80"}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-background transition ${
                              on ? "-translate-x-0.5" : "-translate-x-4"
                            }`}
                          />
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
    </div>
  );
}

/* ------------------------ Import / Export toolbar ----------------------- */

function ImportExportToolbar(props: {
  isSuper: boolean;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { isSuper, qc } = props;
  const exportFn = useServerFn(exportRolePermissions);
  const importFn = useServerFn(importRolePermissions);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [text, setText] = useState("");

  const handleExport = async () => {
    try {
      setBusy(true);
      const data = await exportFn();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rbac-permissions-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير الإعدادات");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التصدير");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (f: File) => {
    const t = await f.text();
    setText(t);
  };

  const handleImport = async () => {
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      toast.error("ملف JSON غير صالح");
      return;
    }
    if (payload?.version !== 1 || typeof payload?.roles !== "object") {
      toast.error("بنية الملف غير مدعومة (يجب أن يكون version=1 مع كائن roles)");
      return;
    }
    try {
      setBusy(true);
      const res: any = await importFn({ data: { mode, payload } });
      qc.invalidateQueries({ queryKey: ["rbac-perm-matrix"] });
      const bits = [
        `أُضيفت ${res.added}`,
        mode === "replace" ? `أُلغيت ${res.removed}` : null,
        res.skipped_unknown?.length ? `تخطّت ${res.skipped_unknown.length} صلاحية مجهولة` : null,
        res.skipped_roles?.length ? `تخطّت أدوار: ${res.skipped_roles.join(", ")}` : null,
        res.errors?.length ? `أخطاء: ${res.errors.length}` : null,
      ].filter(Boolean);
      toast.success(`تم الاستيراد — ${bits.join(" • ")}`);
      setImportOpen(false);
      setText("");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر الاستيراد");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleExport}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
      >
        <Download className="h-3.5 w-3.5" />
        تصدير JSON
      </button>
      <button
        onClick={() => setImportOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
      >
        <Upload className="h-3.5 w-3.5" />
        استيراد JSON
      </button>

      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
          onClick={() => !busy && setImportOpen(false)}
          dir="rtl"
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">استيراد إعدادات الصلاحيات</h3>
              <button
                onClick={() => setImportOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-3 text-xs text-muted-foreground">
              الصق محتوى ملف JSON أو ارفعه. سيتم تجاهل دور <code>super_admin</code>
              {!isSuper && <> ودور <code>admin</code></>} تلقائياً.
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                />
                <span>دمج (إضافة فقط)</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                <span>استبدال (تعطيل ما ليس في الملف)</span>
              </label>
              <label className="ms-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 hover:bg-muted">
                <Upload className="h-3 w-3" />
                رفع ملف
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              dir="ltr"
              placeholder='{ "version": 1, "roles": { "doctor": ["patients.view"] } }'
              className="w-full rounded-md border border-input bg-background p-2 font-mono text-[11px]"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setImportOpen(false)}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={handleImport}
                disabled={busy || !text.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? "جارٍ الاستيراد…" : "تنفيذ الاستيراد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
