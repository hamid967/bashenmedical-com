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

const NAV: NavItem[] = [
  { to: "/portal", icon: LayoutDashboard, label_ar: "الرئيسية", label_en: "Dashboard" },
  { to: "/portal/dashboard", icon: LayoutDashboard, label_ar: "لوحة التحكم", label_en: "Overview" },
  { to: "/portal/appointments", icon: CalendarClock, label_ar: "مواعيدي", label_en: "My Appointments" },
  { to: "/portal/calendar", icon: CalendarClock, label_ar: "التقويم", label_en: "Calendar" },
  { to: "/portal/schedule", icon: CalendarClock, label_ar: "جدولي (طبيب)", label_en: "My Schedule (Doctor)" },
  { to: "/portal/book", icon: CalendarPlus, label_ar: "حجز موعد", label_en: "Book Appointment" },
  { to: "/portal/doctors", icon: Users, label_ar: "أطبائي", label_en: "My Doctors" },
  { to: "/portal/family", icon: Users, label_ar: "أفراد العائلة", label_en: "Family" },
  { to: "/portal/records", icon: FileText, label_ar: "السجل الطبي", label_en: "Medical Records" },
  { to: "/portal/laboratory", icon: FlaskConical, label_ar: "نتائج المختبر", label_en: "Laboratory" },
  { to: "/portal/radiology", icon: ScanLine, label_ar: "الأشعة", label_en: "Radiology" },
  { to: "/portal/prescriptions", icon: Pill, label_ar: "الوصفات", label_en: "Prescriptions" },
  { to: "/portal/insurance", icon: ShieldCheck, label_ar: "التأمين", label_en: "Insurance" },
  { to: "/portal/invoices", icon: ReceiptText, label_ar: "الفواتير", label_en: "Invoices" },
  { to: "/portal/payments", icon: CreditCard, label_ar: "المدفوعات", label_en: "Payments" },
  { to: "/portal/refunds", icon: RotateCcw, label_ar: "طلبات الاسترداد", label_en: "Refunds" },
  { to: "/portal/notifications", icon: Bell, label_ar: "الإشعارات", label_en: "Notifications" },
  { to: "/portal/reminder-preferences", icon: Bell, label_ar: "تفضيلات قنوات الإشعار", label_en: "Notification Channels" },
  { to: "/portal/orders", icon: Inbox, label_ar: "طلباتي", label_en: "My Orders" },
  { to: "/portal/inquiries", icon: MessageSquareWarning, label_ar: "استفساراتي", label_en: "My Inquiries" },
  { to: "/portal/complaints", icon: MessageSquareWarning, label_ar: "الشكاوى والمقترحات", label_en: "Complaints" },
  { to: "/portal/consents", icon: ShieldCheck, label_ar: "الموافقات والخصوصية", label_en: "Consents & Privacy" },
  { to: "/portal/profile", icon: User, label_ar: "الملف الشخصي", label_en: "Profile" },
  { to: "/portal/sessions", icon: ShieldCheck, label_ar: "الجلسات النشطة", label_en: "Active Sessions" },
  { to: "/portal/settings", icon: Settings, label_ar: "الإعدادات", label_en: "Settings" },
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
        <aside className="hidden lg:flex flex-col border-e border-[color:var(--portal-border)] bg-white/80 backdrop-blur-xl sticky top-0 h-dvh relative overflow-hidden">
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
          <header className="sticky top-0 z-20 h-16 flex items-center gap-3 px-4 md:px-6 border-b border-[color:var(--portal-border)] bg-white/70 backdrop-blur-xl relative">
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--jazan-gold,#C7A46B) 40%, var(--jazan-terracotta,#B85C3C) 60%, transparent)", opacity: 0.35 }} />
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden inline-grid place-items-center h-10 w-10 rounded-full hover:bg-[color:var(--portal-gradient-soft)]"
              aria-label={isAr ? "القائمة" : "Menu"}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden md:flex items-center gap-2 h-11 flex-1 max-w-xl rounded-full bg-white border border-[color:var(--portal-border)] px-4 shadow-sm">
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
                <span className="absolute top-1 end-1 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-[color:var(--portal-error)] text-white text-[10px] font-semibold">
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

          {/* Page content */}
          <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>

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
            className="absolute top-0 bottom-0 w-[280px] bg-white shadow-2xl flex flex-col
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
        className="fixed bottom-5 end-5 z-30 h-14 w-14 rounded-full grid place-items-center text-white shadow-[0_20px_60px_-15px_rgba(15,108,189,0.55)] hover:scale-105 transition-transform"
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
        className="h-11 w-11 rounded-2xl grid place-items-center text-white font-bold text-lg shadow-md"
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
    <nav className="flex-1 overflow-y-auto p-3">
      <ul className="space-y-1">
        {NAV.map((item) => {
          const active =
            pathname === item.to ||
            (item.to !== "/portal" && pathname.startsWith(item.to + "/")) ||
            (item.to !== "/portal" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                className={
                  "flex items-center gap-3 px-3.5 h-11 rounded-2xl text-sm font-medium transition-all " +
                  (active
                    ? "text-white shadow-[0_10px_30px_-15px_rgba(15,108,189,0.6)]"
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
          className="h-9 w-9 grid place-items-center rounded-xl bg-white hover:bg-white/90 text-[color:var(--portal-ink-2)] hover:text-[color:var(--portal-error)]"
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
        className="rounded-full object-cover ring-2 ring-white shadow-sm"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full grid place-items-center text-white font-semibold ring-2 ring-white shadow-sm"
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
