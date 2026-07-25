/**
 * Native push (APNs on iOS, FCM on Android) registration flow.
 *
 * Runs only inside the Capacitor shell. Requests permission, registers with
 * the OS, and POSTs the resulting device token to
 * `/api/public/native/register-device` so the server can fan out
 * notifications to the right platform.
 *
 * The `@capacitor/push-notifications` import is dynamic so this module stays
 * loadable in the plain web bundle (which never installs Capacitor plugins).
 */
import { isNative, nativePlatform } from "./bridge";
import { setNativeBadge } from "./badge";

type RegisterResult =
  | { ok: true; token: string; platform: "ios" | "android" }
  | { ok: false; reason: "not-native" | "permission-denied" | "error"; error?: string };

async function loadPushPlugin() {
  // Indirect specifier defeats TS's static module resolution: the plugin is
  // only installed inside `capacitor/`, never in the web bundle's package.json.
  const spec = "@capacitor/push-notifications";
  const mod = await import(/* @vite-ignore */ spec).catch(() => null);
  return (mod as { PushNotifications?: unknown } | null)?.PushNotifications as
    | {
        checkPermissions: () => Promise<{ receive: "granted" | "denied" | "prompt" }>;
        requestPermissions: () => Promise<{ receive: "granted" | "denied" | "prompt" }>;
        register: () => Promise<void>;
        addListener: (
          event: string,
          cb: (payload: unknown) => void,
        ) => Promise<{ remove: () => Promise<void> }>;
      }
    | undefined;
}

/**
 * Kick off native push registration for the signed-in user. Idempotent:
 * calling it repeatedly re-registers the same token (which the server
 * upserts). Returns quickly on the web where there's nothing to do.
 */
export async function registerNativePushForCurrentUser(
  getAuthToken: () => Promise<string | null>,
): Promise<RegisterResult> {
  if (!isNative()) return { ok: false, reason: "not-native" };
  const platform = nativePlatform();
  if (platform === "web") return { ok: false, reason: "not-native" };

  const Push = await loadPushPlugin();
  if (!Push) return { ok: false, reason: "error", error: "plugin-missing" };

  const perm = await Push.checkPermissions();
  let receive = perm.receive;
  if (receive === "prompt") {
    receive = (await Push.requestPermissions()).receive;
  }
  if (receive !== "granted") return { ok: false, reason: "permission-denied" };

  return new Promise<RegisterResult>((resolve) => {
    let settled = false;

    void Push.addListener("registration", async (payload) => {
      if (settled) return;
      settled = true;
      const token = (payload as { value?: string }).value ?? "";
      if (!token) {
        resolve({ ok: false, reason: "error", error: "empty-token" });
        return;
      }
      try {
        const authToken = await getAuthToken();
        const res = await fetch("/api/public/native/register-device", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            platform,
            token,
            appVersion: (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__ ?? null,
            deviceModel: navigator.userAgent.slice(0, 200),
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          resolve({ ok: false, reason: "error", error: `server ${res.status}: ${body}` });
          return;
        }
        resolve({ ok: true, token, platform: platform as "ios" | "android" });
      } catch (e) {
        resolve({ ok: false, reason: "error", error: (e as Error).message });
      }
    });

    void Push.addListener("registrationError", (payload) => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        reason: "error",
        error: (payload as { error?: string }).error ?? "registration-error",
      });
    });

    void Push.register();
  });
}

/**
 * Register handlers for foreground pushes and notification taps.
 * Idempotent — repeated calls are a no-op. Should be invoked once at
 * shell mount for signed-in users so deep links and badge updates work
 * even before/without a fresh device registration this session.
 */
let handlersInstalled = false;
export async function initNativePushHandlers(options?: { onReceived?: () => void }): Promise<void> {
  if (!isNative() || handlersInstalled) return;
  const Push = await loadPushPlugin();
  if (!Push) return;
  handlersInstalled = true;

  // Foreground push: bump the badge from the payload if present and let
  // the app refetch its notification list so the bell updates instantly.
  void Push.addListener("pushNotificationReceived", (payload) => {
    const data = ((payload as { data?: Record<string, unknown> })?.data ?? {}) as Record<
      string,
      unknown
    >;
    const badgeRaw = data.badge;
    const n = typeof badgeRaw === "number" ? badgeRaw : Number(badgeRaw);
    if (Number.isFinite(n) && n >= 0) void setNativeBadge(n);
    try {
      options?.onReceived?.();
    } catch {
      /* callback is best-effort */
    }
  });

  // Tap on a notification (foreground OR background). Route to the
  // in-app deep link when the server sent one; fall back to the
  // notifications inbox.
  void Push.addListener("pushNotificationActionPerformed", (payload) => {
    const notif = (payload as { notification?: { data?: Record<string, unknown> } })?.notification;
    const data = (notif?.data ?? {}) as Record<string, unknown>;
    const linkRaw = typeof data.deepLink === "string" ? data.deepLink : undefined;
    if (typeof window === "undefined") return;
    const fallback = "/patient/notifications";
    try {
      const target = linkRaw
        ? new URL(linkRaw, window.location.origin)
        : new URL(fallback, window.location.origin);
      // Same-origin → SPA navigation inside the Capacitor WebView.
      if (target.origin === window.location.origin) {
        window.location.href = target.pathname + target.search + target.hash;
      } else {
        window.location.href = target.toString();
      }
    } catch {
      window.location.href = fallback;
    }
  });
}
