/**
 * Phase 5 — Premium Patient Portal Shell.
 * Top bar (logo, notifications, avatar) + fixed mobile bottom nav.
 * RTL-safe, uses design tokens, wraps children with error boundary + offline detection.
 */
import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, User, LogOut, Home, CalendarDays, FileText, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

import { FeatureErrorBoundary } from "@/components/states/FeatureErrorBoundary";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

type NavItem = { to: string; label_ar: string; label_en: string; icon: React.ComponentType<{ className?: string }> };

const NAV: NavItem[] = [
  { to: "/patient", label_ar: "الرئيسية", label_en: "Home", icon: Home },
  { to: "/patient/appointments", label_ar: "مواعيدي", label_en: "Appointments", icon: CalendarDays },
  { to: "/book", label_ar: "احجز", label_en: "Book", icon: CalendarPlus },
  { to: "/patient/reports", label_ar: "تقاريري", label_en: "Reports", icon: FileText },
  { to: "/patient/profile", label_ar: "حسابي", label_en: "Account", icon: User },
];

export function PatientShell({
  children,
  userName,
  avatarUrl,
  unreadCount = 0,
  lang = "ar",
}: {
  children: React.ReactNode;
  userName?: string | null;
  avatarUrl?: string | null;
  unreadCount?: number;
  lang?: "ar" | "en";
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [online, setOnline] = React.useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const initials = React.useMemo(() => {
    if (!userName) return "؟";
    return userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }, [userName]);

  const handleSignOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }, []);

  const isActive = (to: string) => (to === "/patient" ? pathname === "/patient" : pathname.startsWith(to));

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/patient" className="flex items-center gap-2">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold text-primary-foreground"
              style={{ background: "linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))" }}
              aria-hidden
            >
              ب
            </span>
            <span className="text-sm font-semibold">
              {lang === "ar" ? "مجمع باعشن" : "Baeshen Medical"}
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/patient/notifications"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border hover:bg-accent"
              aria-label={lang === "ar" ? "التنبيهات" : "Notifications"}
            >
              <Bell className="h-4 w-4" aria-hidden />
              {unreadCount > 0 && (
                <Badge className="absolute -end-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-9 min-w-9 items-center gap-2 rounded-full border px-2 hover:bg-accent"
                aria-label={lang === "ar" ? "قائمة الحساب" : "Account menu"}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {initials}
                  </span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{userName ?? (lang === "ar" ? "حسابي" : "Account")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/patient/profile">
                    <User className="me-2 h-4 w-4" aria-hidden />
                    {lang === "ar" ? "الملف الشخصي" : "Profile"}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/patient/security">
                    <User className="me-2 h-4 w-4" aria-hidden />
                    {lang === "ar" ? "الأمان" : "Security"}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/patient/family">
                    <User className="me-2 h-4 w-4" aria-hidden />
                    {lang === "ar" ? "أفراد الأسرة" : "Family"}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut}>
                  <LogOut className="me-2 h-4 w-4" aria-hidden />
                  {lang === "ar" ? "تسجيل الخروج" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:pb-8">
        {!online && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <span>
              {lang === "ar"
                ? "أنت غير متصل — نعرض آخر بيانات محفوظة."
                : "You are offline — showing the latest cached data."}
            </span>
            <button
              type="button"
              onClick={() => location.reload()}
              className="rounded-md border border-amber-500/40 px-2 py-1 text-[11px] font-medium hover:bg-amber-500/20"
            >
              {lang === "ar" ? "إعادة المحاولة" : "Retry"}
            </button>
          </div>
        )}
        <FeatureErrorBoundary feature="patient-portal">{children}</FeatureErrorBoundary>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label={lang === "ar" ? "التنقل السريع" : "Quick nav"}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(item.to);
            const isBook = item.to === "/book";
            return (
              <li key={item.to} className="flex items-center justify-center">
                <Link
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
                    isBook
                      ? "-mt-4 h-14 w-14 rounded-full text-primary-foreground shadow-lg"
                      : active
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                  )}
                  style={
                    isBook
                      ? { background: "linear-gradient(135deg,hsl(var(--primary)),hsl(var(--accent)))" }
                      : undefined
                  }
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon className={isBook ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
                  <span className={isBook ? "text-[10px] font-semibold" : ""}>
                    {lang === "ar" ? item.label_ar : item.label_en}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
