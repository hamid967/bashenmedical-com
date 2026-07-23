/**
 * Phase 5 — /patient premium portal layout.
 * Auth is enforced by the parent _authenticated gate. This layout bounces
 * admin / super_admin roles to /admin so the patient app stays isolated.
 * Renders PatientShell around <Outlet />.
 */
import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PatientShell } from "@/components/patient/PatientShell";
import { getMyProfile } from "@/lib/portal/portal.functions";
import { getMyRoles } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState, EmptyState } from "@/components/states";

const myProfileQuery = queryOptions({
  queryKey: ["patient", "my-profile"],
  queryFn: () => getMyProfile(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/patient")({
  beforeLoad: async () => {
    try {
      const data = await getMyRoles();
      const roles = (data?.roles ?? []) as string[];
      if (roles.some((r) => r === "admin" || r === "super_admin")) {
        throw redirect({ to: "/admin" });
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in (e as Record<string, unknown>)) throw e;
    }
  },
  loader: async ({ context }) => context.queryClient.ensureQueryData(myProfileQuery),
  head: () => ({
    meta: [
      { title: "بوابة المريض | مجمع باعشن الطبي" },
      { name: "description", content: "الوصول الآمن إلى مواعيدك وتقاريرك ووصفاتك الطبية." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PatientLayout,
  errorComponent: PatientLayoutError,
  notFoundComponent: PatientLayoutNotFound,
});

function PatientLayout() {
  const { data: profile } = useSuspenseQuery(myProfileQuery);
  const [unread, setUnread] = useState<number>(0);
  const lang = (profile?.preferred_language as "ar" | "en" | undefined) ?? "ar";

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .is("read_at", null)
      .then(({ count }) => {
        if (!cancelled) setUnread(count ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return (
    <PatientShell
      lang={lang}
      userName={profile?.full_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      unreadCount={unread}
    >
      <Outlet />
    </PatientShell>
  );
}

function PatientLayoutError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl p-6">
      <ErrorState
        description={error.message}
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
    </div>
  );
}

function PatientLayoutNotFound() {
  return (
    <div className="mx-auto max-w-xl p-6">
      <EmptyState title="الصفحة غير موجودة" description="لم نعثر على الصفحة المطلوبة داخل البوابة." />
    </div>
  );
}
