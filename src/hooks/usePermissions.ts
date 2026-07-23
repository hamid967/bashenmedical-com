/**
 * Phase 3B — Client-side permission hook.
 *
 * Consumers should treat the returned `can()` as a UI-only affordance
 * gate. Every write MUST be re-checked on the server via
 * `assertPermission` in the corresponding server function.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyPermissions, type MyPermissions } from "@/lib/rbac/rbac.functions";
import type { PermissionKey } from "@/lib/rbac/permissions";

export type PermissionCheck = {
  loading: boolean;
  isSuperAdmin: boolean;
  branchIds: string[];
  /**
   * True if the caller can perform `permission`. When `branchId` is
   * provided, matches a global grant OR a grant pinned to that branch.
   * When `branchId` is omitted, ANY grant (global or branch) satisfies it.
   */
  can: (permission: PermissionKey, branchId?: string | null) => boolean;
  data: MyPermissions | undefined;
};

const EMPTY: MyPermissions = {
  userId: "",
  isSuperAdmin: false,
  branchIds: [],
  grants: [],
};

export function usePermissions(): PermissionCheck {
  const fetchFn = useServerFn(getMyPermissions);
  const { data, isLoading } = useQuery({
    queryKey: ["rbac", "my-permissions"],
    queryFn: () => fetchFn(),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const snapshot = data ?? EMPTY;
  const can: PermissionCheck["can"] = (permission, branchId = null) => {
    if (snapshot.isSuperAdmin) return true;
    return snapshot.grants.some((g) => {
      if (g.permission_key !== permission) return false;
      if (g.branch_id === null) return true; // global grant satisfies any scope
      if (branchId == null) return true;      // any grant satisfies "any scope"
      return g.branch_id === branchId;
    });
  };
  return {
    loading: isLoading,
    isSuperAdmin: snapshot.isSuperAdmin,
    branchIds: snapshot.branchIds,
    can,
    data,
  };
}
