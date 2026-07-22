import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side gate for the Site Builder (/owner) area.
 * Restricted to super_admin only — the site owner.
 * Uses the has_role RPC (SECURITY DEFINER) to bypass RLS recursion.
 */
export async function assertOwnerAccess(): Promise<void> {
  // This is a helper used inside other server functions after
  // requireSupabaseAuth has run. It expects `context.supabase` and
  // `context.userId` on the caller's scope; callers pass them in via
  // the wrapper below.
  throw new Error("assertOwnerAccess must be called via getMyOwnerStatus");
}

/**
 * Public server fn: returns access level for the current user on Site Builder.
 * - isOwner: super_admin (full access, incl. delete)
 * - isEditor: content_manager (edit only, cannot delete)
 * Used by the /owner route's beforeLoad gate and UI role-aware controls.
 */
export const getMyOwnerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    const [ownerRes, editorRes] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "content_manager" }),
    ]);
    if (ownerRes.error) console.error("[owner.gate] has_role super_admin failed:", ownerRes.error);
    if (editorRes.error)
      console.error("[owner.gate] has_role content_manager failed:", editorRes.error);
    const isOwner = Boolean(ownerRes.data);
    const isEditor = Boolean(editorRes.data);
    return {
      isOwner,
      isEditor,
      // legacy: allow entry when either role is present
      hasAccess: isOwner || isEditor,
      level: isOwner ? ("owner" as const) : isEditor ? ("editor" as const) : ("none" as const),
    };
  });
