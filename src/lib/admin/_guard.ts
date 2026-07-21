/**
 * Shared admin-console guard. Grants access to any user carrying either
 * `admin` or `super_admin` in `public.user_roles`. Used by every server
 * function under `src/lib/admin/*.functions.ts` so the console surface
 * has a single, uniform authorization contract.
 *
 * Denials throw an Arabic user-facing error (rendered by the caller's
 * error boundary). We deliberately do NOT expose which role was missing.
 */
export type AdminGuardContext = { supabase: any; userId: string };

const CONSOLE_ROLES = ["admin", "super_admin"] as const;

export async function assertConsoleAccess(ctx: AdminGuardContext): Promise<void> {
  const checks = await Promise.all(
    CONSOLE_ROLES.map((role) =>
      ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role }),
    ),
  );
  const firstError = checks.find((c) => c.error);
  if (firstError?.error) throw new Error(firstError.error.message);
  const granted = checks.some((c) => c.data === true);
  if (!granted) throw new Error("مطلوب صلاحية مسؤول");
}
