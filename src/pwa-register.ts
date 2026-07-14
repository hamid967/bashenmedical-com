/**
 * Guarded PWA service-worker registration.
 * Registers /sw.js ONLY in production and outside Lovable preview/iframe/dev.
 * Supports `?sw=off` kill switch. Does NOT touch /sw-push.js (Web Push worker).
 */
const APP_SW_URL = "/sw.js";

function isPreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppSW(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || "";
      // Only unregister our app-shell worker; leave /sw-push.js (Web Push) alone.
      if (url.endsWith(APP_SW_URL)) {
        await reg.unregister();
      }
    }
  } catch {
    /* noop */
  }
}

export function registerAppServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const url = new URL(window.location.href);
  const killSwitch = url.searchParams.get("sw") === "off";
  const hostname = window.location.hostname;

  const refuse =
    !import.meta.env.PROD || inIframe || isPreviewHost(hostname) || killSwitch;

  if (refuse) {
    void unregisterAppSW();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(APP_SW_URL, { scope: "/" }).catch(() => {
      /* ignore registration errors */
    });
  });
}
