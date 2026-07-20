/**
 * Lightweight web-vitals reporter (LCP, CLS, INP, FCP, TTFB).
 * Zero-deps — uses PerformanceObserver directly. Client-only.
 *
 * Sends samples to `/api/public/hooks/web-vitals` via `navigator.sendBeacon`
 * when available. Route is not implemented yet — samples fail silently until
 * the collector lands, so this is safe to ship now.
 */

type Metric = {
  name: "LCP" | "CLS" | "INP" | "FCP" | "TTFB";
  value: number;
  id: string;
  url: string;
  ts: number;
};

const ENDPOINT = "/api/public/hooks/web-vitals";
const sent = new Set<string>();

function send(metric: Metric) {
  const key = metric.name;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    const body = JSON.stringify(metric);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => void 0);
    }
  } catch {
    /* noop */
  }
}

function newMetric(name: Metric["name"], value: number): Metric {
  return {
    name,
    value: Math.round(value * 1000) / 1000,
    id: `${name}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`,
    url: location.pathname,
    ts: Date.now(),
  };
}

function observe<T extends PerformanceEntry>(
  type: string,
  cb: (entries: T[]) => void,
  opts: PerformanceObserverInit = {},
): PerformanceObserver | null {
  try {
    const po = new PerformanceObserver((list) => cb(list.getEntries() as T[]));
    po.observe({ type, buffered: true, ...opts });
    return po;
  } catch {
    return null;
  }
}

export function startWebVitals() {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __wv_started?: boolean }).__wv_started) return;
  (window as unknown as { __wv_started?: boolean }).__wv_started = true;

  // LCP — report on visibility change / pagehide.
  let lcpValue = 0;
  const lcpPo = observe<PerformanceEntry & { renderTime?: number; loadTime?: number }>(
    "largest-contentful-paint",
    (entries) => {
      const last = entries[entries.length - 1];
      lcpValue = last.renderTime || last.loadTime || last.startTime;
    },
  );

  // CLS — accumulate session windows per web-vitals rules (simplified).
  let clsValue = 0;
  let clsEntries: PerformanceEntry[] = [];
  let sessionValue = 0;
  let sessionStart = 0;
  let sessionLast = 0;
  observe<PerformanceEntry & { value: number; hadRecentInput?: boolean }>(
    "layout-shift",
    (entries) => {
      for (const e of entries) {
        if (e.hadRecentInput) continue;
        if (sessionValue && (e.startTime - sessionLast > 1000 || e.startTime - sessionStart > 5000)) {
          sessionValue = 0;
          clsEntries = [];
        }
        if (!sessionValue) sessionStart = e.startTime;
        sessionLast = e.startTime;
        sessionValue += e.value;
        clsEntries.push(e);
        if (sessionValue > clsValue) clsValue = sessionValue;
      }
    },
  );

  // INP — max event duration (simplified; production libs use p98).
  let inpValue = 0;
  observe<PerformanceEntry & { duration: number }>(
    "event",
    (entries) => {
      for (const e of entries) {
        if (e.duration > inpValue) inpValue = e.duration;
      }
    },
    { durationThreshold: 40 } as PerformanceObserverInit & { durationThreshold: number },
  );

  // FCP + TTFB — from navigation and paint entries.
  observe<PerformancePaintTiming>("paint", (entries) => {
    for (const e of entries) {
      if (e.name === "first-contentful-paint") send(newMetric("FCP", e.startTime));
    }
  });
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav) send(newMetric("TTFB", Math.max(0, nav.responseStart - nav.startTime)));

  const flush = () => {
    if (lcpValue) {
      try {
        lcpPo?.disconnect();
      } catch {
        /* noop */
      }
      send(newMetric("LCP", lcpValue));
    }
    if (clsValue) send(newMetric("CLS", clsValue));
    if (inpValue) send(newMetric("INP", inpValue));
  };

  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  addEventListener("pagehide", flush, { once: true });
}
