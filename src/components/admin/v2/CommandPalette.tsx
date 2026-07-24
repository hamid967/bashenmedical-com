/**
 * Admin Command Palette — Cmd/Ctrl+K.
 *
 * Polished universal launcher for the /admin console:
 *   • Quick navigation to every admin/staff/site-builder module that the
 *     signed-in role can see. The navigation tree is passed in from the
 *     shell (`AdminShellV2`) so the palette stays in sync with the
 *     sidebar and role gating — one source of truth.
 *   • Global actions: theme toggle, sign out, Ask the AI Assistant,
 *     refresh cached queries, copy current URL, back / forward, and
 *     jumping into common areas.
 *   • Live global search (patients + doctors) via `globalSearch()`.
 *   • "Recently used" items persisted per-user in localStorage.
 *   • Fully keyboard-driven: Cmd/Ctrl+K opens, Esc closes, ↑/↓ moves,
 *     Enter activates. All items expose their shortcut visually.
 *   • RTL Arabic UI with cmdk (`Command`), consistent with AdminShellV2.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  Search,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
  LogOut,
  RefreshCcw,
  ExternalLink,
  Link as LinkIcon,
  ArrowLeftCircle,
  ArrowRightCircle,
  History,
  Users,
  Stethoscope,
  CalendarCheck,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { globalSearch } from "@/lib/admin/global-search.functions";

// Kept intentionally structural so the shell can pass the same NavGroup
// tree that renders the sidebar.
export type PaletteNavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
export type PaletteNavGroup = { title: string; items: PaletteNavItem[] };

type ActionItem = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  shortcut?: string;
  danger?: boolean;
  run: () => void | Promise<void>;
};

type RecentEntry = { to: string; label: string; at: number };
const RECENTS_KEY = "bmc.admin.palette.recents.v1";
const RECENTS_MAX = 8;

function loadRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

function pushRecent(entry: Omit<RecentEntry, "at">) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const prev = loadRecents().filter((r) => r.to !== entry.to);
    const next = [{ ...entry, at: now }, ...prev].slice(0, RECENTS_MAX);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({
  open,
  onOpenChange,
  navGroups,
  theme,
  onToggleTheme,
  onSignOut,
  onAskAI,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Role-filtered navigation groups from the shell. */
  navGroups: PaletteNavGroup[];
  /** Current admin theme so the toggle can render the right icon/label. */
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onSignOut?: () => void | Promise<void>;
  onAskAI?: (q: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inputRef = useRef<HTMLInputElement>(null);

  // Flatten nav for lookups (recents label resolution, current route match).
  const flatNav = useMemo<PaletteNavItem[]>(
    () => navGroups.flatMap((g) => g.items),
    [navGroups],
  );

  // Reset + focus when opening; refresh recents each time.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCopied(false);
      setRecents(loadRecents());
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  const debouncedQuery = useDebounced(query, 250);
  const searchQ = useQuery({
    queryKey: ["admin-global-search", debouncedQuery],
    queryFn: () => globalSearch({ data: { q: debouncedQuery } }),
    enabled: open && debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  const go = useCallback(
    (item: PaletteNavItem | { to: string; label: string }) => {
      onOpenChange(false);
      pushRecent({ to: item.to, label: item.label });
      navigate({ to: item.to });
    },
    [navigate, onOpenChange],
  );

  const copyCurrentUrl = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore — clipboard perms */
    }
  }, []);

  const actions = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = [];
    if (onAskAI && query.trim().length >= 3) {
      list.push({
        id: "ask-ai",
        label: `اسأل المساعد: “${query.trim()}”`,
        icon: Sparkles,
        shortcut: "⌘J",
        run: () => {
          onOpenChange(false);
          onAskAI(query.trim());
        },
      });
    }
    if (onToggleTheme) {
      list.push({
        id: "toggle-theme",
        label: theme === "dark" ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن",
        icon: theme === "dark" ? Sun : Moon,
        run: () => {
          onToggleTheme();
          onOpenChange(false);
        },
      });
    }
    list.push({
      id: "refresh",
      label: "تحديث بيانات الصفحة",
      hint: "إعادة جلب كل الاستعلامات في هذه الشاشة",
      icon: RefreshCcw,
      run: () => {
        void qc.invalidateQueries();
        void router.invalidate();
        onOpenChange(false);
      },
    });
    list.push({
      id: "copy-url",
      label: copied ? "تم نسخ الرابط" : "نسخ رابط الصفحة الحالية",
      icon: LinkIcon,
      run: () => {
        void copyCurrentUrl();
      },
    });
    list.push({
      id: "open-new-tab",
      label: "فتح الصفحة الحالية في نافذة جديدة",
      icon: ExternalLink,
      run: () => {
        if (typeof window !== "undefined") window.open(window.location.href, "_blank", "noopener");
        onOpenChange(false);
      },
    });
    list.push({
      id: "back",
      label: "العودة إلى الصفحة السابقة",
      icon: ArrowLeftCircle,
      run: () => {
        if (typeof window !== "undefined") window.history.back();
        onOpenChange(false);
      },
    });
    list.push({
      id: "forward",
      label: "التقدم إلى الصفحة التالية",
      icon: ArrowRightCircle,
      run: () => {
        if (typeof window !== "undefined") window.history.forward();
        onOpenChange(false);
      },
    });
    if (onSignOut) {
      list.push({
        id: "signout",
        label: "تسجيل الخروج",
        icon: LogOut,
        danger: true,
        run: () => {
          onOpenChange(false);
          void onSignOut();
        },
      });
    }
    return list;
  }, [
    onAskAI,
    onOpenChange,
    onSignOut,
    onToggleTheme,
    qc,
    query,
    router,
    theme,
    copied,
    copyCurrentUrl,
  ]);

  // Recents — filter out items no longer in nav (role changed / route removed)
  const recentItems = useMemo(() => {
    if (!recents.length) return [] as PaletteNavItem[];
    const byTo = new Map(flatNav.map((i) => [i.to, i]));
    return recents
      .map((r) => byTo.get(r.to))
      .filter((v): v is PaletteNavItem => Boolean(v));
  }, [flatNav, recents]);

  if (!open) return null;

  const isSearching = query.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-start justify-center pt-[10vh] px-4"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="لوحة الأوامر"
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
        <Command shouldFilter={false} loop dir="rtl" label="لوحة الأوامر">
          {/* Input */}
          <div
            className="flex items-center gap-3 px-4 h-14 border-b"
            style={{ borderColor: "var(--ac-line)" }}
          >
            <Search className="h-5 w-5 opacity-60" aria-hidden="true" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="ابحث عن صفحة، إجراء، مريض، أو طبيب…"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "var(--ac-ink-1)" }}
            />
            <kbd
              className="hidden sm:inline-flex items-center gap-1 rounded px-1.5 h-6 text-[11px] font-mono border"
              style={{ borderColor: "var(--ac-line)", color: "var(--ac-ink-3)" }}
            >
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[62vh] overflow-y-auto p-2">
            <Command.Empty
              className="py-8 text-center text-sm"
              style={{ color: "var(--ac-ink-3)" }}
            >
              لا توجد نتائج
            </Command.Empty>

            {/* Live search results */}
            {isSearching && searchQ.data && (
              <>
                {searchQ.data.patients.length > 0 && (
                  <Command.Group heading="المرضى">
                    {searchQ.data.patients.map((p) => (
                      <Command.Item
                        key={`p-${p.id}`}
                        value={`patient-${p.id}-${p.name}-${p.mrn ?? ""}-${p.phone ?? ""}`}
                        onSelect={() =>
                          go({
                            to: `/patients-management?patient=${p.id}`,
                            label: p.name,
                          })
                        }
                      >
                        <Users className="h-4 w-4 opacity-70" aria-hidden="true" />
                        <span className="truncate">{p.name}</span>
                        <span
                          className="mr-auto text-[11px] truncate"
                          style={{ color: "var(--ac-muted)" }}
                        >
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
                        value={`doctor-${d.id}-${d.name_ar}-${d.specialty ?? ""}`}
                        onSelect={() =>
                          go({
                            to: `/doctors-management?doctor=${d.id}`,
                            label: d.name_ar,
                          })
                        }
                      >
                        <Stethoscope className="h-4 w-4 opacity-70" aria-hidden="true" />
                        <span className="truncate">{d.name_ar}</span>
                        {d.specialty && (
                          <span
                            className="mr-auto text-[11px] truncate"
                            style={{ color: "var(--ac-muted)" }}
                          >
                            {d.specialty}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {searchQ.data.appointments.length > 0 && (
                  <Command.Group heading="المواعيد">
                    {searchQ.data.appointments.map((a) => (
                      <Command.Item
                        key={`a-${a.id}`}
                        value={`appt-${a.id}-${a.reference_number ?? ""}-${a.patient_name}`}
                        onSelect={() =>
                          go({
                            to: `/admin/appointments?appointment=${a.id}`,
                            label: a.reference_number ?? a.patient_name,
                          })
                        }
                      >
                        <CalendarCheck className="h-4 w-4 opacity-70" aria-hidden="true" />
                        <span className="truncate">
                          {a.reference_number ? `${a.reference_number} · ` : ""}
                          {a.patient_name}
                        </span>
                        <span
                          className="mr-auto text-[11px] truncate"
                          style={{ color: "var(--ac-muted)" }}
                        >
                          {a.date?.slice(0, 10) ?? "—"} · {a.status}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {searchQ.data.requests.length > 0 && (
                  <Command.Group heading="الطلبات">
                    {searchQ.data.requests.map((r) => (
                      <Command.Item
                        key={`r-${r.id}`}
                        value={`req-${r.id}-${r.request_number ?? ""}-${r.full_name}`}
                        onSelect={() =>
                          go({
                            to: `/admin/service-inquiries?inquiry=${r.id}`,
                            label: r.request_number ?? r.full_name,
                          })
                        }
                      >
                        <Inbox className="h-4 w-4 opacity-70" aria-hidden="true" />
                        <span className="truncate">
                          {r.request_number ? `${r.request_number} · ` : ""}
                          {r.full_name}
                        </span>
                        <span
                          className="mr-auto text-[11px] truncate"
                          style={{ color: "var(--ac-muted)" }}
                        >
                          {r.phone ?? "—"} · {r.status ?? "—"}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}

            {/* Actions */}
            {actions.length > 0 && (
              <Command.Group heading="إجراءات">
                {actions.map((a) => (
                  <Command.Item
                    key={a.id}
                    value={`action-${a.id}-${a.label}`}
                    onSelect={() => void a.run()}
                    className={a.danger ? "text-red-500" : ""}
                  >
                    <a.icon
                      className="h-4 w-4"
                      style={{
                        color: a.danger ? "#ef4444" : "var(--ac-accent)",
                      }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{a.label}</span>
                    {a.hint && (
                      <span
                        className="mr-auto text-[11px] truncate"
                        style={{ color: "var(--ac-muted)" }}
                      >
                        {a.hint}
                      </span>
                    )}
                    {a.shortcut && !a.hint && (
                      <kbd
                        className="mr-auto inline-flex items-center gap-1 rounded px-1.5 h-5 text-[10px] font-mono border"
                        style={{
                          borderColor: "var(--ac-line)",
                          color: "var(--ac-ink-3)",
                        }}
                      >
                        {a.shortcut}
                      </kbd>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Query suggestions — surfaced when idle or with short input */}
            {(!isSearching || query.trim().length < 2) && (
              <Command.Group heading="اقتراحات سريعة">
                {[
                  { to: "/admin/appointments?range=today", label: "مواعيد اليوم", icon: CalendarCheck },
                  { to: "/admin/appointments?status=pending", label: "مواعيد بانتظار التأكيد", icon: CalendarCheck },
                  { to: "/admin/service-inquiries?status=new", label: "طلبات جديدة", icon: Inbox },
                  { to: "/admin/service-inquiries?status=in_progress", label: "طلبات قيد المعالجة", icon: Inbox },
                  { to: "/patients-management", label: "المرضى", icon: Users },
                  { to: "/doctors-management", label: "الأطباء", icon: Stethoscope },
                ].map((s) => (
                  <Command.Item
                    key={`sugg-${s.to}`}
                    value={`sugg-${s.to}-${s.label}`}
                    onSelect={() => go({ to: s.to, label: s.label })}
                  >
                    <s.icon className="h-4 w-4 opacity-70" aria-hidden="true" />
                    <span className="truncate">{s.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {!isSearching && recentItems.length > 0 && (
              <Command.Group heading="آخر الصفحات">
                {recentItems.map((r) => {
                  const active = r.to === pathname;
                  return (
                    <Command.Item
                      key={`recent-${r.to}`}
                      value={`recent-${r.to}-${r.label}`}
                      onSelect={() => go(r)}
                    >
                      <History className="h-4 w-4 opacity-70" aria-hidden="true" />
                      <span className="truncate">{r.label}</span>
                      {active && (
                        <span
                          className="mr-auto text-[10px] rounded-full px-2 h-5 inline-flex items-center"
                          style={{
                            background: "var(--ac-accent-weak, rgba(92,189,185,0.15))",
                            color: "var(--ac-accent)",
                          }}
                        >
                          الحالية
                        </span>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* All navigation, grouped exactly like the sidebar */}
            {navGroups.map((g) => {
              const items = isSearching
                ? g.items.filter((i) => {
                    const q = query.trim().toLowerCase();
                    return (
                      i.label.toLowerCase().includes(q) ||
                      i.to.toLowerCase().includes(q)
                    );
                  })
                : g.items;
              if (items.length === 0) return null;
              return (
                <Command.Group key={g.title} heading={g.title}>
                  {items.map((r) => {
                    const active = r.to === pathname;
                    return (
                      <Command.Item
                        key={r.to}
                        value={`route-${r.to}-${r.label}`}
                        onSelect={() => go(r)}
                      >
                        <r.icon className="h-4 w-4 opacity-70" aria-hidden="true" />
                        <span className="truncate">{r.label}</span>
                        {active ? (
                          <span
                            className="mr-auto text-[10px] rounded-full px-2 h-5 inline-flex items-center"
                            style={{
                              background: "var(--ac-accent-weak, rgba(92,189,185,0.15))",
                              color: "var(--ac-accent)",
                            }}
                          >
                            الحالية
                          </span>
                        ) : (
                          <ArrowRight
                            className="mr-auto h-3.5 w-3.5 opacity-40"
                            aria-hidden="true"
                          />
                        )}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              );
            })}
          </Command.List>

          {/* Footer hint bar */}
          <div
            className="flex items-center justify-between px-4 h-10 border-t text-[11px]"
            style={{ borderColor: "var(--ac-line)", color: "var(--ac-ink-3)" }}
          >
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd
                  className="inline-flex items-center rounded px-1.5 h-5 font-mono border"
                  style={{ borderColor: "var(--ac-line)" }}
                >
                  ↑↓
                </kbd>
                تنقّل
              </span>
              <span className="flex items-center gap-1">
                <kbd
                  className="inline-flex items-center rounded px-1.5 h-5 font-mono border"
                  style={{ borderColor: "var(--ac-line)" }}
                >
                  ↵
                </kbd>
                فتح
              </span>
              <span className="hidden sm:flex items-center gap-1">
                <kbd
                  className="inline-flex items-center rounded px-1.5 h-5 font-mono border"
                  style={{ borderColor: "var(--ac-line)" }}
                >
                  ⌘K
                </kbd>
                فتح/إغلاق
              </span>
            </span>
            {searchQ.isFetching ? <span>جارٍ البحث…</span> : null}
          </div>
        </Command>
      </div>
    </div>
  );
}
