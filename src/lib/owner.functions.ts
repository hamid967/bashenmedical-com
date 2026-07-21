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
 * Public server fn: returns { isOwner: boolean } for the current user.
 * Used by the /owner route's beforeLoad gate.
 */
export const getMyOwnerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (error) {
      console.error("[owner.gate] has_role failed:", error);
      return { isOwner: false };
    }
    return { isOwner: Boolean(data) };
  });
