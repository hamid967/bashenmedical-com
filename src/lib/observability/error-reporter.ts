/**
 * E1 Observability — browser-side error reporter.
 *
 * Wires window.onerror + window.onunhandledrejection to POST minimal,
 * PII-free error samples to /api/public/hooks/errors via sendBeacon
 * (falling back to fetch keepalive). Deduplicates within a short window
 * so a flapping component doesn't flood the sink.
 *
 * Import in `src/routes/__root.tsx` from a `useEffect` — never at module
 * scope — to keep SSR clean.
 */

type Mechanism = "onerror" | "unhandledrejection" | "react_error_boundary" | "manual";
type Severity = "error" | "warning" | "info";

const ENDPOINT = "/api/public/hooks/errors";
const DEDUPE_WINDOW_MS = 10_000;
const seen = new Map<string, number>();
let installed = false;

function fingerprint(message: string, route: string, mechanism: Mechanism): string {
  return `${mechanism}|${route}|${message}`.slice(0, 256);
}

function shouldEmit(fp: string): boolean {
  const now = Date.now();
  const last = seen.get(fp) ?? 0;
  if (now - last < DEDUPE_WINDOW_MS) return false;
  seen.set(fp, now);
  if (seen.size > 200) {
    // Evict oldest half
    const entries = [...seen.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < entries.length / 2; i++) seen.delete(entries[i][0]);
  }
  return true;
}

function post(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never surface reporter failures
  }
}

export function reportBrowserError(
  error: unknown,
  opts: { mechanism?: Mechanism; severity?: Severity; extra?: Record<string, unknown> } = {},
) {
  if (typeof window === "undefined") return;
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  if (!message || message.length > 2000) return;
  const stack =
    error instanceof Error && error.stack ? String(error.stack).slice(0, 8000) : undefined;
  const route = window.location.pathname + window.location.search;
  const mechanism = opts.mechanism ?? "manual";
  const fp = fingerprint(message, route, mechanism);
  if (!shouldEmit(fp)) return;
  post({
    message,
    route,
    stack,
    mechanism,
    severity: opts.severity ?? "error",
    release: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_APP_RELEASE,
    extra: opts.extra,
  });
}

export function installBrowserErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) => {
    reportBrowserError(ev.error ?? ev.message ?? "unknown error", { mechanism: "onerror" });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = (ev as PromiseRejectionEvent).reason;
    reportBrowserError(reason ?? "unhandled rejection", { mechanism: "unhandledrejection" });
  });
}
