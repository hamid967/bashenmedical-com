/**
 * Captures the browser's `beforeinstallprompt` event (Chrome/Edge/Android)
 * and exposes an imperative `promptInstall()` that opens the native
 * Add-to-Home-Screen dialog. On iOS Safari — which never fires the event —
 * `isIOS` is true and `canPrompt` is false, so callers can render manual
 * "Share → Add to Home Screen" instructions instead.
 */
import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type InstallState = {
  /** Chrome/Edge captured the deferred prompt — we can call `promptInstall`. */
  canPrompt: boolean;
  /** Running inside the installed PWA (display-mode: standalone). */
  isInstalled: boolean;
  /** iOS Safari — needs manual A2HS via Share sheet. */
  isIOS: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const check = () => {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        // iOS-specific flag on Safari
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(!!standalone);
    };
    check();

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    const mql = window.matchMedia?.("(display-mode: standalone)");
    mql?.addEventListener?.("change", check);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mql?.removeEventListener?.("change", check);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      return outcome;
    } catch {
      return "unavailable" as const;
    }
  }, [deferred]);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  return { canPrompt: !!deferred, isInstalled, isIOS, promptInstall };
}
