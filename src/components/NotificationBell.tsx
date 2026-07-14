import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { visibilityAwareInterval } from "@/lib/polling";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, BellRing, Check, CheckCheck, Download, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications,
  markNotificationsRead,
  countUnreadNotifications,
} from "@/lib/notifications.functions";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type NotificationRow = {
  id: string;
  audience: "staff" | "user";
  kind: string;
  title: string;
  body: string | null;
  appointment_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} د`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `منذ ${diffH} س`;
  return d.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function NotificationBell() {
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(!!session)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  const list = useServerFn(listMyNotifications);
  const mark = useServerFn(markNotificationsRead);
  const countFn = useServerFn(countUnreadNotifications);
  const push = usePushNotifications(signedIn);

  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => countFn({ data: undefined as never }),
    enabled: signedIn,
    refetchInterval: visibilityAwareInterval(90_000, 5 * 60_000),
  });

  const listQuery = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => list({ data: { limit: 30, onlyUnread: false } }),
    enabled: signedIn && open,
    staleTime: 15_000,
  });

  // Realtime: refetch on any change
  useEffect(() => {
    if (!signedIn) return;
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [signedIn, qc]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!signedIn) return null;

  const unread = countQuery.data?.count ?? 0;
  const items = (listQuery.data?.items ?? []) as NotificationRow[];

  const onMarkOne = async (id: string) => {
    await mark({ data: { id } });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const onMarkAll = async () => {
    await mark({ data: { all: true } });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-md border border-border h-9 w-9 hover:bg-muted"
        aria-label="الإشعارات"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-[360px] max-w-[92vw] rounded-lg border border-border bg-background shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <div className="text-sm font-semibold">الإشعارات</div>
            <button
              onClick={onMarkAll}
              disabled={unread === 0}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> تحديد الكل كمقروء
            </button>
          </div>
          {push.state !== "unsupported" && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2 text-xs">
                {push.subscribed ? (
                  <BellRing className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">
                  {push.subscribed
                    ? "تذكيرات المتصفح مفعّلة"
                    : "فعّل تذكيرات المتصفح لتصلك قبل الموعد"}
                </span>
              </div>
              <button
                type="button"
                onClick={push.toggle}
                disabled={push.busy || push.state === "denied"}
                title={push.state === "denied" ? "الإذن مرفوض من إعدادات المتصفح" : undefined}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
              >
                {push.busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : push.subscribed ? (
                  "إيقاف"
                ) : (
                  "تفعيل"
                )}
              </button>
            </div>
          )}
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-border">

            {listQuery.isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline-block me-1" />
                جارٍ التحميل…
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                لا توجد إشعارات
              </div>
            ) : (
              items.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <div
                    key={n.id}
                    className={`p-3 flex gap-2 items-start text-sm ${
                      isUnread ? "bg-primary/5" : ""
                    }`}
                  >
                    <div
                      className={`mt-1.5 h-2 w-2 rounded-full flex-none ${
                        isUnread ? "bg-primary" : "bg-transparent"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11px] text-muted-foreground">
                          {formatWhen(n.created_at)}
                        </span>
                        {n.appointment_id && (
                          <Link
                            to="/my"
                            onClick={() => setOpen(false)}
                            className="text-[11px] text-primary hover:underline"
                          >
                            عرض
                          </Link>
                        )}
                      </div>
                    </div>
                    {isUnread && (
                      <button
                        onClick={() => onMarkOne(n.id)}
                        title="تحديد كمقروء"
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
