/**
 * Runtime bridge for detecting the Capacitor native shell.
 *
 * All Capacitor plugin imports are done dynamically inside guarded helpers,
 * so this file (and everything that imports it) stays safe to include in
 * the plain web bundle even though `@capacitor/*` packages are only
 * installed under `capacitor/`, not in the web app's `package.json`.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => "ios" | "android" | "web";
};

function getCapacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { Capacitor?: CapacitorGlobal };
  return w.Capacitor ?? null;
}

export function isNative(): boolean {
  return !!getCapacitor()?.isNativePlatform?.();
}

export function nativePlatform(): "ios" | "android" | "web" {
  return getCapacitor()?.getPlatform?.() ?? "web";
}

/**
 * True when the current session is running inside our patient app
 * (either the installed PWA in standalone mode, or the Capacitor shell).
 * Used by the UI to hide the "Install app" card once the user is already
 * inside an app-like experience.
 */
export function isAppLike(): boolean {
  if (isNative()) return true;
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches === true;
}
