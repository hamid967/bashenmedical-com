/**
 * Guarded PWA service-worker registration + update-available prompt.
 * Registers /sw.js ONLY in production and outside Lovable preview/iframe/dev.
 * Supports `?sw=off` kill switch. Does NOT touch /sw-push.js (Web Push worker).
 *
 * When a new SW version finishes installing while a controller is already
 * active, `onUpdateAvailable` is called with a function that activates the
 * new worker (SKIP_WAITING) and reloads once it takes control.
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

export type UpdateApplier = () => void;
export type OnUpdateAvailable = (apply: UpdateApplier) => void;

function watchForWaitingWorker(
  reg: ServiceWorkerRegistration,
  onUpdateAvailable?: OnUpdateAvailable,
): void {
  if (!onUpdateAvailable) return;

  const notify = (worker: ServiceWorker) => {
    let reloaded = false;
    const apply: UpdateApplier = () => {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
      worker.postMessage({ type: "SKIP_WAITING" });
    };
    onUpdateAvailable(apply);
  };

  // Already a waiting worker at registration time.
  if (reg.waiting && navigator.serviceWorker.controller) {
    notify(reg.waiting);
  }

  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        notify(installing);
      }
    });
  });
}

export interface RegisterOptions {
  onUpdateAvailable?: OnUpdateAvailable;
}

export function registerAppServiceWorker(opts: RegisterOptions = {}): void {
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
    navigator.serviceWorker
      .register(APP_SW_URL, { scope: "/" })
      .then((reg) => {
        watchForWaitingWorker(reg, opts.onUpdateAvailable);
        // Poll for updates every hour so long-lived tabs pick up new deploys.
        setInterval(() => {
          void reg.update().catch(() => {});
        }, 60 * 60 * 1000);
      })
      .catch(() => {
        /* ignore registration errors */
      });
  });
}
