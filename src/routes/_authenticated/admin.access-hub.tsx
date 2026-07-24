/**
 * Access Hub — unified surface for access-control admin dashboards.
 * Merges Users, Super Permissions, and Role Permissions Matrix under one
 * tabbed page. Original routes remain available as deep links.
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Users, KeyRound, Grid3x3 } from "lucide-react";
import { z } from "zod";

import { RequirePermission } from "@/components/rbac/RequirePermission";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui-v3";

import { AdminUsersRoute } from "./admin.users";
import { RolePermissionsMatrixPage } from "./admin.role-permissions-matrix";
import { SuperPermissionsPage } from "./admin.super.permissions";

const TABS = ["users", "permissions", "matrix"] as const;
type AccessTab = (typeof TABS)[number];

const searchSchema = z.object({
  tab: z.enum(TABS).default("users"),
});

export const Route = createFileRoute("/_authenticated/admin/access-hub")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "مركز الوصول — لوحة الإدارة الموحدة" },
      {
        name: "description",
        content:
          "إدارة المستخدمين، الأدوار، ومصفوفة الصلاحيات في واجهة واحدة داخل لوحة الإدارة.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AccessHub,
});

function AccessHub() {
  const { tab } = useSearch({ from: "/_authenticated/admin/access-hub" });
  const navigate = Route.useNavigate();

  const setTab = (next: AccessTab) => {
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">مركز الوصول</h1>
        <p className="text-sm text-muted-foreground">
          المستخدمون، الأدوار، ومصفوفة الصلاحيات في مكان واحد.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AccessTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" aria-hidden />
            <span>المستخدمون</span>
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <KeyRound className="h-4 w-4" aria-hidden />
            <span>الصلاحيات</span>
          </TabsTrigger>
          <TabsTrigger value="matrix" className="gap-2">
            <Grid3x3 className="h-4 w-4" aria-hidden />
            <span>مصفوفة الصلاحيات</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          {tab === "users" && <AdminUsersRoute />}
        </TabsContent>
        <TabsContent value="permissions" className="mt-4">
          {tab === "permissions" && (
            <RequirePermission anyOf="rbac.manage">
              <SuperPermissionsPage />
            </RequirePermission>
          )}
        </TabsContent>
        <TabsContent value="matrix" className="mt-4">
          {tab === "matrix" && (
            <RequirePermission anyOf="rbac.manage">
              <RolePermissionsMatrixPage />
            </RequirePermission>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
