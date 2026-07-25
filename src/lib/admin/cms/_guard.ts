/**
 * CMS-specific role guards. Layered on top of the generic admin guard.
 *   - `assertCmsEditor`  — editor OR admin OR super_admin (draft edits, save, submit).
 *   - `assertCmsPublisher` — admin OR super_admin only (approve, publish, schedule, rollback, archive).
 *   - `assertCmsSuper` — super_admin only (nav / footer / policies / seo_defaults).
 */
export type CmsGuardCtx = { supabase: any; userId: string };

async function hasAny(ctx: CmsGuardCtx, roles: readonly string[]): Promise<boolean> {
  const checks = await Promise.all(
    roles.map((r) => ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: r })),
  );
  if (checks.some((c) => c.error)) throw new Error("تعذّر التحقق من الصلاحية.");
  return checks.some((c) => c.data === true);
}

export async function assertCmsEditor(ctx: CmsGuardCtx): Promise<void> {
  const ok = await hasAny(ctx, ["editor", "admin", "super_admin"]);
  if (!ok) throw new Error("مطلوب صلاحية محرر أو أعلى.");
}

export async function assertCmsPublisher(ctx: CmsGuardCtx): Promise<void> {
  const ok = await hasAny(ctx, ["admin", "super_admin"]);
  if (!ok) throw new Error("مطلوب صلاحية مسؤول للنشر.");
}

export async function assertCmsSuper(ctx: CmsGuardCtx): Promise<void> {
  const ok = await hasAny(ctx, ["super_admin"]);
  if (!ok) throw new Error("هذه العملية متاحة لمدير النظام فقط.");
}

/** Read the highest CMS role the caller carries; used to gate UI actions. */
export async function getCmsRole(
  ctx: CmsGuardCtx,
): Promise<"super_admin" | "admin" | "editor" | "none"> {
  if (await hasAny(ctx, ["super_admin"])) return "super_admin";
  if (await hasAny(ctx, ["admin"])) return "admin";
  if (await hasAny(ctx, ["editor"])) return "editor";
  return "none";
}
