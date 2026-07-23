/**
 * Phase 3B — Declarative permission gate.
 *
 *   <Can permission="appointments.cancel" branchId={branchId}>
 *     <CancelButton />
 *   </Can>
 *
 * Renders `children` only when the caller has the permission. Optional
 * `fallback` is shown otherwise (default: nothing). During the first
 * fetch, nothing is rendered to avoid a "button flashes then hides"
 * flicker; provide a `fallback` if you need a placeholder.
 *
 * Reminder: this is a UI convenience only. The matching server function
 * MUST re-check via `assertPermission`.
 */
import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionKey } from "@/lib/rbac/permissions";

export function Can({
  permission,
  branchId,
  children,
  fallback = null,
}: {
  permission: PermissionKey;
  branchId?: string | null;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, loading } = usePermissions();
  if (loading) return null;
  return can(permission, branchId ?? null) ? <>{children}</> : <>{fallback}</>;
}
