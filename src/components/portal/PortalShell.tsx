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
  ScrollText,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { JazanPattern } from "@/components/jazan";

type NavItem = { to: string; icon: typeof LayoutDashboard; labelKey: string };
type NavGroup = { id: string; labelKey: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    labelKey: "groups.home",
    items: [
      { to: "/portal", icon: LayoutDashboard, labelKey: "items.dashboard" },
      { to: "/portal/dashboard", icon: LayoutDashboard, labelKey: "items.overview" },
    ],
  },
  {
    id: "visits",
    labelKey: "groups.visits",
    items: [
      { to: "/portal/appointments", icon: CalendarClock, labelKey: "items.myAppointments" },
      { to: "/portal/book", icon: CalendarPlus, labelKey: "items.bookAppointment" },
      { to: "/portal/schedule", icon: CalendarClock, labelKey: "items.schedule" },
      { to: "/portal/family", icon: Users, labelKey: "items.family" },
    ],
  },
  {
    id: "medical",
    labelKey: "groups.medical",
    items: [
      { to: "/portal/records", icon: FileText, labelKey: "items.records" },
      { to: "/portal/prescriptions", icon: Pill, labelKey: "items.prescriptions" },
      { to: "/portal/laboratory", icon: FlaskConical, labelKey: "items.laboratory" },
      { to: "/portal/radiology", icon: ScanLine, labelKey: "items.radiology" },
      { to: "/portal/consents", icon: ShieldCheck, labelKey: "items.consents" },
    ],
  },
  {
    id: "billing",
    labelKey: "groups.billing",
    items: [
      { to: "/portal/invoices", icon: ReceiptText, labelKey: "items.invoices" },
      { to: "/portal/payments", icon: CreditCard, labelKey: "items.payments" },
      { to: "/portal/refunds", icon: RotateCcw, labelKey: "items.refunds" },
      { to: "/portal/insurance", icon: ShieldCheck, labelKey: "items.insurance" },
      { to: "/portal/orders", icon: Inbox, labelKey: "items.orders" },
    ],
  },
  {
    id: "comms",
    labelKey: "groups.comms",
    items: [
      { to: "/portal/doctors", icon: Users, labelKey: "items.myDoctors" },
      { to: "/portal/notifications", icon: Bell, labelKey: "items.notifications" },
      { to: "/portal/inquiries", icon: MessageSquareWarning, labelKey: "items.inquiries" },
      { to: "/portal/complaints", icon: MessageSquareWarning, labelKey: "items.complaints" },
    ],
  },
  {
    id: "account",
    labelKey: "groups.account",
    items: [
      { to: "/portal/profile", icon: User, labelKey: "items.profile" },
      { to: "/portal/assistant", icon: Sparkles, labelKey: "items.assistant" },
      { to: "/portal/sessions", icon: ShieldCheck, labelKey: "items.sessions" },
      { to: "/portal/audit-log", icon: ScrollText, labelKey: "items.auditLog" },
      { to: "/portal/reminder-preferences", icon: Bell, labelKey: "items.reminderPrefs" },
      { to: "/portal/settings", icon: Settings, labelKey: "items.settings" },
    ],
  },
];

const BOTTOM_NAV: NavItem[] = [
  { to: "/portal", icon: LayoutDashboard, labelKey: "bottom.home" },
  { to: "/portal/appointments", icon: CalendarClock, labelKey: "bottom.visits" },
  { to: "/portal/book", icon: CalendarPlus, labelKey: "bottom.book" },
  { to: "/portal/records", icon: FileText, labelKey: "bottom.records" },
  { to: "/portal/profile", icon: User, labelKey: "bottom.profile" },
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
  const { t } = useTranslation("portalShell");
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
          <JazanPattern
            variant="subtle"
            orientation="vertical"
            className="absolute inset-y-0 end-0 w-6 opacity-40 pointer-events-none"
          />
          <SidebarBrand t={t} />
          <SidebarNav t={t} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          <SidebarFooter
            t={t}
            onSignOut={handleSignOut}
            userName={userName}
            avatarUrl={avatarUrl}
          />
        </aside>

        {/* Main column */}
        <div className="flex flex-col min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-20 h-16 flex items-center gap-3 px-4 md:px-6 border-b border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)]/70 backdrop-blur-xl relative">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--jazan-gold,#C7A46B) 40%, var(--jazan-terracotta,#B85C3C) 60%, transparent)",
                opacity: 0.35,
              }}
            />
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden inline-grid place-items-center h-10 w-10 rounded-full hover:bg-[color:var(--portal-gradient-soft)]"
              aria-label={t("menu")}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden md:flex items-center gap-2 h-11 flex-1 max-w-xl rounded-full bg-[color:var(--portal-surface-1)] border border-[color:var(--portal-border)] px-4 shadow-sm">
              <Search className="h-4 w-4 text-[color:var(--portal-ink-3)]" />
              <input
                dir={dir}
                placeholder={t("searchPlaceholder")}
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
              aria-label={t("notifications")}
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
                  {userName ?? t("patientFallback")}
                </div>
                <div className="text-[11px] text-[color:var(--portal-ink-3)]">
                  {t("patientAccount")}
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
        aria-label={t("quickNav")}
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-surface-1)]/95 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-5">
          {BOTTOM_NAV.map((item) => {
            const active =
              pathname === item.to || (item.to !== "/portal" && pathname.startsWith(item.to));
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
                  <span className="truncate max-w-[64px]">{t(item.labelKey)}</span>
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
            <SidebarBrand t={t} onClose={() => setMobileOpen(false)} />
            <SidebarNav t={t} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter
              t={t}
              onSignOut={handleSignOut}
              userName={userName}
              avatarUrl={avatarUrl}
            />
          </aside>
        </div>
      )}

      {/* AI FAB */}
      <button
        aria-label={t("assistant")}
        className="fixed bottom-24 lg:bottom-5 end-5 z-40 h-14 w-14 rounded-full grid place-items-center text-[color:var(--portal-on-primary)] shadow-[0_20px_60px_-15px_rgba(15,108,189,0.55)] hover:scale-105 transition-transform"
        style={{ background: "var(--portal-gradient)" }}
      >
        <Sparkles className="h-6 w-6" />
      </button>
    </div>
  );
}

type TFn = (key: string) => string;

function SidebarBrand({ t, onClose }: { t: TFn; onClose?: () => void }) {
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
          {t("brand")}
        </div>
        <div className="text-[11px] text-[color:var(--portal-ink-3)] tracking-wide uppercase">
          {t("brandSub")}
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
  t,
  pathname,
  onNavigate,
}: {
  t: TFn;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto p-3" aria-label={t("primary")}>
      <ul className="space-y-4">
        {NAV_GROUPS.map((group) => (
          <li key={group.id}>
            <div className="px-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--portal-ink-3)]">
              {t(group.labelKey)}
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
                      <span className="truncate">{t(item.labelKey)}</span>
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
  t,
  onSignOut,
  userName,
  avatarUrl,
}: {
  t: TFn;
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
            {userName ?? t("patientFallback")}
          </div>
          <div className="text-[11px] text-[color:var(--portal-ink-3)]">{t("patient")}</div>
        </div>
        <button
          onClick={onSignOut}
          aria-label={t("signOut")}
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
