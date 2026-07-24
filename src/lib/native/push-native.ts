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

type RegisterResult =
  | { ok: true; token: string; platform: "ios" | "android" }
  | { ok: false; reason: "not-native" | "permission-denied" | "error"; error?: string };

async function loadPushPlugin() {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const mod = await import(
    /* @vite-ignore */ "@capacitor/push-notifications"
  ).catch(() => null);
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
