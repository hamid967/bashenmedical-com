import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  CalendarPlus,
  Users,
  FileText,
  FlaskConical,
  ScanLine,
  Pill,
  ShieldCheck,
  ReceiptText,
  CreditCard,
  Bell,
  User,
  Settings,
  LogOut,
  Search,
  Sparkles,
  Menu,
  MessageSquareWarning,
  CalendarClock,
  RotateCcw,
  Inbox,
} from "lucide-react";
import { useState } from "react";
import { JazanPattern } from "@/components/jazan";

type NavItem = { to: string; icon: typeof LayoutDashboard; label_ar: string; label_en: string };
type NavGroup = { id: string; label_ar: string; label_en: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label_ar: "الرئيسية",
    label_en: "Home",
    items: [
      { to: "/portal", icon: LayoutDashboard, label_ar: "الرئيسية", label_en: "Dashboard" },
      { to: "/portal/dashboard", icon: LayoutDashboard, label_ar: "لوحة التحكم", label_en: "Overview" },
    ],
  },
  {
    id: "visits",
    label_ar: "الحجوزات",
    label_en: "Appointments",
    items: [
      { to: "/portal/appointments", icon: CalendarClock, label_ar: "مواعيدي", label_en: "My Appointments" },
      { to: "/portal/book", icon: CalendarPlus, label_ar: "حجز موعد", label_en: "Book Appointment" },
      { to: "/portal/calendar", icon: CalendarClock, label_ar: "التقويم", label_en: "Calendar" },
      { to: "/portal/schedule", icon: CalendarClock, label_ar: "جدولي (طبيب)", label_en: "My Schedule" },
      { to: "/portal/family", icon: Users, label_ar: "أفراد العائلة", label_en: "Family" },
    ],
  },
  {
    id: "medical",
    label_ar: "السجل الطبي",
    label_en: "Medical Records",
    items: [
      { to: "/portal/records", icon: FileText, label_ar: "السجل الطبي", label_en: "Records" },
      { to: "/portal/prescriptions", icon: Pill, label_ar: "الوصفات", label_en: "Prescriptions" },
      { to: "/portal/laboratory", icon: FlaskConical, label_ar: "المختبر", label_en: "Laboratory" },
      { to: "/portal/radiology", icon: ScanLine, label_ar: "الأشعة", label_en: "Radiology" },
      { to: "/portal/consents", icon: ShieldCheck, label_ar: "الموافقات والخصوصية", label_en: "Consents" },
    ],
  },
  {
    id: "billing",
    label_ar: "المدفوعات",
    label_en: "Billing",
    items: [
      { to: "/portal/invoices", icon: ReceiptText, label_ar: "الفواتير", label_en: "Invoices" },
      { to: "/portal/payments", icon: CreditCard, label_ar: "المدفوعات", label_en: "Payments" },
      { to: "/portal/refunds", icon: RotateCcw, label_ar: "الاسترداد", label_en: "Refunds" },
      { to: "/portal/insurance", icon: ShieldCheck, label_ar: "التأمين", label_en: "Insurance" },
      { to: "/portal/orders", icon: Inbox, label_ar: "طلباتي", label_en: "My Orders" },
    ],
  },
  {
    id: "comms",
    label_ar: "التواصل",
    label_en: "Messages",
    items: [
      { to: "/portal/doctors", icon: Users, label_ar: "أطبائي", label_en: "My Doctors" },
      { to: "/portal/notifications", icon: Bell, label_ar: "الإشعارات", label_en: "Notifications" },
      { to: "/portal/inquiries", icon: MessageSquareWarning, label_ar: "استفساراتي", label_en: "Inquiries" },
      { to: "/portal/complaints", icon: MessageSquareWarning, label_ar: "الشكاوى", label_en: "Complaints" },
    ],
  },
  {
    id: "account",
    label_ar: "الحساب",
    label_en: "Account",
    items: [
      { to: "/portal/profile", icon: User, label_ar: "الملف الشخصي", label_en: "Profile" },
      { to: "/portal/sessions", icon: ShieldCheck, label_ar: "الجلسات النشطة", label_en: "Sessions" },
      { to: "/portal/reminder-preferences", icon: Bell, label_ar: "تفضيلات الإشعار", label_en: "Reminder Prefs" },
      { to: "/portal/settings", icon: Settings, label_ar: "الإعدادات", label_en: "Settings" },
    ],
  },
];

const BOTTOM_NAV: NavItem[] = [
  { to: "/portal", icon: LayoutDashboard, label_ar: "الرئيسية", label_en: "Home" },
  { to: "/portal/appointments", icon: CalendarClock, label_ar: "مواعيدي", label_en: "Visits" },
  { to: "/portal/book", icon: CalendarPlus, label_ar: "احجز", label_en: "Book" },
  { to: "/portal/records", icon: FileText, label_ar: "سجلي", label_en: "Records" },
  { to: "/portal/profile", icon: User, label_ar: "حسابي", label_en: "Me" },
];


