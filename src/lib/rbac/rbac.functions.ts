/**
 * Phase 3B — Client-visible permission surface.
 *
 * `getMyPermissions` returns the caller's full grant map so the UI can
 * gate affordances (buttons, menu entries) without a round-trip per
 * button. It is authoritative for UI only — the server always re-checks
 * on every mutation via `assertPermission`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserBranchIds, isGlobal, listMyGrants } from "./enforce.server";

export type MyPermissions = {
  userId: string;
  isSuperAdmin: boolean;
  branchIds: string[];
  /** All (permission, branch) pairs. `branch_id = null` means global. */
  grants: Array<{ permission_key: string; branch_id: string | null }>;
};

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyPermissions> => {
    const ctx = { supabase: context.supabase, userId: context.userId };
    const [branchIds, isSuperAdmin, grants] = await Promise.all([
      getUserBranchIds(ctx),
      isGlobal(ctx, "super_admin"),
      listMyGrants(ctx),
    ]);
    return { userId: context.userId, isSuperAdmin, branchIds, grants };
  });
