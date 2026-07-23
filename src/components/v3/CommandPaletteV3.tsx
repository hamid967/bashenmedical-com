/**
 * V3 Command Palette — role-aware global launcher (Cmd/Ctrl + K).
 *
 * Reuses the same visual language as the admin palette but ships in the
 * root layout so every route (public + portal + admin) can open it.
 * Quick actions surface based on the caller's role set:
 *   - Everyone: home, book, doctors, contact, portal
 *   - Authenticated: portal shortcuts (appointments, reservations, orders)
 *   - Admin / super_admin: admin console shortcuts
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import {
  Search,
  Home,
  Calendar,
  Stethoscope,
  Phone,
  User,
  Inbox,
  LayoutDashboard,
  ShieldCheck,
  Gauge,
  FileBarChart,
  Sparkles,
  MessageSquare,
  Package,
  ArrowRight,
} from "lucide-react";

type Role = "admin" | "super_admin" | "editor" | "authenticated" | "guest";

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  roles?: Role[]; // omitted = everyone
};

const ITEMS: Item[] = [
  { to: "/", label: "الرئيسية", icon: Home, group: "الموقع" },
  { to: "/book", label: "احجز موعدًا", icon: Calendar, group: "الموقع" },
  { to: "/doctors", label: "الأطباء", icon: Stethoscope, group: "الموقع" },
  { to: "/contact", label: "تواصل معنا", icon: Phone, group: "الموقع" },
  { to: "/reservations/manage", label: "إدارة حجزك (ضيف)", icon: Calendar, group: "الموقع" },

  { to: "/portal", label: "بوابة المريض", icon: User, group: "حسابي", roles: ["authenticated"] },
  { to: "/portal/appointments", label: "مواعيدي", icon: Calendar, group: "حسابي", roles: ["authenticated"] },
  { to: "/portal/family", label: "أسرتي", icon: User, group: "حسابي", roles: ["authenticated"] },
  { to: "/my-orders", label: "طلباتي", icon: Package, group: "حسابي", roles: ["authenticated"] },

  { to: "/admin", label: "لوحة القيادة", icon: LayoutDashboard, group: "الإدارة", roles: ["admin", "super_admin"] },
  { to: "/admin/inbox", label: "الصندوق الموحد", icon: Inbox, group: "الإدارة", roles: ["admin", "super_admin"] },
  { to: "/admin/service-inquiries", label: "طلبات واتساب", icon: MessageSquare, group: "الإدارة", roles: ["admin", "super_admin"] },
  { to: "/admin/booking-funnel", label: "قمع الحجوزات", icon: FileBarChart, group: "الإدارة", roles: ["admin", "super_admin"] },
  { to: "/admin/realtime-monitor", label: "مراقبة Realtime", icon: Gauge, group: "الإدارة", roles: ["admin", "super_admin"] },
  { to: "/admin/audit-logs", label: "سجل التدقيق", icon: ShieldCheck, group: "الإدارة", roles: ["admin", "super_admin"] },
  { to: "/admin/web-vitals", label: "Web Vitals", icon: FileBarChart, group: "الإدارة", roles: ["admin", "super_admin"] },
  { to: "/admin/ai-streaming", label: "مراقبة AI Streaming", icon: Sparkles, group: "الإدارة", roles: ["admin", "super_admin"] },
  { to: "/admin/v3", label: "ترقية V3", icon: Sparkles, group: "الإدارة", roles: ["admin", "super_admin"] },
];

function matchesRole(item: Item, roles: Set<Role>): boolean {
  // Admin accounts are unlinked from the patient portal — hide portal items.
  const isAdmin = roles.has("admin") || roles.has("super_admin");
  if (isAdmin && item.to.startsWith("/portal")) return false;
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.some((r) => roles.has(r));
}


export function CommandPaletteV3({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roles: Set<Role>;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ITEMS.filter((i) => matchesRole(i, roles)).filter(
      (i) => !q || i.label.toLowerCase().includes(q) || i.to.includes(q),
    );
  }, [query, roles]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of visible) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return Array.from(map.entries());
  }, [visible]);

  function go(to: string) {
    onOpenChange(false);
    navigate({ to });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-start justify-center pt-[10vh] px-4"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-label="Command palette"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative w-full max-w-xl rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} loop dir="rtl">
          <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
            <Search className="h-5 w-5 opacity-60" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="ابحث عن صفحة أو انتقل بسرعة… (Ctrl/Cmd + K)"
              className="flex-1 bg-transparent outline-none text-sm"
            />
            <kbd className="hidden sm:inline-flex items-center rounded px-1.5 h-6 text-[11px] font-mono border border-border text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              لا توجد نتائج
            </Command.Empty>

            {grouped.map(([group, items]) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {items.map((it) => (
                  <Command.Item
                    key={it.to}
                    value={`${it.to}-${it.label}`}
                    onSelect={() => go(it.to)}
                    className="flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer text-sm data-[selected=true]:bg-muted"
                  >
                    <it.icon className="h-4 w-4 opacity-70" />
                    <span>{it.label}</span>
                    <span className="mr-auto text-[11px] font-mono text-muted-foreground">
                      {it.to}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 opacity-40" />
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          <div className="flex items-center justify-between px-4 h-9 border-t border-border text-[11px] text-muted-foreground">
            <span>↑↓ للتنقل · ↵ للفتح</span>
            <span>V3</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
