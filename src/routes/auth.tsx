/**
 * `/auth` — Andalusia-inspired split shell for all auth child routes.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthShell } from "@/components/auth/AuthShell";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — مجمع باعشن الطبي" },
      {
        name: "description",
        content: "تسجيل الدخول لمرضى وموظفي مجمع باعشن الطبي بأمان تام.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <AuthShell>
      <Outlet />
    </AuthShell>
  ),
});
