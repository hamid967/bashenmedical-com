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
  RefreshCw,
  Activity,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { sendTestPushToMe } from "@/lib/push-test.functions";

type SwWorkerInfo = { state: string; scriptURL: string } | null;
type SwDiag = {
  supported: boolean;
  registered: boolean;
  scope: string | null;
  updateViaCache: string | null;
  scriptURL: string | null;
  active: SwWorkerInfo;
  waiting: SwWorkerInfo;
  installing: SwWorkerInfo;
  controller: SwWorkerInfo;
  lastUpdated: number | null;
  lastEvent: string | null;
  error: string | null;
};

const initialSwDiag: SwDiag = {
  supported: false,
  registered: false,
  scope: null,
  updateViaCache: null,
  scriptURL: null,
  active: null,
  waiting: null,
  installing: null,
  controller: null,
  lastUpdated: null,
  lastEvent: null,
  error: null,
};

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
  const [swDiag, setSwDiag] = useState<SwDiag>(initialSwDiag);
  const [swRefreshing, setSwRefreshing] = useState(false);
  const sendServer = useServerFn(sendTestPushToMe);

  const inspectWorker = useCallback((w: ServiceWorker | null): SwWorkerInfo => {
    if (!w) return null;
    return { state: w.state, scriptURL: w.scriptURL };
  }, []);

  const readSwState = useCallback(
    async (eventLabel?: string) => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
        setSwDiag((prev) => ({ ...initialSwDiag, lastEvent: prev.lastEvent }));
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
        if (!reg) {
          setSwDiag({
            ...initialSwDiag,
            supported: true,
            lastEvent: eventLabel ?? null,
            lastUpdated: Date.now(),
          });
          return;
        }
        const script =
          reg.active?.scriptURL ||
          reg.waiting?.scriptURL ||
          reg.installing?.scriptURL ||
          null;
        setSwDiag({
          supported: true,
          registered: true,
          scope: reg.scope,
          updateViaCache: reg.updateViaCache ?? null,
          scriptURL: script,
          active: inspectWorker(reg.active),
          waiting: inspectWorker(reg.waiting),
          installing: inspectWorker(reg.installing),
          controller: inspectWorker(navigator.serviceWorker.controller),
          lastUpdated: Date.now(),
          lastEvent: eventLabel ?? null,
          error: null,
        });
      } catch (e) {
        setSwDiag((prev) => ({
          ...prev,
          supported: true,
          error: e instanceof Error ? e.message : "خطأ غير معروف",
          lastUpdated: Date.now(),
          lastEvent: eventLabel ?? prev.lastEvent,
        }));
      }
    },
    [inspectWorker],
  );

  // Subscribe to SW lifecycle changes to keep the diagnostic panel live.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    let cleanupFns: Array<() => void> = [];

    void (async () => {
      await readSwState("initial");
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (cancelled || !reg) return;

      const attach = (w: ServiceWorker | null, label: string) => {
        if (!w) return;
        const handler = () => void readSwState(`${label}:${w.state}`);
        w.addEventListener("statechange", handler);
        cleanupFns.push(() => w.removeEventListener("statechange", handler));
      };
      attach(reg.installing, "installing");
      attach(reg.waiting, "waiting");
      attach(reg.active, "active");

      const onUpdate = () => {
        void readSwState("updatefound");
        attach(reg.installing, "installing");
      };
      reg.addEventListener("updatefound", onUpdate);
      cleanupFns.push(() => reg.removeEventListener("updatefound", onUpdate));

      const onController = () => void readSwState("controllerchange");
      navigator.serviceWorker.addEventListener("controllerchange", onController);
      cleanupFns.push(() =>
        navigator.serviceWorker.removeEventListener("controllerchange", onController),
      );
    })();

    return () => {
      cancelled = true;
      cleanupFns.forEach((fn) => fn());
    };
  }, [readSwState, push.subscribed]);

  const forceSwUpdate = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    setSwRefreshing(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (!reg) {
        toast.error("لا يوجد Service Worker مسجّل");
        return;
      }
      await reg.update();
      await readSwState("manual-update");
      toast.success("تم فحص التحديثات");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر التحديث");
    } finally {
      setSwRefreshing(false);
    }
  }, [readSwState]);


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

  const sendServerTest = useCallback(async () => {
    setServerSending(true);
    try {
      const res = await sendServer({
        data: {
          title: payload.title.trim() || undefined,
          body: payload.body.trim() || undefined,
          url: payload.url.trim() || undefined,
          requireInteraction: payload.requireInteraction,
        },
      });
      if (res.ok) {
        toast.success(res.message, {
          description:
            res.removed > 0
              ? `تم حذف ${res.removed} اشتراك منتهي.`
              : "افحص إشعار النظام لديك خلال ثوانٍ.",
        });
      } else {
        const first = res.results?.[0];
        toast.error(res.message, {
          description: first?.error
            ? `${first.statusCode ?? "?"} — ${first.error.slice(0, 140)}`
            : undefined,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الإرسال من الخادم");
    } finally {
      setServerSending(false);
    }
  }, [sendServer, payload]);



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

      {/* Service Worker diagnostic panel */}
      <SwDiagnosticPanel diag={swDiag} onRefresh={forceSwUpdate} refreshing={swRefreshing} />



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
          title="إشعار محلي عبر showNotification()"
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          إشعار محلي
        </button>

        <button
          onClick={() => void sendServerTest()}
          disabled={serverSending || !push.subscribed}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          title="Web Push حقيقي من الخادم عبر VAPID → مزوّد المتصفح"
        >
          {serverSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          إرسال من الخادم
        </button>

        <button
          onClick={() => setShowPayload((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-input bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted"
          type="button"
        >
          {showPayload ? "إخفاء الحمولة" : "تخصيص الحمولة"}
        </button>
      </div>

      {/* Custom payload editor for the server-side push test */}
      {showPayload && (
        <div className="mt-4 space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-muted-foreground">العنوان — Title</span>
              <input
                type="text"
                value={payload.title}
                maxLength={120}
                onChange={(e) => setPayload((p) => ({ ...p, title: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-muted-foreground">
                رابط الوجهة — URL (يبدأ بـ /)
              </span>
              <input
                type="text"
                value={payload.url}
                maxLength={500}
                dir="ltr"
                onChange={(e) => setPayload((p) => ({ ...p, url: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              />
            </label>
          </div>
          <label className="block space-y-1 text-xs">
            <span className="font-semibold text-muted-foreground">النص — Body</span>
            <textarea
              value={payload.body}
              maxLength={400}
              rows={2}
              onChange={(e) => setPayload((p) => ({ ...p, body: e.target.value }))}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={payload.requireInteraction}
              onChange={(e) =>
                setPayload((p) => ({ ...p, requireInteraction: e.target.checked }))
              }
              className="rounded border-input"
            />
            <span>يتطلّب تفاعل المستخدم للإخفاء (requireInteraction)</span>
          </label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            هذه الحمولة تُرسَل عبر VAPID إلى مزوّد المتصفح (FCM/APNs/Mozilla)، ويلتقطها{" "}
            <code className="rounded bg-background px-1">push</code> event في{" "}
            <code className="rounded bg-background px-1">/sw-push.js</code>.
          </p>
        </div>
      )}


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

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("ar-EG", { hour12: false });
  } catch {
    return new Date(ts).toISOString().slice(11, 19);
  }
}

function stateTone(state: string | undefined): string {
  switch (state) {
    case "activated":
      return "text-emerald-600 dark:text-emerald-400";
    case "installing":
    case "installed":
    case "activating":
      return "text-amber-600 dark:text-amber-400";
    case "redundant":
      return "text-rose-600 dark:text-rose-400";
    default:
      return "text-muted-foreground";
  }
}

function SwWorkerRow({ label, worker }: { label: string; worker: SwWorkerInfo }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-20 shrink-0 font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {worker ? (
        <>
          <span className={`font-mono font-semibold ${stateTone(worker.state)}`}>
            {worker.state}
          </span>
          <code
            className="flex-1 truncate rounded bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
            dir="ltr"
            title={worker.scriptURL}
          >
            {worker.scriptURL.replace(/^https?:\/\/[^/]+/, "")}
          </code>
        </>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}

function SwDiagnosticPanel({
  diag,
  onRefresh,
  refreshing,
}: {
  diag: SwDiag;
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
}) {
  const registered = diag.registered;
  const headerTone = !diag.supported
    ? "bg-slate-50 dark:bg-slate-900"
    : diag.error
      ? "bg-rose-50/60 dark:bg-rose-950/30"
      : registered
        ? "bg-emerald-50/50 dark:bg-emerald-950/20"
        : "bg-amber-50/60 dark:bg-amber-950/30";

  return (
    <div className={`mb-4 rounded-xl border p-3 ${headerTone}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            تشخيص الـ Service Worker
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
              !diag.supported
                ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                : registered
                  ? "bg-emerald-600 text-white"
                  : "bg-amber-500 text-white"
            }`}
          >
            {!diag.supported ? "غير مدعوم" : registered ? "مسجّل" : "غير مسجّل"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshing || !diag.supported}
          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          title="فحص التحديثات وإعادة قراءة الحالة"
        >
          {refreshing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          تحديث
        </button>
      </div>

      {!diag.supported && (
        <p className="text-xs text-muted-foreground">
          لا يدعم هذا المتصفح Service Workers.
        </p>
      )}

      {diag.supported && !registered && !diag.error && (
        <p className="text-xs text-muted-foreground">
          الملف <code className="rounded bg-background px-1">/sw-push.js</code> غير
          مسجّل بعد. اضغط «تفعيل الإشعارات» لتسجيله.
        </p>
      )}

      {diag.error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">خطأ: {diag.error}</p>
      )}

      {registered && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-background/60 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                scriptURL
              </div>
              <code
                className="mt-0.5 block truncate font-mono text-[11px] text-foreground"
                dir="ltr"
                title={diag.scriptURL ?? ""}
              >
                {diag.scriptURL ?? "—"}
              </code>
            </div>
            <div className="rounded-md bg-background/60 p-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Scope
              </div>
              <code
                className="mt-0.5 block truncate font-mono text-[11px] text-foreground"
                dir="ltr"
                title={diag.scope ?? ""}
              >
                {diag.scope ?? "—"}
              </code>
            </div>
          </div>

          <div className="space-y-1 rounded-md bg-background/60 p-2">
            <SwWorkerRow label="Active" worker={diag.active} />
            <SwWorkerRow label="Waiting" worker={diag.waiting} />
            <SwWorkerRow label="Installing" worker={diag.installing} />
            <SwWorkerRow label="Controller" worker={diag.controller} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              updateViaCache:{" "}
              <code className="rounded bg-background px-1 font-mono">
                {diag.updateViaCache ?? "—"}
              </code>
            </span>
            <span>
              آخر حدث:{" "}
              <code className="rounded bg-background px-1 font-mono">
                {diag.lastEvent ?? "—"}
              </code>
            </span>
            <span>
              آخر تحديث:{" "}
              <code className="rounded bg-background px-1 font-mono">
                {formatTime(diag.lastUpdated)}
              </code>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

