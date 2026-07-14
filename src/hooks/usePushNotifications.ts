import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  VAPID_PUBLIC_KEY,
  urlBase64ToUint8Array,
  arrayBufferToBase64,
} from "@/lib/push-config";
import {
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/push-subscriptions.functions";

type PushState = "unsupported" | "denied" | "granted" | "default" | "unknown";

type StaleReason = "expired" | "endpoint-changed" | "missing-server" | null;

const LAST_ENDPOINT_KEY = "push:lastEndpoint";

export function usePushNotifications(enabled: boolean) {
  const [state, setState] = useState<PushState>("unknown");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState<StaleReason>(null);
  const [expirationTime, setExpirationTime] = useState<number | null>(null);
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(deletePushSubscription);
  const autoHealAttempted = useRef(false);

  // Persist + save a fresh subscription to the server.
  const persistSubscription = useCallback(
    async (sub: PushSubscription) => {
      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
      const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));
      if (!sub.endpoint || !p256dh || !auth) {
        throw new Error("Missing subscription details");
      }
      await save({
        data: {
          endpoint: sub.endpoint,
          p256dh,
          auth,
          userAgent: navigator.userAgent.slice(0, 500),
        },
      });
      try {
        localStorage.setItem(LAST_ENDPOINT_KEY, sub.endpoint);
      } catch {
        /* ignore */
      }
      setExpirationTime(sub.expirationTime ?? null);
    },
    [save],
  );

  // Evaluate whether the currently held subscription is stale.
  const evaluateStale = useCallback((sub: PushSubscription | null) => {
    if (!sub) {
      setStale(null);
      return null;
    }
    const now = Date.now();
    if (sub.expirationTime && sub.expirationTime < now) {
      setStale("expired");
      return "expired" as const;
    }
    try {
      const last = localStorage.getItem(LAST_ENDPOINT_KEY);
      if (last && last !== sub.endpoint) {
        setStale("endpoint-changed");
        return "endpoint-changed" as const;
      }
    } catch {
      /* ignore */
    }
    setStale(null);
    return null;
  }, []);

  // Detect support + initial state
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    setState(Notification.permission as PushState);

    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
        if (!reg) {
          setSubscribed(false);
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
        setExpirationTime(sub?.expirationTime ?? null);
        evaluateStale(sub);
      } catch {
        setSubscribed(false);
      }
    })();
  }, [enabled, evaluateStale]);

  // Listen for browser-driven subscription changes (endpoint rotation, expiry).
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const t = (event.data && (event.data as { type?: string }).type) || "";
      if (t === "pushsubscriptionchange" || t === "push-subscription-changed") {
        setStale("endpoint-changed");
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [enabled]);

  const subscribe = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (state === "unsupported") {
      toast.error("متصفحك لا يدعم إشعارات الدفع");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setState(permission as PushState);
      if (permission !== "granted") {
        toast.error("لم يتم منح إذن الإشعارات");
        return;
      }

      const reg =
        (await navigator.serviceWorker.getRegistration("/sw-push.js")) ??
        (await navigator.serviceWorker.register("/sw-push.js", { scope: "/" }));

      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key.buffer.slice(
            key.byteOffset,
            key.byteOffset + key.byteLength,
          ) as ArrayBuffer,
        });
      }

      await persistSubscription(sub);
      setSubscribed(true);
      setStale(null);
      toast.success("تم تفعيل إشعارات المتصفح");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر تفعيل الإشعارات");
    } finally {
      setBusy(false);
    }
  }, [persistSubscription, state]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        try {
          await remove({ data: { endpoint: sub.endpoint } });
        } catch {
          /* ignore server errors, still unsubscribe locally */
        }
        await sub.unsubscribe();
      }
      try {
        localStorage.removeItem(LAST_ENDPOINT_KEY);
      } catch {
        /* ignore */
      }
      setSubscribed(false);
      setStale(null);
      setExpirationTime(null);
      toast.success("تم إيقاف إشعارات المتصفح");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إيقاف الإشعارات");
    } finally {
      setBusy(false);
    }
  }, [remove]);

  // Re-subscribe: tear down the current (possibly expired) subscription,
  // request a fresh one from the push service, and update the server row.
  const resubscribe = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (typeof window === "undefined") return false;
      if (state === "unsupported" || state === "denied") {
        if (!opts?.silent) toast.error("تعذّرت إعادة الاشتراك — الإذن غير متاح");
        return false;
      }
      setBusy(true);
      try {
        const reg =
          (await navigator.serviceWorker.getRegistration("/sw-push.js")) ??
          (await navigator.serviceWorker.register("/sw-push.js", { scope: "/" }));
        await navigator.serviceWorker.ready;

        // Remove the old subscription on the server + browser, if any.
        const old = await reg.pushManager.getSubscription();
        if (old) {
          try {
            await remove({ data: { endpoint: old.endpoint } });
          } catch {
            /* ignore */
          }
          try {
            await old.unsubscribe();
          } catch {
            /* ignore */
          }
        }

        // Mint a fresh subscription.
        const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        const fresh = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key.buffer.slice(
            key.byteOffset,
            key.byteOffset + key.byteLength,
          ) as ArrayBuffer,
        });

        await persistSubscription(fresh);
        setSubscribed(true);
        setStale(null);
        if (!opts?.silent) toast.success("تم تجديد الاشتراك بنجاح");
        return true;
      } catch (e) {
        if (!opts?.silent) {
          toast.error(e instanceof Error ? e.message : "تعذّرت إعادة الاشتراك");
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [persistSubscription, remove, state],
  );

  // Auto-heal once per mount when the subscription is provably expired.
  useEffect(() => {
    if (!enabled || stale !== "expired" || busy) return;
    if (autoHealAttempted.current) return;
    autoHealAttempted.current = true;
    void resubscribe({ silent: true }).then((ok) => {
      if (ok) toast.success("انتهت صلاحية الاشتراك — تم تجديده تلقائيًا");
    });
  }, [enabled, stale, busy, resubscribe]);

  const toggle = useCallback(() => {
    if (subscribed) return unsubscribe();
    return subscribe();
  }, [subscribe, unsubscribe, subscribed]);

  return {
    state,
    subscribed,
    busy,
    stale,
    expirationTime,
    subscribe,
    unsubscribe,
    resubscribe,
    toggle,
  };
}