export function PortalShell({
  children,
  lang = "ar",
  userName,
  avatarUrl,
  unreadCount = 0,
}: {
  children: ReactNode;
  lang?: "ar" | "en";
  userName?: string | null;
  avatarUrl?: string | null;
  unreadCount?: number;
}) {
  const isAr = lang === "ar";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const dir = isAr ? "rtl" : "ltr";

  return (
    <div dir={dir} className="portal-root portal-gradient-bg font-sans">
      <div className="min-h-dvh grid lg:grid-cols-[280px_1fr]">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex flex-col border-e border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)]/80 backdrop-blur-xl sticky top-0 h-dvh relative overflow-hidden">
          <JazanPattern variant="subtle" orientation="vertical" className="absolute inset-y-0 end-0 w-6 opacity-40 pointer-events-none" />
          <SidebarBrand isAr={isAr} />
          <SidebarNav
            isAr={isAr}
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
          <SidebarFooter isAr={isAr} onSignOut={handleSignOut} userName={userName} avatarUrl={avatarUrl} />
        </aside>

        {/* Main column */}
        <div className="flex flex-col min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-20 h-16 flex items-center gap-3 px-4 md:px-6 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)]/70 backdrop-blur-xl relative">
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--jazan-gold,#C7A46B) 40%, var(--jazan-terracotta,#B85C3C) 60%, transparent)", opacity: 0.35 }} />
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden inline-grid place-items-center h-10 w-10 rounded-full hover:bg-[color:var(--portal-gradient-soft)]"
              aria-label={isAr ? "القائمة" : "Menu"}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden md:flex items-center gap-2 h-11 flex-1 max-w-xl rounded-full bg-[color:var(--portal-surface-1)] border border-[color:var(--portal-border)] px-4 shadow-sm">
              <Search className="h-4 w-4 text-[color:var(--portal-ink-3)]" />
              <input
                dir={dir}
                placeholder={isAr ? "ابحث عن طبيب، خدمة، تقرير..." : "Search doctors, services, reports..."}
                className="bg-transparent outline-none text-sm flex-1 placeholder:text-[color:var(--portal-ink-3)]"
              />
              <kbd className="hidden lg:inline text-[10px] text-[color:var(--portal-ink-3)] border border-[color:var(--portal-border)] rounded px-1.5 py-0.5">
                ⌘K
              </kbd>
            </div>

            <div className="flex-1 md:hidden" />

            <Link
              to="/portal/notifications"
              className="relative inline-grid place-items-center h-10 w-10 rounded-full hover:bg-[color:var(--portal-gradient-soft)]"
              aria-label={isAr ? "الإشعارات" : "Notifications"}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 end-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[color:var(--portal-error)] text-[color:var(--portal-on-primary)] text-[10px] font-semibold">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>

            <div className="flex items-center gap-2 ps-2 border-s border-[color:var(--portal-border)]">
              <Avatar name={userName ?? "?"} url={avatarUrl} size={36} />
              <div className="hidden md:block leading-tight">
                <div className="text-sm font-semibold text-[color:var(--portal-ink)] truncate max-w-[160px]">
                  {userName ?? (isAr ? "مريض" : "Patient")}
                </div>
                <div className="text-[11px] text-[color:var(--portal-ink-3)]">
                  {isAr ? "حساب مريض" : "Patient account"}
                </div>
              </div>
            </div>
          </header>

          {/* Page content — bottom padding on mobile so bottom nav doesn't cover it */}
          <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 pb-24 lg:pb-8">{children}</main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav
        dir={dir}
        aria-label={isAr ? "التنقّل السريع" : "Quick nav"}
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)]/95 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {BOTTOM_NAV.map((item) => {
            const active =
              pathname === item.to ||
              (item.to !== "/portal" && pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={
                    "flex flex-col items-center justify-center gap-0.5 h-16 text-[10px] font-semibold transition-colors " +
                    (active
                      ? "text-[color:var(--portal-primary)]"
                      : "text-[color:var(--portal-ink-3)] hover:text-[color:var(--portal-primary)]")
                  }
                >
                  <span
                    className={
                      "h-8 w-8 grid place-items-center rounded-full transition " +
                      (active ? "bg-[color:var(--portal-gradient-soft)]" : "")
                    }
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="truncate max-w-[64px]">{isAr ? item.label_ar : item.label_en}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile sidebar drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Close menu"
          />
          <aside
            dir={dir}
            className="absolute top-0 bottom-0 w-[280px] bg-[color:var(--portal-surface-1)] shadow-2xl flex flex-col
              ltr:left-0 rtl:right-0"
          >
            <SidebarBrand isAr={isAr} onClose={() => setMobileOpen(false)} />
            <SidebarNav
              isAr={isAr}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <SidebarFooter isAr={isAr} onSignOut={handleSignOut} userName={userName} avatarUrl={avatarUrl} />
          </aside>
        </div>
      )}

      {/* AI FAB */}
      <button
        aria-label={isAr ? "المساعد الذكي" : "AI Assistant"}
        className="fixed bottom-24 lg:bottom-5 end-5 z-40 h-14 w-14 rounded-full grid place-items-center text-[color:var(--portal-on-primary)] shadow-[0_20px_60px_-15px_rgba(15,108,189,0.55)] hover:scale-105 transition-transform"
        style={{ background: "var(--portal-gradient)" }}
      >
        <Sparkles className="h-6 w-6" />
      </button>
    </div>
  );
}

