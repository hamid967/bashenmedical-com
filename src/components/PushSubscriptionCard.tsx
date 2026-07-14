/**
 * PushSubscriptionCard — comprehensive Web Push management + diagnostic UI.
 *
 * Lets users:
 *  - Request notification permission
 *  - Subscribe / unsubscribe via /sw-push.js
 *  - Inspect the current subscription (endpoint, keys) with copy-to-clipboard
 *  - Fire a local test notification through the SW's showNotification()
 *
 * The local test exercises the SW's registration and the browser's OS-level
 * notification surface without needing a server round-trip. Real push events
 * still need a backend to POST to the endpoint with VAPID auth.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Copy,
  Loader2,
  Send,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { sendTestPushToMe } from "@/lib/push-test.functions";

type SubDetails = {
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  expirationTime: number | null;
};

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string | null {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function PushSubscriptionCard() {
  const push = usePushNotifications(true);
  const [details, setDetails] = useState<SubDetails | null>(null);
  const [testing, setTesting] = useState(false);
  const [serverSending, setServerSending] = useState(false);
  const [showPayload, setShowPayload] = useState(false);
  const [payload, setPayload] = useState({
    title: "إشعار تجريبي — Test push",
    body: "هذا اختبار حقيقي عبر web-push من الخادم.",
    url: "/portal/notifications",
    requireInteraction: false,
  });
  const sendServer = useServerFn(sendTestPushToMe);

  // Refresh subscription details whenever the subscribed state changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!push.subscribed || typeof window === "undefined") {
        if (!cancelled) setDetails(null);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!sub || cancelled) return;
        setDetails({
          endpoint: sub.endpoint,
          p256dh: arrayBufferToBase64Url(sub.getKey("p256dh")),
          auth: arrayBufferToBase64Url(sub.getKey("auth")),
          expirationTime: sub.expirationTime,
        });
      } catch {
        if (!cancelled) setDetails(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [push.subscribed]);

  const copy = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`تم نسخ ${label}`);
    } catch {
      toast.error("تعذّر النسخ");
    }
  }, []);

  const sendLocalTest = useCallback(async () => {
    if (typeof window === "undefined") return;
    setTesting(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (!reg) throw new Error("Service Worker غير مسجّل");
      if (Notification.permission !== "granted") {
        throw new Error("إذن الإشعارات غير ممنوح");
      }
      await reg.showNotification("إشعار تجريبي — Test notification", {
        body: "هذا إشعار محلي من /sw-push.js للتحقق من التسجيل والعرض.",
        icon: "/android-chrome-192.png",
        badge: "/favicon-32.png",
        tag: "push-test-local",
        dir: "rtl",
        lang: "ar",
        data: { url: "/portal/notifications" },
      });
      toast.success("تم إرسال الإشعار التجريبي");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إرسال الإشعار");
    } finally {
      setTesting(false);
    }
  }, []);

  // Status pill config
  const statusPill = (() => {
    if (push.state === "unsupported")
      return { icon: XCircle, label: "غير مدعوم في هذا المتصفح", tone: "muted" as const };
    if (push.state === "denied")
      return { icon: ShieldAlert, label: "الإذن مرفوض — فعّله من إعدادات المتصفح", tone: "danger" as const };
    if (push.state === "granted" && push.subscribed)
      return { icon: ShieldCheck, label: "مفعّل — الاشتراك نشط", tone: "success" as const };
    if (push.state === "granted")
      return { icon: Bell, label: "الإذن ممنوح — لم يتم الاشتراك بعد", tone: "info" as const };
    return { icon: Bell, label: "لم يُطلب الإذن بعد", tone: "info" as const };
  })();

  const StatusIcon = statusPill.icon;
  const toneClass = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    danger: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
    muted: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700",
  }[statusPill.tone];

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <BellRing className="size-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">إشعارات المتصفح — Web Push</h2>
          <p className="text-sm text-muted-foreground">
            اشترك في إشعارات المتصفح لتصلك تنبيهات المواعيد والتحديثات الفورية عبر{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/sw-push.js</code>.
          </p>
        </div>
      </div>

      {/* Status */}
      <div className={`mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${toneClass}`}>
        <StatusIcon className="size-4" />
        <span>{statusPill.label}</span>
      </div>

      {/* Diagnostic grid */}
      <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3 text-xs sm:grid-cols-4">
        <Diagnostic label="Support" value={push.state === "unsupported" ? "لا" : "نعم"} ok={push.state !== "unsupported"} />
        <Diagnostic label="Permission" value={push.state === "unknown" ? "—" : push.state} ok={push.state === "granted"} />
        <Diagnostic label="Subscribed" value={push.subscribed ? "نعم" : "لا"} ok={push.subscribed} />
        <Diagnostic
          label="Endpoint"
          value={details?.endpoint ? `${new URL(details.endpoint).host.slice(0, 20)}…` : "—"}
          ok={!!details?.endpoint}
        />
      </dl>

      {/* Subscription details (when active) */}
      {details && (
        <div className="mb-4 space-y-2 rounded-xl border bg-background p-3">
          <DetailRow label="Endpoint" value={details.endpoint} onCopy={() => copy(details.endpoint, "الـ endpoint")} />
          {details.p256dh && (
            <DetailRow label="p256dh" value={details.p256dh} onCopy={() => copy(details.p256dh!, "المفتاح p256dh")} />
          )}
          {details.auth && (
            <DetailRow label="auth" value={details.auth} onCopy={() => copy(details.auth!, "المفتاح auth")} />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!push.subscribed ? (
          <button
            onClick={() => void push.subscribe()}
            disabled={push.busy || push.state === "unsupported" || push.state === "denied"}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {push.busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
            تفعيل الإشعارات
          </button>
        ) : (
          <button
            onClick={() => void push.unsubscribe()}
            disabled={push.busy}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {push.busy ? <Loader2 className="size-4 animate-spin" /> : <BellOff className="size-4" />}
            إيقاف الاشتراك
          </button>
        )}

        <button
          onClick={() => void sendLocalTest()}
          disabled={testing || push.state !== "granted" || !push.subscribed}
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          title={
            push.state !== "granted"
              ? "يتطلّب منح الإذن"
              : !push.subscribed
                ? "يتطلّب اشتراكًا نشطًا"
                : undefined
          }
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          إرسال إشعار تجريبي
        </button>
      </div>

      {push.state === "denied" && (
        <p className="mt-3 text-xs text-muted-foreground">
          تم رفض الإذن سابقًا. افتح إعدادات الموقع في المتصفح واسمح بالإشعارات ثم أعد المحاولة.
        </p>
      )}
    </div>
  );
}

function Diagnostic({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 truncate font-mono text-xs ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}

function DetailRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-[11px]" dir="ltr">
        {value}
      </code>
      <button
        onClick={onCopy}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        title="نسخ"
        aria-label={`نسخ ${label}`}
      >
        <Copy className="size-3.5" />
      </button>
    </div>
  );
}
