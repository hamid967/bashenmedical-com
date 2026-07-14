import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { visibilityAwareInterval } from "@/lib/polling";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  MessageSquare,
  MessageCircle,
  Mail,
  Check,
  RefreshCw,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  listOutboundNotifications,
  outboundNotificationStats,
  setNotificationStatus,
  type OutboundNotification,
} from "@/lib/notifications.functions";
import { RequirePermission } from "@/components/rbac/RequirePermission";

export const Route = createFileRoute("/_authenticated/notifications-queue")({
  head: () => ({
    meta: [
      { title: "قائمة الإشعارات | مجمع باعشن الطبي" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RequirePermission anyOf="notifications.manage">
      <NotificationsQueuePage />
    </RequirePermission>
  ),
});

const CHANNEL_LABEL: Record<string, { label: string; Icon: any; color: string }> = {
  sms: { label: "SMS", Icon: MessageSquare, color: "bg-teal-100 text-teal-900" },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, color: "bg-emerald-100 text-emerald-900" },
  email: { label: "Email", Icon: Mail, color: "bg-teal-100 text-teal-900" },
  in_app: { label: "داخل النظام", Icon: Bell, color: "bg-slate-100 text-slate-700" },
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "bg-amber-100 text-amber-900 border-amber-300" },
  queued: { label: "في الطابور", color: "bg-teal-100 text-teal-900 border-teal-300" },
  sent: { label: "مُرسل", color: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  failed: { label: "فشل", color: "bg-rose-100 text-rose-900 border-rose-300" },
  skipped: { label: "متجاوز", color: "bg-slate-100 text-slate-700 border-slate-300" },
};

function NotificationsQueuePage() {
  const [channel, setChannel] = useState<"sms" | "whatsapp" | "email" | null>(null);
  const [status, setStatus] = useState<
    "pending" | "sent" | "failed" | "skipped" | null
  >("pending");

  const listFn = useServerFn(listOutboundNotifications);
  const statsFn = useServerFn(outboundNotificationStats);
  const setStatusFn = useServerFn(setNotificationStatus);
  const qc = useQueryClient();

  const statsQ = useQuery({
    queryKey: ["notif-queue", "stats"],
    queryFn: () => statsFn({ data: {} }),
    refetchInterval: visibilityAwareInterval(60_000, 5 * 60_000),
  });

  const listQ = useQuery({
    queryKey: ["notif-queue", "list", channel, status],
    queryFn: () => listFn({ data: { channel, status, limit: 200 } }),
    refetchInterval: visibilityAwareInterval(60_000, 5 * 60_000),
  });


  const update = useMutation({
    mutationFn: (v: {
      id: string;
      status: "sent" | "skipped" | "pending" | "failed";
    }) => setStatusFn({ data: v }),
    onSuccess: () => {
      toast.success("تم التحديث");
      qc.invalidateQueries({ queryKey: ["notif-queue"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "خطأ"),
  });

  return (
    <div className="container-app py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/admin" className="rounded-md border border-input px-2.5 py-1.5 text-sm hover:bg-muted">
            ← الإدارة
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bell className="h-6 w-6 text-primary" /> قائمة الإشعارات الخارجية
          </h1>
        </div>
        <button
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["notif-queue"] });
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(["sms", "whatsapp", "email"] as const).map((c) => {
          const s = statsQ.data?.[c] ?? { pending: 0, sent: 0, failed: 0 };
          const meta = CHANNEL_LABEL[c];
          return (
            <button
              key={c}
              onClick={() => setChannel(channel === c ? null : c)}
              className={`rounded-lg border p-3 text-right transition ${
                channel === c ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-md p-1.5 ${meta.color}`}>
                  <meta.Icon className="h-4 w-4" />
                </span>
                <span className="font-semibold">{meta.label}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <MiniStat label="بانتظار" value={s.pending} color="text-amber-700" />
                <MiniStat label="مُرسل" value={s.sent} color="text-emerald-700" />
                <MiniStat label="فشل" value={s.failed} color="text-rose-700" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">الحالة:</span>
        {(["pending", "sent", "failed", "skipped", null] as const).map((s) => (
          <button
            key={String(s)}
            onClick={() => setStatus(s as any)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              status === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {s ? STATUS_LABEL[s].label : "الكل"}
          </button>
        ))}
      </div>

      {!import.meta.env.SSR && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="me-1 inline-block h-4 w-4" />
          لم يُفعَّل مزوّد إرسال خارجي بعد (Twilio / Email). الإشعارات تُنتَج تلقائيًا وتبقى بحالة
          "قيد الانتظار" حتى ربط المزوّد؛ يمكن للموظف تحديد "مُرسل يدويًا" أو "تجاوز" مؤقتًا.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="px-3 py-2 text-right">القناة</th>
              <th className="px-3 py-2 text-right">المستلم</th>
              <th className="px-3 py-2 text-right">العنوان / المحتوى</th>
              <th className="px-3 py-2 text-right">الحالة</th>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {(listQ.data ?? []).map((n: OutboundNotification) => {
              const ch = CHANNEL_LABEL[n.channel];
              const st = STATUS_LABEL[n.send_status];
              return (
                <tr key={n.id} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${ch.color}`}>
                      <ch.Icon className="h-3 w-3" /> {ch.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums">{n.recipient ?? "—"}</td>
                  <td className="max-w-[420px] px-3 py-2">
                    <div className="truncate font-medium">{n.title}</div>
                    {n.body && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</div>
                    )}
                    {n.last_error && (
                      <div className="mt-1 truncate text-xs text-rose-700">{n.last_error}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${st.color}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("ar-SA-u-ca-gregory")}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <div className="inline-flex gap-1">
                      {n.channel === "whatsapp" && n.send_status !== "sent" && (() => {
                        const to = (n.recipient ?? "").replace(/\D/g, "");
                        const meta = (n.metadata ?? {}) as Record<string, unknown>;
                        const trackPath = typeof meta.tracking_path === "string" ? meta.tracking_path : "";
                        const origin = typeof window !== "undefined" ? window.location.origin : "";
                        const trackUrl = trackPath ? `${origin}${trackPath}` : "";
                        const body = (n.body ?? "").replace(
                          /\/track\?ref=[^\s]+|\/appointment-tracker\?ref=[^\s]+/,
                          trackUrl || "$&",
                        );
                        const finalText = trackUrl && !body.includes(trackUrl)
                          ? `${body}\n${trackUrl}`
                          : body;
                        const href = to
                          ? `https://wa.me/${to}?text=${encodeURIComponent(finalText)}`
                          : `https://wa.me/?text=${encodeURIComponent(finalText)}`;
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="فتح واتساب للإرسال"
                            className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        );
                      })()}
                      {n.send_status !== "sent" && (
                        <button
                          onClick={() => update.mutate({ id: n.id, status: "sent" })}
                          title="تحديد كمُرسل"
                          className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      {n.send_status !== "skipped" && (
                        <button
                          onClick={() => update.mutate({ id: n.id, status: "skipped" })}
                          title="تجاوز"
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {n.send_status !== "pending" && (
                        <button
                          onClick={() => update.mutate({ id: n.id, status: "pending" })}
                          title="إعادة الجدولة"
                          className="rounded p-1 text-teal-700 hover:bg-teal-50"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  لا توجد سجلات بهذه المعايير.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border border-border/60 bg-muted/20 px-2 py-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
