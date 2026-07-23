/**
 * Phase 1 (Foundation Repair) — reusable state primitives.
 * Consolidates ad-hoc Loading / Empty / Error / Forbidden / Offline /
 * SessionExpired renders scattered across the app into one design-tokens-
 * aware surface. RTL-aware, no hardcoded colors, Tailwind + design tokens
 * only. Every message is bilingual (ar / en) with a plain-language `t()`
 * fallback so pages can render before i18n hydrates.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Inbox, Lock, RefreshCw, WifiOff, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Lang = "ar" | "en";

function useLang(): Lang {
  if (typeof document === "undefined") return "ar";
  return (document.documentElement.lang as Lang) === "en" ? "en" : "ar";
}

interface BaseProps {
  className?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

function StateShell({
  icon,
  title,
  description,
  action,
  className,
  tone = "muted",
}: BaseProps & { icon: React.ReactNode; tone?: "muted" | "warning" | "danger" }) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400"
        : "border-border bg-card text-muted-foreground";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border p-8 text-center",
        toneClass,
        className,
      )}
    >
      <div className="rounded-full bg-background/60 p-3 text-foreground/70">{icon}</div>
      {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
      {description && <p className="max-w-md text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* -------------------------------- Loading -------------------------------- */
export function LoadingState({ label, className }: { label?: string; className?: string }) {
  const lang = useLang();
  const text = label ?? (lang === "ar" ? "جارٍ التحميل…" : "Loading…");
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center justify-center gap-2 p-8 text-muted-foreground", className)}
    >
      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-sm">{text}</span>
    </div>
  );
}

/* ------------------------------- Skeletons ------------------------------- */
export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4">
          <Skeleton className="mb-3 h-32 w-full rounded-lg" />
          <Skeleton className="mb-2 h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Empty --------------------------------- */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: BaseProps & { icon?: React.ReactNode }) {
  const lang = useLang();
  return (
    <StateShell
      icon={icon ?? <Inbox className="h-6 w-6" aria-hidden />}
      title={title ?? (lang === "ar" ? "لا توجد بيانات لعرضها" : "No data to display")}
      description={
        description ??
        (lang === "ar" ? "لم نعثر على أي عنصر مطابق." : "We couldn't find anything to show here.")
      }
      action={action}
      className={className}
    />
  );
}

/* ---------------------------------- Error --------------------------------- */
export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: BaseProps & { onRetry?: () => void }) {
  const lang = useLang();
  return (
    <StateShell
      tone="danger"
      icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
      title={title ?? (lang === "ar" ? "حدث خطأ غير متوقع" : "Something went wrong")}
      description={
        description ??
        (lang === "ar"
          ? "تعذّر تحميل هذا الجزء. حاول مجددًا بعد قليل."
          : "We couldn't load this section. Please try again shortly.")
      }
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="me-2 h-4 w-4" aria-hidden />
            {lang === "ar" ? "إعادة المحاولة" : "Retry"}
          </Button>
        ) : undefined
      }
      className={className}
    />
  );
}

/* -------------------------------- Offline -------------------------------- */
export function OfflineState({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  const lang = useLang();
  return (
    <StateShell
      tone="warning"
      icon={<WifiOff className="h-6 w-6" aria-hidden />}
      title={lang === "ar" ? "لا يوجد اتصال بالإنترنت" : "You're offline"}
      description={
        lang === "ar"
          ? "تحقّق من اتصالك ثم أعِد المحاولة."
          : "Check your connection and try again."
      }
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="me-2 h-4 w-4" aria-hidden />
            {lang === "ar" ? "إعادة المحاولة" : "Retry"}
          </Button>
        ) : undefined
      }
      className={className}
    />
  );
}

/* ------------------------------- Forbidden ------------------------------- */
export function ForbiddenState({ className }: { className?: string }) {
  const lang = useLang();
  return (
    <StateShell
      tone="warning"
      icon={<Lock className="h-6 w-6" aria-hidden />}
      title={lang === "ar" ? "لا تملك صلاحية الوصول" : "Access denied"}
      description={
        lang === "ar"
          ? "هذه الصفحة تتطلّب صلاحيات لا تمتلكها. تواصل مع مسؤول النظام إن كنت تحتاجها."
          : "You don't have permission to view this page. Contact an administrator if you need access."
      }
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/">{lang === "ar" ? "العودة للرئيسية" : "Back to home"}</Link>
        </Button>
      }
      className={className}
    />
  );
}

/* ----------------------------- SessionExpired ---------------------------- */
export function SessionExpiredState({
  className,
  next,
}: {
  className?: string;
  /** Same-origin path to return to after re-authentication. */
  next?: string;
}) {
  const lang = useLang();
  const resolvedNext = React.useMemo(() => {
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    if (typeof window === "undefined") return undefined;
    // Preserve pathname + query + hash for an exact return-to-screen after re-auth.
    const path =
      window.location.pathname + window.location.search + window.location.hash;
    if (!path.startsWith("/patient") || path.startsWith("//")) return undefined;
    if (path.length > 2048) return undefined;
    return path;
  }, [next]);
  const loginSearch = resolvedNext ? { next: resolvedNext } : undefined;
  return (
    <StateShell
      tone="warning"
      icon={<Clock className="h-6 w-6" aria-hidden />}
      title={lang === "ar" ? "انتهت جلستك" : "Your session has expired"}
      description={
        lang === "ar"
          ? "لأسباب أمنية تم إنهاء جلستك. سجّل الدخول مجددًا للعودة إلى نفس الصفحة."
          : "For security reasons your session has ended. Sign in again to return to the same page."
      }
      action={
        <Button asChild size="lg" className="min-w-[12rem]">
          <Link
            to="/auth/login"
            search={loginSearch as never}
            aria-label={lang === "ar" ? "إعادة تسجيل الدخول" : "Re-authenticate"}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {lang === "ar" ? "إعادة تسجيل الدخول" : "Re-authenticate"}
          </Link>
        </Button>
      }
      className={className}
    />
  );
}

