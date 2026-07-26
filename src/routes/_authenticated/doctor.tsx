/**
 * /doctor — Doctor Console layout (Batch A2).
 *
 * Server-side role gate: only users with `doctor` or `super_admin` may
 * enter. Everyone else is redirected to /portal. Children render through
 * <Outlet />; the shared header/nav lives here.
 */
import { createFileRoute, redirect, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { Stethoscope, CalendarDays, LogOut } from "lucide-react";
import { getMyRoles } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export const doctorRolesQuery = queryOptions({
  queryKey: ["doctor", "my-roles"],
  queryFn: () => getMyRoles(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/doctor")({
  beforeLoad: async ({ context }) => {
    let data: { roles?: string[] } | null = null;
    try {
      data = await context.queryClient.ensureQueryData(doctorRolesQuery);
    } catch {
      throw redirect({ to: "/portal" });
    }
    const roles = data?.roles ?? [];
    const allowed = roles.includes("doctor") || roles.includes("super_admin");
    if (!allowed) throw redirect({ to: "/portal" });
  },
  head: () => ({
    meta: [
      { title: "شاشة الطبيب | مجمع باعشن الطبي" },
      { name: "description", content: "مواعيد اليوم، الكشف، وتوثيق الزيارات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DoctorLayout,
});

function DoctorLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = (p: string) =>
    pathname === p || pathname.startsWith(`${p}/`)
      ? "bg-primary text-primary-foreground"
      : "hover:bg-muted";

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 p-3">
          <Stethoscope className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-semibold">شاشة الطبيب</h1>
          <nav className="ms-4 flex items-center gap-1 text-xs">
            <Link
              to="/doctor/workspace"
              className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 ${active("/doctor/workspace")}`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              مواعيد اليوم
            </Link>
          </nav>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth/login";
            }}
            className="ms-auto inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
          >
            <LogOut className="h-3.5 w-3.5" />
            خروج
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
