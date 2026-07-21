/**
 * SSE streaming client with automatic resume-on-disconnect.
 *
 * If the connection drops mid-stream (network glitch, edge worker restart,
 * upstream error) BEFORE receiving `[DONE]`, we retry with an exponential
 * backoff, sending the accumulated partial text back to the server via
 * `resume_partial`. The server injects a system nudge instructing the
 * model to continue from exactly where it stopped without repeating.
 *
 * We do NOT retry when:
 *  - the caller aborted (user pressed Stop / component unmounted)
 *  - the server returned a 4xx status (auth, rate limit, credits, bad body)
 *  - the stream completed normally ([DONE] received)
 */

import { reportStreamMetric, type StreamSurface } from "./stream-telemetry";

export type StreamRetryPhase = "reconnecting" | "resumed" | "failed";

export interface StreamWithResumeOptions {
  url: string;
  token?: string | null;
  /** Called before each attempt; return the JSON body to send. */
  buildBody: (resumePartial: string) => unknown;
  signal: AbortSignal;
  /** Streamed delta text and running accumulator. */
  onDelta: (delta: string, acc: string) => void;
  /** Optional usage object from `stream_options.include_usage=true` chunks. */
  onUsage?: (usage: Record<string, unknown>) => void;
  /** Optional model header exposed as X-Model. */
  onModel?: (model: string) => void;
  /** Reconnection lifecycle for UI hints. */
  onRetry?: (phase: StreamRetryPhase, attempt: number) => void;
  /** Map an HTTP status to a user-facing error message; return null to fall through. */
  mapStatusError?: (status: number) => string | null;
  /** Max resume attempts after the first try. Default 2. */
  maxRetries?: number;
  /** Surface tag for telemetry (public/portal/admin). */
  surface?: StreamSurface;
}

export interface StreamWithResumeResult {
  text: string;
  /** true = [DONE] received, false = user aborted or all retries exhausted. */
  completedNormally: boolean;
  /** Number of resume attempts that actually ran (0 = no resume needed). */
  resumeAttempts: number;
}

const DEFAULT_MAX_RETRIES = 2;
const BACKOFFS_MS = [500, 1500, 3000];

export async function streamChatWithResume(
  opts: StreamWithResumeOptions,
): Promise<StreamWithResumeResult> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  let acc = "";
  let attempt = 0;
  let resumeAttempts = 0;
  let doneSeen = false;

  while (attempt <= maxRetries) {
    if (opts.signal.aborted) {
      return { text: acc, completedNormally: false, resumeAttempts };
    }
    if (attempt > 0) {
      const delay = BACKOFFS_MS[Math.min(attempt - 1, BACKOFFS_MS.length - 1)];
      opts.onRetry?.("reconnecting", attempt);
      await sleep(delay, opts.signal);
      if (opts.signal.aborted) {
        return { text: acc, completedNormally: false, resumeAttempts };
      }
      resumeAttempts++;
    }

    let res: Response;
    try {
      res = await fetch(opts.url, {
        method: "POST",
        signal: opts.signal,
        headers: {
          "Content-Type": "application/json",
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
        body: JSON.stringify(opts.buildBody(acc)),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return { text: acc, completedNormally: false, resumeAttempts };
      }
      attempt++;
      continue;
    }

    // Non-retriable client errors: surface immediately.
    if (res.status >= 400 && res.status < 500) {
      const mapped = opts.mapStatusError?.(res.status) ?? null;
      const msg = mapped ?? `HTTP ${res.status}`;
      throw new StreamHttpError(msg, res.status);
    }
    if (!res.ok || !res.body) {
      // 5xx / no body → treat as recoverable
      attempt++;
      continue;
    }

    const modelHeader = res.headers.get("X-Model");
    if (modelHeader) opts.onModel?.(modelHeader);

    if (attempt > 0) opts.onRetry?.("resumed", attempt);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let streamError = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === "[DONE]") {
            doneSeen = true;
            continue;
          }
          try {
            const j = JSON.parse(payload);
            const delta = j?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              acc += delta;
              opts.onDelta(delta, acc);
            }
            if (j?.usage && opts.onUsage) {
              opts.onUsage(j.usage);
            }
          } catch {
            /* ignore partial frame */
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return { text: acc, completedNormally: false, resumeAttempts };
      }
      streamError = true;
    }

    if (doneSeen || !streamError) {
      // Reader ended cleanly (with or without explicit [DONE]).
      return { text: acc, completedNormally: true, resumeAttempts };
    }
    attempt++;
  }

  opts.onRetry?.("failed", attempt);
  // All retries exhausted with partial text — return what we have.
  return { text: acc, completedNormally: false, resumeAttempts };
}

export class StreamHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StreamHttpError";
    this.status = status;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
