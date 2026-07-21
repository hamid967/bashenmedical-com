/**
 * Shared access helpers for Site Builder server functions.
 *
 * Two levels:
 *  - Owner (super_admin): full access, incl. destructive ops (delete).
 *  - Editor (content_manager): may read/create/update pages & services,
 *    but MAY NOT delete.
 *
 * MFA:
 *  - Owner (super_admin) endpoints REQUIRE AAL2 (TOTP verified this session).
 *    Pass `context.claims` to `assertOwnerOnly` to enforce it.
 */

async function hasRole(supabase: any, userId: string, role: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: role,
  });
  if (error) throw new Error("تعذّر التحقق من الصلاحية.");
  return Boolean(data);
}

/** Throws if the caller's session is not AAL2 (MFA-verified). */
export function assertAAL2(claims: any): void {
  const aal = claims?.aal;
  if (aal !== "aal2") {
    const err = new Error(
      "هذه العملية تتطلب التحقق متعدد العوامل (MFA). فعّل رمز TOTP من صفحة الأمان ثم أعِد المحاولة.",
    );
    (err as any).code = "MFA_REQUIRED";
    throw err;
  }
}

/** Owner OR editor. Use for read/create/update endpoints. */
export async function assertContentAccess(supabase: any, userId: string): Promise<void> {
  const [isOwner, isEditor] = await Promise.all([
    hasRole(supabase, userId, "super_admin"),
    hasRole(supabase, userId, "content_manager"),
  ]);
  if (!isOwner && !isEditor) {
    throw new Error("هذه الصفحة مخصصة لمالك الموقع أو محرر المحتوى فقط.");
  }
}

/**
 * Owner ONLY. Use for destructive ops (delete).
 * When `claims` is passed, also enforces AAL2 (MFA) — required for all
 * super_admin endpoints.
 */
export async function assertOwnerOnly(
  supabase: any,
  userId: string,
  claims?: any,
): Promise<void> {
  const ok = await hasRole(supabase, userId, "super_admin");
  if (!ok) throw new Error("هذه العملية مخصصة لمالك الموقع فقط.");
  if (claims !== undefined) assertAAL2(claims);
}
