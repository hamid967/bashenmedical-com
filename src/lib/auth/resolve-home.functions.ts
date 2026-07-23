/**
 * Server-side role resolver used for post-login redirect. The client never
 * decides "where to go next" from a locally-decoded JWT — it asks this fn,
 * which reads `user_roles` under the caller's session, so RLS enforces
 * that nobody can see roles they don't own.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyRolesAndHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => String(r.role));
    const { homeForRoles, pickPrimaryRole } = await import("@/lib/auth/redirect");
    return {
      roles,
      primary: pickPrimaryRole(roles),
      home: homeForRoles(roles),
    };
  });
