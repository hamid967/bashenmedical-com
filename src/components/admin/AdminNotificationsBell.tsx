import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Activity,
  Plug,
  Inbox,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listAdminFeed,
  type AdminFeedItem,
  type AdminFeedSeverity,
  type AdminFeedCategory,
} from "@/lib/admin/notifications-feed.functions";

const READ_KEY = "admin_feed_last_read_at";

const SEV_META: Record<
  AdminFeedSeverity,
  { icon: typeof CheckCircle2; color: string; bg: string; label: string }
> = {
  success: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", label: "نجاح" },
  info: { icon: Info, color: "text-sky-600", bg: "bg-sky-50", label: "معلومة" },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", label: "تحذير" },
  danger: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "خطأ" },
};

const CAT_META: Record<AdminFeedCategory, { icon: typeof Activity; label: string }> = {
  system_health: { icon: Activity, label: "صحة النظام" },
  integration: { icon: Plug, label: "تكاملات" },
  request: { icon: Inbox, label: "طلبات" },
  audit: { icon: FileText, label: "سجل" },
};

type TabKey = "all" | AdminFeedCategory;

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `منذ ${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  const d = Math.floor(h / 24);
  return `منذ ${d} ي`;
}

export function AdminNotificationsBell() {
  const fetchFeed = useServerFn(listAdminFeed);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("all");
  const [lastReadAt, setLastReadAt] = useState<string>(() => {
    if (typeof window === "undefined") return new Date(0).toISOString();
    return localStorage.getItem(READ_KEY) ?? new Date(0).toISOString();
  });
  const lastToastIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const { data } = useQuery({
    queryKey: ["admin-feed"],
    queryFn: () => fetchFeed({ data: { limit: 30 } }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const items: AdminFeedItem[] = data?.items ?? [];
  const visible = tab === "all" ? items : items.filter((i) => i.category === tab);

  useEffect(() => {
    if (!items.length) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastToastIdsRef.current = new Set(items.map((i) => i.id));
      return;
    }
    const seen = lastToastIdsRef.current;
    const fresh = items.filter((i) => !seen.has(i.id));
    for (const item of fresh.slice(0, 3)) {
      const msg = item.title;
      const opts = { description: item.description ?? undefined };
      if (item.severity === "success") toast.success(msg, opts);
      else if (item.severity === "danger") toast.error(msg, opts);
      else if (item.severity === "warning") toast.warning(msg, opts);
      else toast.info(msg, opts);
      seen.add(item.id);
    }
  }, [items]);

  const unread = useMemo(
    () => items.filter((i) => new Date(i.at).getTime() > new Date(lastReadAt).getTime()).length,
    [items, lastReadAt],
  );

  function markAllRead() {
    const now = new Date().toISOString();
    setLastReadAt(now);
    if (typeof window !== "undefined") localStorage.setItem(READ_KEY, now);
  }

  const tabs: Array<{ id: TabKey; label: string; count: number }> = [
    { id: "all", label: "الكل", count: items.length },
    {
      id: "system_health",
      label: CAT_META.system_health.label,
      count: data?.counts.system_health ?? 0,
    },
    { id: "integration", label: CAT_META.integration.label, count: data?.counts.integration ?? 0 },
    { id: "request", label: CAT_META.request.label, count: data?.counts.request ?? 0 },
    { id: "audit", label: CAT_META.audit.label, count: data?.counts.audit ?? 0 },
  ];

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative p-2 rounded-md hover:bg-[color:var(--ac-subtle)]"
          aria-label="مركز الإشعارات"
        >
          <Bell className="h-5 w-5 text-[color:var(--ac-ink-2)]" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[color:var(--ac-danger)] text-white text-[10px] font-bold grid place-items-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] p-0" sideOffset={8}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-[color:var(--ac-line)]">
          <div className="text-sm font-semibold">مركز الإشعارات</div>
          <Link
            to="/admin/notifications"
            className="text-xs text-[color:var(--ac-accent-ink)] hover:underline"
            onClick={() => setOpen(false)}
          >
            عرض الكل
          </Link>
        </div>
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[color:var(--ac-line)] overflow-x-auto">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`text-[11px] font-bold rounded-full px-2.5 h-7 whitespace-nowrap ${
                  active
                    ? "bg-[color:var(--ac-ink-1)] text-white"
                    : "bg-[color:var(--ac-subtle)] text-[color:var(--ac-ink-2)]"
                }`}
                aria-pressed={active}
              >
                {t.label} {t.count ? `(${t.count})` : ""}
              </button>
            );
          })}
        </div>
        <ScrollArea className="max-h-[440px]">
          {visible.length === 0 ? (
            <div className="p-6 text-center text-sm text-[color:var(--ac-ink-3)]">
              لا توجد إشعارات حديثة.
            </div>
          ) : (
            <ul className="divide-y divide-[color:var(--ac-line)]">
              {visible.map((it) => {
                const meta = SEV_META[it.severity];
                const Icon = meta.icon;
                const Cat = CAT_META[it.category].icon;
                const body = (
                  <div className="flex gap-3 px-3 py-2.5 hover:bg-[color:var(--ac-subtle)]">
                    <div
                      className={`h-8 w-8 rounded-full grid place-items-center ${meta.bg} ${meta.color} shrink-0`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Cat
                          className="h-3 w-3 text-[color:var(--ac-ink-3)] shrink-0"
                          aria-hidden
                        />
                        <div className="text-sm font-medium truncate">{it.title}</div>
                      </div>
                      {it.description ? (
                        <div className="text-xs text-[color:var(--ac-ink-3)] truncate">
                          {it.description}
                        </div>
                      ) : null}
                      <div className="text-[11px] text-[color:var(--ac-ink-3)] mt-0.5">
                        {timeAgo(it.at)}
                      </div>
                    </div>
                  </div>
                );
                return (
                  <li key={it.id}>
                    {it.href ? (
                      <Link
                        to={it.href}
                        onClick={() => setOpen(false)}
                        className="block focus:outline-none focus-visible:bg-[color:var(--ac-subtle)]"
                      >
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
