/**
 * Native app icon badge — Capacitor `@capacitor/badge` plugin.
 *
 * The plugin ships only inside the Capacitor shell workspace, so this
 * module uses an indirect dynamic import to stay loadable in the plain
 * web bundle (which never installs the plugin). On the web, every helper
 * resolves to a no-op.
 */
import { isNative } from "./bridge";

type BadgePlugin = {
  set: (options: { count: number }) => Promise<void>;
  clear: () => Promise<void>;
};

async function loadBadgePlugin(): Promise<BadgePlugin | undefined> {
  const spec = "@capacitor/badge";
  const mod = await import(/* @vite-ignore */ spec).catch(() => null);
  return (mod as { Badge?: BadgePlugin } | null)?.Badge;
}

let lastCount = -1;

/** Set the app icon badge to `count`. Clears when count <= 0. Idempotent. */
export async function setNativeBadge(count: number): Promise<void> {
  if (!isNative()) return;
  const c = Math.max(0, Math.floor(count));
  if (c === lastCount) return;
  const badge = await loadBadgePlugin();
  if (!badge) return;
  try {
    if (c === 0) await badge.clear();
    else await badge.set({ count: c });
    lastCount = c;
  } catch {
    /* plugin errors are non-fatal */
  }
}
