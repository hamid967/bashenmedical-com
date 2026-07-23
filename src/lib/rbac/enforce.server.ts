/**
 * Phase 3B — Server-side permission enforcement.
 *
 * Single source of truth used by every sensitive server function / server
 * route to gate access by permission verb, optionally scoped to a branch or
 * a record's owner. Delegates the actual role/permission check to the
 * SECURITY DEFINER helpers introduced in Phase 3A:
 *
 *   - `public.has_permission_in_branch(user, permission_key, branch_id)`
 *   - `public.has_role_in_branch(user, role, branch_id)`
 *   - `public.is_global_role(user, role)`
 *   - `public.user_branch_ids(user)`
 *
 * All denials throw a small Arabic user-facing error and MUST NOT leak
 * which permission was missing (avoid role/permission oracle attacks).
 * Callers should let it propagate to the route error boundary.
 *
 * NOTE: pass the authenticated `context.supabase` from
 * `requireSupabaseAuth`. Do NOT use `supabaseAdmin` here — the whole point
 * of these checks is to run under the caller's identity so RLS + policies
 * stay authoritative.
 */
import type { PermissionKey } from "./permissions";

// The client type is intentionally loose so this file can be imported by
// both `.functions.ts` server fns and `.server.ts` helpers without pulling
// in Supabase's generated types at compile time.
type Sb = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => any;
};

export type EnforceCtx = { supabase: Sb; userId: string };

const DENIED = "ليست لديك الصلاحية لتنفيذ هذه العملية.";
const LOOKUP_FAILED = "تعذّر التحقق من الصلاحية.";
const NOT_FOUND = "السجل غير موجود.";

// -----------------------------------------------------------------------
// Permission checks
// -----------------------------------------------------------------------

/**
 * True if the user holds `permission` — globally, or scoped to `branchId`
 * when provided. `branchId = null` means "global check": we look for any
 * grant where `is_global = true`.
 */
export async function hasPermission(
  ctx: EnforceCtx,
  permission: PermissionKey,
  branchId: string | null = null,
): Promise<boolean> {
  // `has_permission_in_branch` matches when the row is global OR pinned to
  // the given branch. When callers want a strictly global check, we pass
  // `NULL` for branch and only global rows match (branch_id = NULL never
  // equals a UUID).
  const { data, error } = await ctx.supabase.rpc("has_permission_in_branch", {
    _user_id: ctx.userId,
    _permission_key: permission,
    _branch_id: branchId,
  });
  if (error) throw new Error(LOOKUP_FAILED);
  return data === true;
}

/**
 * Throws `DENIED` if the user lacks `permission` in the given scope.
 * Pass `branchId` to enforce branch-scoped access; omit it for a global
 * check (only global grants — including `super_admin` — pass).
 */
export async function assertPermission(
  ctx: EnforceCtx,
  permission: PermissionKey,
  branchId: string | null = null,
): Promise<true> {
  if (!(await hasPermission(ctx, permission, branchId))) {
    throw new Error(DENIED);
  }
  return true;
}

/**
 * Enforces that the caller has ALL listed permissions in the given branch
 * scope. Fails on the first missing one but still with the generic Arabic
 * message (do not disclose which permission failed).
 */
export async function assertPermissions(
  ctx: EnforceCtx,
  permissions: readonly PermissionKey[],
  branchId: string | null = null,
): Promise<true> {
  const results = await Promise.all(
    permissions.map((p) => hasPermission(ctx, p, branchId)),
  );
  if (results.some((ok) => !ok)) throw new Error(DENIED);
  return true;
}

// -----------------------------------------------------------------------
// Branch scope helpers
// -----------------------------------------------------------------------

/**
 * Branches the user is pinned to via `user_roles.branch_id`. Global roles
 * (is_global = true) return an empty set — combine with `isGlobal()` when
 * you want "all branches".
 */
