import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /command-center was a parallel admin dashboard that duplicated /admin.
 * Unified into /admin (AdminShellV2). This route now redirects to preserve
 * any external bookmarks or in-app links that still reference the old URL.
 */
export const Route = createFileRoute("/_authenticated/command-center")({
  beforeLoad: () => {
    throw redirect({ to: "/admin", replace: true });
  },
});
