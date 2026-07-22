import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import type { AdminRole } from "@/components/admin/types";
import { getMyRoles, assertAdminAccess } from "@/lib/admin.functions";
import { getMyProfile } from "@/lib/portal/portal.functions";

// Console entry is now restricted to admin/super_admin. Operational roles
// (reception/doctor/nurse/hr/pharmacy) reach their tools through dedicated
// staff routes, not the /admin shell.
const CONSOLE_ROLES: AdminRole[] = ["admin", "super_admin"];

export const rolesQuery = queryOptions({
  queryKey: ["admin", "my-roles"],
  queryFn: () => getMyRoles(),
  staleTime: 60_000,
});
export const profileQuery = queryOptions({
  queryKey: ["portal", "my-profile"],
  queryFn: () => getMyProfile(),
  staleTime: 60_000,
});

/**
 * Critical route file: only guards + loader stay here so the route-tree
 * bundle is tiny. The AdminShell UI, error boundary, and not-found are
 * loaded from admin.lazy.tsx on first navigation to any /admin/* route.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context, location }) => {
    // Back-compat: old /admin?tab=X → /admin/classic?tab=X (before role check)
    const search = location.search as Record<string, unknown>;
    if (search && typeof search.tab === "string" && location.pathname === "/admin") {
      throw redirect({ to: "/admin/classic", search: search as never });
    }

    // Hardened server-side gate. Uses the has_role RPC (SECURITY DEFINER)
    // and audit-logs every denial. Runs BEFORE any admin data is fetched
    // and before the AdminShell renders, so a spoofed client cache cannot
    // buy access. Any thrown error → redirect to /portal.
    try {
      await assertAdminAccess();
    } catch {
      throw redirect({ to: "/portal" });
    }

    // Warm the roles cache for the layout (used to render nav sections).
    let rolesData: { roles?: string[] } | null = null;
    try {
      rolesData = await context.queryClient.ensureQueryData(rolesQuery);
    } catch {
      throw redirect({ to: "/portal" });
    }
    const roles = (rolesData?.roles ?? []) as AdminRole[];
    const allowed = roles.some((r) => CONSOLE_ROLES.includes(r));
    if (!allowed) {
      throw redirect({ to: "/portal" });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(profileQuery);
    return null;
  },
  head: () => ({
    meta: [{ title: "لوحة الإدارة | مجمع باعشن الطبي" }, { name: "robots", content: "noindex" }],
  }),
});

// Re-export for admin.lazy.tsx (safe: consumed only by the lazy chunk).
export const ADMIN_CONSOLE_ROLES = CONSOLE_ROLES;