function SidebarBrand({ isAr, onClose }: { isAr: boolean; onClose?: () => void }) {
  return (
    <div className="h-20 px-5 flex items-center gap-3 border-b border-[color:var(--portal-border)]">
      <div
        className="h-11 w-11 rounded-2xl grid place-items-center text-[color:var(--portal-on-primary)] font-bold text-lg shadow-md"
        style={{ background: "var(--portal-gradient)" }}
      >
        ب
      </div>
      <div className="leading-tight flex-1 min-w-0">
        <div className="text-[15px] font-bold text-[color:var(--portal-ink)] truncate">
          {isAr ? "مجمع باعشن الطبي" : "Baashen Medical"}
        </div>
        <div className="text-[11px] text-[color:var(--portal-ink-3)] tracking-wide uppercase">
          {isAr ? "بوابة المريض" : "Patient Portal"}
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="h-8 w-8 rounded-full grid place-items-center hover:bg-[color:var(--portal-gradient-soft)]"
          aria-label="Close"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function SidebarNav({
  isAr,
  pathname,
  onNavigate,
}: {
  isAr: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto p-3" aria-label={isAr ? "التنقل الرئيسي" : "Primary"}>
      <ul className="space-y-4">
        {NAV_GROUPS.map((group) => (
          <li key={group.id}>
            <div className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--portal-ink-3)]">
              {isAr ? group.label_ar : group.label_en}
            </div>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active =
                  pathname === item.to ||
                  (item.to !== "/portal" && pathname.startsWith(item.to + "/")) ||
                  (item.to !== "/portal" && pathname === item.to);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={
                        "flex items-center gap-3 px-3.5 h-11 rounded-2xl text-sm font-medium transition-all portal-focus-ring " +
                        (active
                          ? "text-[color:var(--portal-on-primary)] shadow-[var(--portal-shadow-elevated)]"
                          : "text-[color:var(--portal-ink-2)] hover:bg-[color:var(--portal-gradient-soft)] hover:text-[color:var(--portal-primary)]")
                      }
                      style={active ? { background: "var(--portal-gradient)" } : undefined}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{isAr ? item.label_ar : item.label_en}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}


function SidebarFooter({
  isAr,
  onSignOut,
  userName,
  avatarUrl,
}: {
  isAr: boolean;
  onSignOut: () => void;
  userName?: string | null;
  avatarUrl?: string | null;
}) {
  return (
    <div className="p-3 border-t border-[color:var(--portal-border)]">
      <div className="flex items-center gap-3 p-2 rounded-2xl bg-[color:var(--portal-gradient-soft)]">
        <Avatar name={userName ?? "?"} url={avatarUrl} size={38} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[color:var(--portal-ink)] truncate">
            {userName ?? (isAr ? "مريض" : "Patient")}
          </div>
          <div className="text-[11px] text-[color:var(--portal-ink-3)]">
            {isAr ? "حساب مريض" : "Patient"}
          </div>
        </div>
        <button
          onClick={onSignOut}
          aria-label={isAr ? "تسجيل خروج" : "Sign out"}
          className="h-9 w-9 grid place-items-center rounded-xl bg-[color:var(--portal-surface-1)] hover:bg-[color:var(--portal-surface-1)]/90 text-[color:var(--portal-ink-2)] hover:text-[color:var(--portal-error)]"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-[color:var(--portal-surface-1)] shadow-sm"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full grid place-items-center text-[color:var(--portal-on-primary)] font-semibold ring-2 ring-[color:var(--portal-surface-1)] shadow-sm"
      style={{
        width: size,
        height: size,
        background: "var(--portal-gradient)",
        fontSize: size * 0.4,
      }}
    >
      {initials}
    </div>
  );
}
