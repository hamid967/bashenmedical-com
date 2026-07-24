/**
 * Face ID / Touch ID / fingerprint gate for the patient portal.
 *
 * Wraps @capgo/capacitor-native-biometric behind a dynamic import so the
 * web bundle stays clean. Callers only invoke this after confirming
 * `isNative()` and that the user opted in from portal settings.
 */
import { isNative } from "./bridge";

const OPT_IN_KEY = "baeshen:biometric-opt-in";

export type BiometricResult =
  | { ok: true }
  | { ok: false; reason: "not-native" | "not-enrolled" | "cancelled" | "error"; error?: string };

async function loadBiometricPlugin() {
  // Indirect specifier: plugin is only installed inside `capacitor/`.
  const spec = "@capgo/capacitor-native-biometric";
  const mod = await import(/* @vite-ignore */ spec).catch(() => null);
  return (mod as { NativeBiometric?: unknown } | null)?.NativeBiometric as
    | {
        isAvailable: () => Promise<{ isAvailable: boolean; biometryType?: number }>;
        verifyIdentity: (opts: {
          reason: string;
          title?: string;
          subtitle?: string;
          description?: string;
          negativeButtonText?: string;
          useFallback?: boolean;
        }) => Promise<void>;
      }
    | undefined;
}

export function isBiometricOptedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBiometricOptIn(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(OPT_IN_KEY, "1");
    else window.localStorage.removeItem(OPT_IN_KEY);
  } catch {
    /* noop */
  }
}

export async function verifyBiometric(reason: string): Promise<BiometricResult> {
  if (!isNative()) return { ok: false, reason: "not-native" };
  const Bio = await loadBiometricPlugin();
  if (!Bio) return { ok: false, reason: "error", error: "plugin-missing" };
  try {
    const status = await Bio.isAvailable();
    if (!status.isAvailable) return { ok: false, reason: "not-enrolled" };
    await Bio.verifyIdentity({
      reason,
      title: "التحقق للدخول",
      subtitle: "مجمع باعشن الطبي",
      description: reason,
      useFallback: true,
    });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/cancel|user cancel/i.test(msg)) return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "error", error: msg };
  }
}
