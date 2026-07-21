import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Minus, ShieldCheck, Users } from "lucide-react";
import {
  listPermissionsCatalog,
  listRolePermissionsMatrix,
  listBranchesForRbac,
  listUsersWithRoles,
  type AppRole,
} from "@/lib/rbac.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/admin/role-permissions-matrix")({
  head: () => ({
    meta: [
      { title: "مصفوفة الأدوار والصلاحيات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="rbac.manage">
      <RolePermissionsMatrixPage />
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

const DISPLAY_ROLES: AppRole[] = [
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
];

function RolePermissionsMatrixPage() {
  const [branchId, setBranchId] = useState<string>("all");

  const permsQ = useQuery({
    queryKey: ["rbac", "permissions-catalog"],
    queryFn: () => listPermissionsCatalog(),
    staleTime: 5 * 60_000,
  });
  const matrixQ = useQuery({
    queryKey: ["rbac", "role-permissions-matrix"],
    queryFn: () => listRolePermissionsMatrix(),
    staleTime: 60_000,
  });
  const branchesQ = useQuery({
    queryKey: ["rbac", "branches"],
    queryFn: () => listBranchesForRbac(),
    staleTime: 5 * 60_000,
  });
  const usersQ = useQuery({
    queryKey: ["rbac", "users-with-roles"],
    queryFn: () => listUsersWithRoles(),
    staleTime: 60_000,
  });

  // role → Set(permission_key)
  const rolePerms = useMemo(() => {
    const map = new Map<AppRole, Set<string>>();
    for (const row of matrixQ.data ?? []) {
      if (!map.has(row.role)) map.set(row.role, new Set());
      map.get(row.role)!.add(row.permission_key);
    }
    return map;
  }, [matrixQ.data]);

  // permissions grouped by category
  const grouped = useMemo(() => {
    const g: Record<string, typeof permsQ.data extends undefined ? never : NonNullable<typeof permsQ.data>> = {};
    for (const p of permsQ.data ?? []) {
      (g[p.category] ||= [] as any).push(p);
    }
    return g;
  }, [permsQ.data]);

  // role → user count in selected branch scope
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of usersQ.data ?? []) {
      for (const r of u.roles) {
        if (branchId === "all" || r.branch_id === branchId || r.branch_id === null) {
          counts[r.role] = (counts[r.role] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [usersQ.data, branchId]);

  const loading = permsQ.isLoading || matrixQ.isLoading || branchesQ.isLoading;

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ShieldCheck className="h-6 w-6 text-primary" />
            مصفوفة الأدوار والصلاحيات
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            عرض شامل للأدوار والصلاحيات مع تصفية حسب الفرع. للتعديل استخدم صفحة إدارة الأدوار.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="branch-filter" className="text-sm font-medium text-foreground">
            الفرع:
          </label>
          <select
            id="branch-filter"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="all">جميع الفروع</option>
            {(branchesQ.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>
                {b.name_ar}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Users per role summary */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Users className="h-5 w-5 text-primary" />
          عدد المستخدمين لكل دور {branchId !== "all" ? "(في الفرع المحدد)" : "(كل الفروع)"}
        </h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          {DISPLAY_ROLES.map((role) => (
            <div
              key={role}
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
            >
              <span className="text-sm text-foreground">{ROLE_LABELS[role]}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
                {roleCounts[role] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Matrix */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-lg font-semibold text-foreground">مصفوفة الصلاحيات × الأدوار</h2>
          <p className="text-xs text-muted-foreground">✓ = مُفعّلة | — = غير مُفعّلة</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50">
                <tr>
                  <th className="sticky right-0 z-10 bg-muted/80 px-3 py-2 text-right font-semibold">
                    الصلاحية
                  </th>
                  {DISPLAY_ROLES.map((role) => (
                    <th
                      key={role}
                      className="whitespace-nowrap px-2 py-2 text-center font-semibold"
                    >
                      <div className="text-xs">{ROLE_LABELS[role]}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {roleCounts[role] ?? 0} مستخدم
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([category, perms]) => (
                  <>
                    <tr key={`h-${category}`} className="bg-muted/30">
                      <td
                        colSpan={DISPLAY_ROLES.length + 1}
                        className="px-3 py-1.5 text-right text-xs font-bold text-primary"
                      >
                        {category}
                      </td>
                    </tr>
                    {(perms as any[]).map((p) => (
                      <tr key={p.key} className="border-t border-border hover:bg-muted/20">
                        <td className="sticky right-0 z-10 bg-card px-3 py-2 text-right">
                          <div className="text-foreground">{p.description_ar}</div>
                          <div className="text-[10px] text-muted-foreground">{p.key}</div>
                        </td>
                        {DISPLAY_ROLES.map((role) => {
                          const has = rolePerms.get(role)?.has(p.key);
                          return (
                            <td key={role} className="px-2 py-2 text-center">
                              {has ? (
                                <Check className="mx-auto h-4 w-4 text-green-600" />
                              ) : (
                                <Minus className="mx-auto h-3 w-3 text-muted-foreground/50" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
