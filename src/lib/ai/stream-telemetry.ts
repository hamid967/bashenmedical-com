/**
 * Client-side beacon for AI streaming telemetry. Prefers sendBeacon so the
 * event flushes even on page unload; falls back to fetch(keepalive).
 * Never throws — telemetry must not affect UX.
 */
export type StreamSurface = "public" | "portal" | "admin";

export interface StreamMetricPayload {
  surface: StreamSurface;
  model?: string | null;
  latency_ms: number;
  ttfb_ms?: number | null;
  delta_count: number;
  resume_attempts: number;
  completed: boolean;
  aborted?: boolean;
  error_status?: number | null;
  error_type?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
}

const ENDPOINT = "/api/public/ai/stream-metrics";

export function reportStreamMetric(payload: StreamMetricPayload): void {
  try {
    if (typeof window === "undefined") return;
    const body = JSON.stringify(payload);
    const nav = window.navigator;
    if (nav && typeof nav.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = nav.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}
