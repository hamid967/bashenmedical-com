import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, Loader2 } from "lucide-react";
import { getMyPermissions } from "@/lib/rbac.functions";
import type { ReactNode } from "react";

export function useMyPermissions() {
  const fn = useServerFn(getMyPermissions);
  return useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => fn(),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

/**
 * Guards a page/section by permission key(s).
 * - `anyOf` (default): user needs at least one of the listed permissions.
 * - `allOf`: user needs all listed permissions.
 * super_admin always passes.
 */
export function RequirePermission({
  anyOf,
  allOf,
  children,
  fallback,
}: {
  anyOf?: string | string[];
  allOf?: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const q = useMyPermissions();

  if (q.isLoading) {
    return (
      <div className="container-app flex min-h-[40vh] items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        <span>جارٍ التحقق من الصلاحيات…</span>
      </div>
    );
  }
  if (q.isError) {
    return (
      <Denied
        title="تعذّر التحقق من الصلاحيات"
        message={(q.error as any)?.message ?? "أعد تحميل الصفحة أو سجّل الدخول مجدداً."}
      />
    );
  }

  const perms = new Set(q.data?.permissions ?? []);
  const isSuper = !!q.data?.isSuper;
  const anyList = anyOf ? (Array.isArray(anyOf) ? anyOf : [anyOf]) : [];
  const allList = allOf ? (Array.isArray(allOf) ? allOf : [allOf]) : [];

  const okAny = anyList.length === 0 || anyList.some((k) => perms.has(k));
  const okAll = allList.length === 0 || allList.every((k) => perms.has(k));
  const ok = isSuper || (okAny && okAll);

  if (!ok) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <Denied
        title="غير مصرّح بالوصول"
        message="هذه الصفحة تتطلب صلاحية إضافية. تواصل مع مسؤول النظام لطلب الوصول."
        required={[...anyList, ...allList]}
      />
    );
  }

  return <>{children}</>;
}

function Denied({
  title,
  message,
  required,
}: {
  title: string;
  message: string;
  required?: string[];
}) {
  return (
    <div className="container-app py-16">
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {required && required.length > 0 && (
          <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-semibold">الصلاحيات المطلوبة:</div>
            <ul className="space-y-0.5 font-mono">
              {required.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            to="/admin"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            لوحة التحكم
          </Link>
          <Link
            to="/"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          >
            الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
