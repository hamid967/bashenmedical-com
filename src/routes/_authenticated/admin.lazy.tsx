import { createLazyFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AdminShellV2 } from "@/components/admin/v2/AdminShellV2";
import type { AdminRole } from "@/components/admin/types";
import { AlertTriangle, RefreshCw, ShieldAlert, Home } from "lucide-react";
import { rolesQuery, profileQuery, ADMIN_CONSOLE_ROLES } from "./admin";

/**
 * Lazy chunk: AdminShell + UI-only boundaries. Only loaded on first
 * navigation into /admin/*. The critical bundle keeps just the guard.
 */
export const Route = createLazyFileRoute("/_authenticated/admin")({
  component: AdminLayout,
  errorComponent: AdminError,
  notFoundComponent: AdminNotFound,
});

function AdminLayout() {
  const { data: rolesData } = useSuspenseQuery(rolesQuery);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const roles = (rolesData?.roles ?? []) as AdminRole[];
  const allowed = roles.some((r) => ADMIN_CONSOLE_ROLES.includes(r));

  if (!allowed) {
    return (
      <div className="admin-console min-h-dvh grid place-items-center p-6" dir="rtl">
        <div className="ac-card max-w-md w-full p-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">لا تملك صلاحية الوصول</h1>
          <p className="mt-2 text-sm text-[color:var(--ac-ink-3)]">
            لوحة الإدارة مخصصة للطاقم الطبي والإداري. تواصل مع المسؤول لطلب الصلاحية.
          </p>
          <a
            href="/portal"
            className="mt-6 inline-flex items-center gap-2 rounded-full px-5 h-10 bg-[color:var(--ac-accent)] text-white text-sm font-semibold"
          >
            <Home className="h-4 w-4" /> الذهاب إلى بوابة المريض
          </a>
        </div>
      </div>
    );
  }

  return (
    <AdminShellV2 roles={roles} userName={profile?.full_name ?? null}>
      <Outlet />
    </AdminShellV2>
  );
}

function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="admin-console min-h-dvh grid place-items-center p-6" dir="rtl">
      <div className="ac-card max-w-md w-full p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-red-50 text-red-500 mb-4">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold">تعذّر تحميل لوحة الإدارة</h2>
        <p className="mt-2 text-sm text-[color:var(--ac-ink-3)] break-words">
          {error.message || "حدث خطأ غير متوقع."}
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center gap-2 rounded-full px-5 h-10 bg-[color:var(--ac-accent)] text-white text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

function AdminNotFound() {
  return (
    <div className="admin-console min-h-dvh grid place-items-center p-6" dir="rtl">
      <div className="ac-card max-w-md w-full p-8 text-center">
        <h2 className="text-6xl font-bold text-[color:var(--ac-accent)]">404</h2>
        <p className="mt-2 text-sm text-[color:var(--ac-ink-3)]">
          الصفحة غير موجودة داخل لوحة الإدارة.
        </p>
        <a
          href="/admin"
          className="mt-6 inline-flex rounded-full px-5 h-10 items-center text-white text-sm font-semibold bg-[color:var(--ac-accent)]"
        >
          العودة إلى اللوحة الرئيسية
        </a>
      </div>
    </div>
  );
}