export async function getUserBranchIds(ctx: EnforceCtx): Promise<string[]> {
  const { data, error } = await ctx.supabase.rpc("user_branch_ids", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error(LOOKUP_FAILED);
  const rows = (data ?? []) as Array<string | { user_branch_ids: string }>;
  return rows
    .map((r) => (typeof r === "string" ? r : r?.user_branch_ids))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * True if the user carries `role` as a global grant (or is `super_admin`).
 * `super_admin` short-circuits every role check by design.
 */
export async function isGlobal(ctx: EnforceCtx, role: string): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc("is_global_role", {
    _user_id: ctx.userId,
    _role: role,
  });
  if (error) throw new Error(LOOKUP_FAILED);
  return data === true;
}

/**
 * Ensures `branchId` is inside the caller's scope. Passes for global roles
 * (super_admin or any is_global=true grant of `role` when supplied).
 * Use before honoring a client-supplied branch filter or writing a
 * branch-scoped row.
 */
export async function assertBranchScope(
  ctx: EnforceCtx,
  branchId: string,
  opts?: { role?: string },
): Promise<true> {
  const role = opts?.role;
  if (role) {
    const { data, error } = await ctx.supabase.rpc("has_role_in_branch", {
      _user_id: ctx.userId,
      _role: role,
      _branch_id: branchId,
    });
    if (error) throw new Error(LOOKUP_FAILED);
    if (data === true) return true;
    throw new Error(DENIED);
  }
  // No role provided — super_admin passes, otherwise the branch must be in
  // the user's pinned set.
  if (await isGlobal(ctx, "super_admin")) return true;
  const ids = await getUserBranchIds(ctx);
  if (!ids.includes(branchId)) throw new Error(DENIED);
  return true;
}

// -----------------------------------------------------------------------
// Record-scoped ownership
// -----------------------------------------------------------------------

export type OwnershipRule = {
  /** Table containing the record — must be reachable under RLS. */
  table: string;
  /** Primary-key column (defaults to `id`). */
  idColumn?: string;
  /** Column holding the owning user id (nullable for guest rows). */
  ownerColumn?: string;
  /** Optional branch column, checked against caller's scope when present. */
  branchColumn?: string | null;
};

/**
 * Fetches a record and asserts the caller either owns it (owner column ===
 * userId) OR holds `fallbackPermission` in the record's branch scope. This
 * is the canonical "IDOR guard" for admin actions on user-owned rows.
 *
 * Returns the fetched row on success (already narrowed to the requested
 * columns) so callers can reuse it without a second query.
 */
export async function assertRecordAccess(
  ctx: EnforceCtx,
  rule: OwnershipRule & { recordId: string; select?: string },
  fallbackPermission?: PermissionKey,
): Promise<Record<string, unknown>> {
  const idCol = rule.idColumn ?? "id";
  const ownerCol = rule.ownerColumn ?? "user_id";
  const branchCol = rule.branchColumn ?? null;
  const cols = new Set([idCol, ownerCol, ...(branchCol ? [branchCol] : [])]);
  const select = rule.select
    ? `${rule.select}, ${Array.from(cols).join(", ")}`
    : Array.from(cols).join(", ");

  const { data, error } = await ctx.supabase
    .from(rule.table)
    .select(select)
    .eq(idCol, rule.recordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(NOT_FOUND);
  const row = data as Record<string, unknown>;

  if (row[ownerCol] && row[ownerCol] === ctx.userId) return row;

  if (!fallbackPermission) throw new Error(DENIED);
  const branchId = branchCol ? ((row[branchCol] as string | null) ?? null) : null;
  await assertPermission(ctx, fallbackPermission, branchId);
  return row;
}

// -----------------------------------------------------------------------
// Bulk read for the UI (`usePermissions` hook)
// -----------------------------------------------------------------------

/**
 * Returns every (permission_key, branch_id) grant reachable by the caller.
 * Global grants surface with `branch_id = null`. Used by the client-side
 * `usePermissions` hook to gate UI affordances; the server still enforces
 * every write independently via `assertPermission`.
 */
export async function listMyGrants(ctx: EnforceCtx): Promise<
  Array<{ permission_key: string; branch_id: string | null }>
> {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("branch_id, is_global, role_permissions:role ( permission_key )")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(LOOKUP_FAILED);
  const out = new Map<string, { permission_key: string; branch_id: string | null }>();
  for (const row of (data ?? []) as Array<{
    branch_id: string | null;
    is_global: boolean | null;
    role_permissions: Array<{ permission_key: string }> | null;
  }>) {
    const scope = row.is_global ? null : (row.branch_id ?? null);
    for (const rp of row.role_permissions ?? []) {
      const k = `${rp.permission_key}::${scope ?? "*"}`;
      if (!out.has(k)) {
        out.set(k, { permission_key: rp.permission_key, branch_id: scope });
      }
    }
  }
  return Array.from(out.values());
}
