/**
 * Prefetch helpers for scene-linked media.
 *
 * The intro is time-driven, so instead of relying on IntersectionObserver
 * (which never fires for scenes that are only mounted momentarily) we
 * schedule prefetches during browser idle time, ~1.5s before each scene
 * starts. Images use `new Image()` to warm the HTTP cache; videos use
 * `<link rel="prefetch">` since browsers won't fetch a <source> tag until
 * a <video> mounts.
 */

type IdleHandle = number;
type IdleDeadline = { didTimeout: boolean; timeRemaining: () => number };

const w = typeof window !== "undefined" ? window : undefined;

const scheduleIdle = (cb: (d: IdleDeadline) => void): IdleHandle => {
  if (!w) return 0;
  const ric = (
    w as unknown as {
      requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === "function") return ric(cb, { timeout: 800 });
  return w.setTimeout(
    () => cb({ didTimeout: true, timeRemaining: () => 0 }),
    100,
  ) as unknown as number;
};

const prefetched = new Set<string>();

type NetworkMode = "off" | "lite" | "full";
type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
};

/**
 * Inspect the Network Information API to decide how aggressive prefetch
 * should be. Respects Save-Data (user asked for lighter payloads) and
 * skips prefetch entirely on slow-2g / 2g. On 3g, drops video prefetch
 * but keeps image prefetch since images are much smaller.
 */
export function getPrefetchMode(): NetworkMode {
  if (!w) return "off";
  const conn = (navigator as unknown as { connection?: NetworkInformation }).connection;
  if (!conn) return "full";
  if (conn.saveData) return "off";
  if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") return "off";
  if (conn.effectiveType === "3g") return "lite";
  return "full";
}

export type PrefetchStatus = {
  kind: "image" | "video";
  startedAt: number;
  completedAt?: number;
  ok?: boolean;
};

const telemetry = new Map<string, PrefetchStatus>();

/** Read the prefetch status for a URL; undefined if it was never scheduled. */
export function getPrefetchStatus(url: string): PrefetchStatus | undefined {
  return telemetry.get(url);
}

/** True if the prefetch finished (successfully or not) before `at`. */
export function prefetchCompletedBefore(url: string, at: number): boolean {
  const t = telemetry.get(url);
  return !!(t && t.completedAt !== undefined && t.completedAt <= at);
}

function markComplete(url: string, ok: boolean) {
  const t = telemetry.get(url);
  if (!t || t.completedAt !== undefined) return;
  t.completedAt = performance.now();
  t.ok = ok;
}

function prefetchOne(url: string, kind: "image" | "video") {
  if (!w || !url || prefetched.has(url)) return;
  prefetched.add(url);
  telemetry.set(url, { kind, startedAt: performance.now() });
  try {
    if (kind === "image") {
      const img = new Image();
      img.decoding = "async";
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
      img.onload = () => markComplete(url, true);
      img.onerror = () => markComplete(url, false);
      img.src = url;
    } else {
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "video";
      link.href = url;
      link.onload = () => markComplete(url, true);
      link.onerror = () => markComplete(url, false);
      document.head.appendChild(link);
    }
  } catch {
    markComplete(url, false);
  }
}

export function prefetchMedia(urls: Array<{ url: string; kind: "image" | "video" }>) {
  if (!urls.length) return;
  const mode = getPrefetchMode();
  if (mode === "off") return;
  // On slow connections, drop videos and only warm images.
  const filtered = mode === "lite" ? urls.filter((u) => u.kind === "image") : urls;
  if (!filtered.length) return;
  scheduleIdle(() => {
    for (const u of filtered) prefetchOne(u.url, u.kind);
  });
}
