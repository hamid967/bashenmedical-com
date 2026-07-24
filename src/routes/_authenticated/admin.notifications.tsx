import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Activity,
  Plug,
  Inbox,
  FileText,
  ExternalLink,
} from "lucide-react";
import {
  listAdminFeed,
  type AdminFeedItem,
  type AdminFeedSeverity,
  type AdminFeedCategory,
} from "@/lib/admin/notifications-feed.functions";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({
    meta: [
      { title: "مركز الإشعارات | مركز باعشن" },
      { name: "description", content: "مركز الإشعارات الموحد: صحة النظام، فشل التكاملات وتحديثات الطلبات." },
      { property: "og:title", content: "مركز الإشعارات | مركز باعشن" },
      { property: "og:description", content: "تدفق موحد لإشعارات الإدارة مع روابط مباشرة." },
      { property: "og:url", content: "https://bashenmedical.com/admin/notifications" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://bashenmedical.com/admin/notifications" }],
  }),
  component: AdminNotificationsPage,
});

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
  integration: { icon: Plug, label: "فشل التكاملات" },
  request: { icon: Inbox, label: "تحديثات الطلبات" },
  audit: { icon: FileText, label: "سجل النظام" },
};

type TabKey = "all" | AdminFeedCategory;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function AdminNotificationsPage() {
  const fetchFeed = useServerFn(listAdminFeed);
  const [tab, setTab] = useState<TabKey>("all");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["admin-feed-page", tab],
    queryFn: () =>
      fetchFeed({
        data: {
          limit: 100,
          ...(tab === "all" ? {} : { category: tab }),
        },
      }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const items: AdminFeedItem[] = data?.items ?? [];
  const counts = data?.counts ?? { total: 0, system_health: 0, integration: 0, request: 0, audit: 0 };

  const tabs: Array<{ id: TabKey; label: string; count: number }> = [
    { id: "all", label: "الكل", count: counts.total },
    { id: "system_health", label: CAT_META.system_health.label, count: counts.system_health },
    { id: "integration", label: CAT_META.integration.label, count: counts.integration },
    { id: "request", label: CAT_META.request.label, count: counts.request },
    { id: "audit", label: CAT_META.audit.label, count: counts.audit },
  ];

  return (
    <div dir="rtl" className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="mb-4 sm:mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">مركز الإشعارات</h1>
          <p className="text-xs sm:text-sm text-[color:var(--ac-ink-3)] mt-1">
            تدفّق موحّد لصحة النظام وفشل التكاملات وتحديثات الطلبات مع روابط مباشرة لكل عنصر.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 h-8 bg-[color:var(--ac-subtle)] text-[color:var(--ac-ink-2)] hover:bg-[color:var(--ac-line)] disabled:opacity-60"
          aria-label="تحديث الإشعارات"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </header>

      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`text-xs font-bold rounded-full px-3 h-8 whitespace-nowrap ${
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

      <section
        className="rounded-2xl border border-[color:var(--ac-line)] bg-[color:var(--ac-panel,white)]"
        aria-live="polite"
      >
        {isError ? (
          <div className="p-8 text-center text-sm text-[color:var(--ac-danger)]">
            تعذّر تحميل الإشعارات — أعد المحاولة.
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center text-sm text-[color:var(--ac-ink-3)]">جارِ التحميل…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-[color:var(--ac-ink-3)]">
            لا توجد إشعارات في هذا التصنيف خلال آخر ٢٤ ساعة.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--ac-line)]">
            {items.map((it) => {
              const meta = SEV_META[it.severity];
              const Icon = meta.icon;
              const cat = CAT_META[it.category];
              const CatIcon = cat.icon;
              const row = (
                <div className="flex gap-3 px-4 py-3 hover:bg-[color:var(--ac-subtle)]">
                  <div
                    className={`h-9 w-9 rounded-full grid place-items-center ${meta.bg} ${meta.color} shrink-0`}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ac-subtle)] text-[10px] font-bold text-[color:var(--ac-ink-2)] px-2 py-0.5">
                        <CatIcon className="h-3 w-3" aria-hidden />
                        {cat.label}
                      </span>
                      <span className="text-sm font-semibold truncate">{it.title}</span>
                      {it.href && (
                        <ExternalLink
                          className="h-3 w-3 text-[color:var(--ac-ink-3)] shrink-0"
                          aria-hidden
                        />
                      )}
                    </div>
                    {it.description && (
                      <div className="text-xs text-[color:var(--ac-ink-3)] mt-1 line-clamp-2">
                        {it.description}
                      </div>
                    )}
                    <div className="text-[11px] text-[color:var(--ac-ink-3)] mt-1">
                      {fmtDate(it.at)}
                    </div>
                  </div>
                </div>
              );
              return (
                <li key={it.id}>
                  {it.href ? (
                    <Link
                      to={it.href}
                      className="block focus:outline-none focus-visible:bg-[color:var(--ac-subtle)]"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
