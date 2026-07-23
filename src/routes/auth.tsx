/**
 * `/auth` — thin parent layout for the unified auth flow.
 *
 * Replaces the legacy 882-line single-page auth screen. The new flow lives
 * in child routes: /auth/login, /auth/verify, /auth/register, /auth/recovery,
 * /auth/session-expired. This parent only renders the shared shell and lets
 * `auth.index.tsx` handle the "hit /auth directly" redirect.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

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
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </main>
  ),
});
