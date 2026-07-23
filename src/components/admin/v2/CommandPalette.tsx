import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  Search,
  LayoutDashboard,
  Inbox,
  CalendarCheck,
  Users,
  Stethoscope,
  Package,
  MessageSquare,
  FileBarChart,
  ShieldCheck,
  Settings,
  Bell,
  UserCog,
  Building2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { globalSearch } from "@/lib/admin/global-search.functions";

type RouteItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
};

const ROUTES: RouteItem[] = [
  { to: "/admin", label: "لوحة القيادة", icon: LayoutDashboard, group: "التنقل" },
  { to: "/admin/inbox", label: "الصندوق الموحد", icon: Inbox, group: "التنقل" },
  { to: "/appointments-queue", label: "طابور المواعيد", icon: CalendarCheck, group: "التنقل" },
  { to: "/calendar", label: "التقويم", icon: CalendarCheck, group: "التنقل" },
  { to: "/patients-management", label: "المرضى", icon: Users, group: "التنقل" },
  { to: "/doctors-management", label: "الأطباء", icon: Stethoscope, group: "التنقل" },
  { to: "/nurses", label: "التمريض", icon: UserCog, group: "التنقل" },
  { to: "/orders-unified", label: "الطلبات الموحدة", icon: Package, group: "التنقل" },
  { to: "/complaints-admin", label: "الشكاوى", icon: MessageSquare, group: "التنقل" },
  { to: "/admin/service-inquiries", label: "طلبات واتساب", icon: MessageSquare, group: "التنقل" },
  { to: "/reports", label: "التقارير", icon: FileBarChart, group: "التنقل" },
  { to: "/hr-management", label: "الموارد البشرية", icon: Users, group: "التنقل" },
  { to: "/inventory-management", label: "المخزون", icon: Package, group: "التنقل" },
  { to: "/corporate-admin", label: "الشركات", icon: Building2, group: "التنقل" },
  { to: "/rbac", label: "الأدوار والصلاحيات", icon: ShieldCheck, group: "الحوكمة" },
  { to: "/admin/audit-logs", label: "سجل التدقيق", icon: ShieldCheck, group: "الحوكمة" },
  { to: "/admin/booking-trace", label: "تتبع الحجوزات (Correlation ID)", icon: ShieldCheck, group: "الحوكمة" },
  { to: "/admin/web-vitals", label: "Web Vitals", icon: FileBarChart, group: "الحوكمة" },
  { to: "/admin/notification-logs", label: "سجلات الإشعارات", icon: Bell, group: "الحوكمة" },
  { to: "/admin/visual-analytics", label: "تحليلات بصرية", icon: FileBarChart, group: "الحوكمة" },
  { to: "/clinic-settings", label: "إعدادات المجمع", icon: Settings, group: "الحوكمة" },
  { to: "/admin/service-catalog", label: "كتالوج الخدمات", icon: Settings, group: "الحوكمة" },
];

export function CommandPalette({
  open,
  onOpenChange,
  onAskAI,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAskAI?: (q: string) => void;
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

  // Global keyboard shortcut Cmd/Ctrl+K handled by parent shell.

  const debouncedQuery = useDebounced(query, 250);
  const searchQ = useQuery({
    queryKey: ["admin-global-search", debouncedQuery],
    queryFn: () => globalSearch({ data: { q: debouncedQuery } }),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROUTES;
    return ROUTES.filter((r) => r.label.toLowerCase().includes(q) || r.to.includes(q));
  }, [query]);

  function go(to: string) {
    onOpenChange(false);
    navigate({ to });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-start justify-center pt-[10vh] px-4"
      onClick={() => onOpenChange(false)}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          background: "var(--ac-surface)",
          borderColor: "var(--ac-line-strong)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} loop dir="rtl">
          <div
            className="flex items-center gap-3 px-4 h-14 border-b"
            style={{ borderColor: "var(--ac-line)" }}
          >
            <Search className="h-5 w-5 opacity-60" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="ابحث عن صفحة، مريض، طبيب، أو موعد…"
            />
            <kbd
              className="hidden sm:inline-flex items-center gap-1 rounded px-1.5 h-6 text-[11px] font-mono border"
              style={{ borderColor: "var(--ac-line)", color: "var(--ac-ink-3)" }}
            >
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty
              className="py-8 text-center text-sm"
              style={{ color: "var(--ac-ink-3)" }}
            >
              لا توجد نتائج
            </Command.Empty>

            {onAskAI && query.trim().length >= 3 && (
              <Command.Group heading="المساعد الذكي">
                <Command.Item
                  value={`ai-${query}`}
                  onSelect={() => {
                    onOpenChange(false);
                    onAskAI(query);
                  }}
                >
                  <Sparkles className="h-4 w-4" style={{ color: "var(--ac-accent)" }} />
                  <span>اسأل المساعد: “{query}”</span>
                  <ArrowRight className="h-3.5 w-3.5 mr-auto opacity-50" />
                </Command.Item>
              </Command.Group>
            )}

            {searchQ.data && (
              <>
                {searchQ.data.patients.length > 0 && (
                  <Command.Group heading="المرضى">
                    {searchQ.data.patients.map((p) => (
                      <Command.Item
                        key={`p-${p.id}`}
                        value={`patient-${p.id}-${p.name}`}
                        onSelect={() => go(`/patients-management?patient=${p.id}`)}
                      >
                        <Users className="h-4 w-4 opacity-70" />
                        <span>{p.name}</span>
                        <span className="mr-auto text-[11px]" style={{ color: "var(--ac-muted)" }}>
                          {p.mrn ?? "—"} · {p.phone ?? "—"}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {searchQ.data.doctors.length > 0 && (
                  <Command.Group heading="الأطباء">
                    {searchQ.data.doctors.map((d) => (
                      <Command.Item
                        key={`d-${d.id}`}
                        value={`doctor-${d.id}-${d.name_ar}`}
                        onSelect={() => go(`/doctors-management?doctor=${d.id}`)}
                      >
                        <Stethoscope className="h-4 w-4 opacity-70" />
                        <span>{d.name_ar}</span>
                        {d.specialty && (
                          <span
                            className="mr-auto text-[11px]"
                            style={{ color: "var(--ac-muted)" }}
                          >
                            {d.specialty}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}

            <Command.Group heading="الصفحات">
              {filteredRoutes.map((r) => (
                <Command.Item
                  key={r.to}
                  value={`route-${r.to}-${r.label}`}
                  onSelect={() => go(r.to)}
                >
                  <r.icon className="h-4 w-4 opacity-70" />
                  <span>{r.label}</span>
                  <span
                    className="mr-auto text-[11px] font-mono"
                    style={{ color: "var(--ac-muted)" }}
                  >
                    {r.to}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div
            className="flex items-center justify-between px-4 h-10 border-t text-[11px]"
            style={{ borderColor: "var(--ac-line)", color: "var(--ac-ink-3)" }}
          >
            <span>↑↓ للتنقل · ↵ للفتح</span>
            {searchQ.isFetching && <span>جارٍ البحث…</span>}
          </div>
        </Command>
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
