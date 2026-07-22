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
  /**
   * Live budget guard. Called after each delta with the running output text.
   * Return an object `{ ok:false, message }` to abort the stream cleanly and
   * surface the message to the user (treated like a completed stop, not an error).
   */
  budgetCheck?: (outputSoFar: string) => { ok: true } | { ok: false; message: string };
}

export interface StreamWithResumeResult {
  text: string;
  /** true = [DONE] received, false = user aborted or all retries exhausted. */
  completedNormally: boolean;
  /** Number of resume attempts that actually ran (0 = no resume needed). */
  resumeAttempts: number;
  /** Set when a budget cap stopped the stream mid-flight. */
  budgetStop?: { message: string };
}

const DEFAULT_MAX_RETRIES = 2;
const BACKOFFS_MS = [500, 1500, 3000];

export async function streamChatWithResume(
  opts: StreamWithResumeOptions,
): Promise<StreamWithResumeResult> {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  let acc = "";
  let attempt = 0;
  let resumeAttempts = 0;
  let doneSeen = false;
  let deltaCount = 0;
  let ttfbMs: number | null = null;
  let observedModel: string | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  const emit = (
    outcome: "completed" | "aborted" | "failed",
    errorStatus: number | null,
    errorType: string | null,
  ) => {
    if (!opts.surface) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    reportStreamMetric({
      surface: opts.surface,
      model: observedModel,
      latency_ms: Math.max(0, Math.round(now - startedAt)),
      ttfb_ms: ttfbMs != null ? Math.max(0, Math.round(ttfbMs)) : null,
      delta_count: deltaCount,
      resume_attempts: resumeAttempts,
      completed: outcome === "completed",
      aborted: outcome === "aborted",
      error_status: errorStatus,
      error_type: errorType,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    });
  };

  try {
    while (attempt <= maxRetries) {
      if (opts.signal.aborted) {
        emit("aborted", null, null);
        return { text: acc, completedNormally: false, resumeAttempts };
      }
      if (attempt > 0) {
        const delay = BACKOFFS_MS[Math.min(attempt - 1, BACKOFFS_MS.length - 1)];
        opts.onRetry?.("reconnecting", attempt);
        await sleep(delay, opts.signal);
        if (opts.signal.aborted) {
          emit("aborted", null, null);
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
          emit("aborted", null, null);
          return { text: acc, completedNormally: false, resumeAttempts };
        }
        attempt++;
        continue;
      }

      // Non-retriable client errors: surface immediately.
      if (res.status >= 400 && res.status < 500) {
        const mapped = opts.mapStatusError?.(res.status) ?? null;
        const msg = mapped ?? `HTTP ${res.status}`;
        emit("failed", res.status, "http_client");
        throw new StreamHttpError(msg, res.status);
      }
      if (!res.ok || !res.body) {
        attempt++;
        continue;
      }

      if (ttfbMs == null) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        ttfbMs = now - startedAt;
      }
      const modelHeader = res.headers.get("X-Model");
      if (modelHeader) {
        observedModel = modelHeader;
        opts.onModel?.(modelHeader);
      }

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
                deltaCount++;
                opts.onDelta(delta, acc);
                if (opts.budgetCheck) {
                  const check = opts.budgetCheck(acc);
                  if (!check.ok) {
                    try {
                      await reader.cancel();
                    } catch {
                      /* ignore */
                    }
                    emit("aborted", null, "budget_exceeded");
                    return {
                      text: acc,
                      completedNormally: false,
                      resumeAttempts,
                      budgetStop: { message: check.message },
                    };
                  }
                }
              }
              if (j?.usage) {
                const u = j.usage as Record<string, unknown>;
                if (typeof u.prompt_tokens === "number") promptTokens = u.prompt_tokens;
                if (typeof u.completion_tokens === "number") completionTokens = u.completion_tokens;
                opts.onUsage?.(u);
              }
            } catch {
              /* ignore partial frame */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          emit("aborted", null, null);
          return { text: acc, completedNormally: false, resumeAttempts };
        }
        streamError = true;
      }

      if (doneSeen || !streamError) {
        emit("completed", null, null);
        return { text: acc, completedNormally: true, resumeAttempts };
      }
      attempt++;
    }

    opts.onRetry?.("failed", attempt);
    emit("failed", null, "resume_exhausted");
    return { text: acc, completedNormally: false, resumeAttempts };
  } catch (err) {
    if (err instanceof StreamHttpError) throw err;
    emit("failed", null, (err as Error).name || "unknown");
    throw err;
  }
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
