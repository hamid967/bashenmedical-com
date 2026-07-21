import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal/PortalShell";
import { PortalCard } from "@/components/portal/ui";
import { getMyProfile } from "@/lib/portal/portal.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

const myProfileQuery = queryOptions({
  queryKey: ["portal", "my-profile"],
  queryFn: () => getMyProfile(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/portal")({
  loader: async ({ context }) => context.queryClient.ensureQueryData(myProfileQuery),
  head: () => ({
    meta: [
      { title: "بوابة المريض | مجمع باعشن الطبي" },
      { name: "description", content: "لوحة تحكم المريض في مجمع باعشن الطبي." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLayout,
  errorComponent: PortalError,
  notFoundComponent: PortalNotFound,
});

function PortalLayout() {
  const { data: profile } = useSuspenseQuery(myProfileQuery);
  const [unread, setUnread] = useState<number>(0);
  const lang = (profile?.preferred_language as "ar" | "en" | undefined) ?? "ar";

  // Live-refresh notification counter (Realtime)
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
    <PortalShell
      lang={lang}
      userName={profile?.full_name ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      unreadCount={unread}
    >
      <Outlet />
    </PortalShell>
  );
}

function PortalError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh grid place-items-center p-6">
      <PortalCard className="max-w-md w-full p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-[color:var(--portal-error-50)] text-[color:var(--portal-error)] mb-4">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-[color:var(--portal-ink)]">تعذّر تحميل البوابة</h2>
        <p className="text-sm text-[color:var(--portal-ink-2)] mt-2 break-words">
          {error.message || "حدث خطأ غير متوقع."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold text-[color:var(--portal-on-primary)]"
            style={{ background: "var(--portal-gradient)" }}
          >
            <RefreshCw className="h-4 w-4" />
            حاول مجددًا
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-4 h-10 text-sm font-semibold border border-[color:var(--portal-border)] bg-[color:var(--portal-surface)]"
          >
            <Home className="h-4 w-4" />
            الرئيسية
          </a>
        </div>
      </PortalCard>
    </div>
  );
}

function PortalNotFound() {
  return (
    <div className="portal-root portal-gradient-bg min-h-dvh grid place-items-center p-6">
      <PortalCard className="max-w-md w-full p-8 text-center">
        <h2 className="text-6xl font-bold text-[color:var(--portal-primary)]">404</h2>
        <p className="mt-2 text-sm text-[color:var(--portal-ink-2)]">الصفحة غير موجودة داخل البوابة.</p>
        <a
          href="/portal"
          className="mt-6 inline-flex rounded-full px-5 h-10 items-center text-sm font-semibold text-[color:var(--portal-on-primary)]"
          style={{ background: "var(--portal-gradient)" }}
        >
          العودة إلى الرئيسية
        </a>
      </PortalCard>
    </div>
  );
}
