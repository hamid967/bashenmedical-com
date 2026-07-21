/**
 * Front-end reporter for 401/403 permission errors on /api and RPC calls.
 *
 * Writes to `public.record_permission_error` (SECURITY DEFINER, bounded).
 * Never blocks user flow — failures are swallowed silently.
 *
 * Wired in two places:
 *   - Global fetch wrapper (see `installPermissionErrorReporter`).
 *   - `reportRpcPermissionError()` on any `supabase.rpc()` catch that returns
 *     Postgres SQLSTATE 42501 or PostgREST 401/403.
 */
import { supabase } from "@/integrations/supabase/client";

type Ctx = {
  statusCode: 401 | 403;
  route: string;
  sqlstate?: string | null;
  message?: string | null;
  roleHint?: "anon" | "authenticated" | null;
};

// Simple client-side sampling + rate cap so a spike doesn't self-DoS.
const SAMPLE_WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let windowStart = 0;
let sent = 0;

function shouldSend(): boolean {
  const now = Date.now();
  if (now - windowStart > SAMPLE_WINDOW_MS) {
    windowStart = now;
    sent = 0;
  }
  if (sent >= MAX_PER_WINDOW) return false;
  sent++;
  return true;
}

export async function reportPermissionError(ctx: Ctx): Promise<void> {
  if (!shouldSend()) return;
  try {
    await supabase.rpc("record_permission_error", {
      _status_code: ctx.statusCode,
      _route: ctx.route.slice(0, 512),
      _sqlstate: ctx.sqlstate ?? null,
      _message: (ctx.message ?? "").slice(0, 500),
      _role_hint: ctx.roleHint ?? null,
    });
  } catch {
    /* swallow — telemetry must never break the app */
  }
}

/** Call once during app bootstrap on the client. Idempotent. */
export function installPermissionErrorReporter(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __permErrReporterInstalled?: boolean };
  if (w.__permErrReporterInstalled) return;
  w.__permErrReporterInstalled = true;

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await origFetch(input as RequestInfo, init);
    if (res.status === 401 || res.status === 403) {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
      try {
        const u = new URL(url, window.location.origin);
        // Only /api/* and Supabase REST/RPC surface (rest/v1, rpc/*)
        const path = u.pathname;
        const isApi = path.startsWith("/api/");
        const isRest = path.includes("/rest/v1/");
        if (isApi || isRest) {
          const route = isRest
            ? `rpc:${path.split("/rest/v1/").pop() ?? path}`
            : path;
          void reportPermissionError({
            statusCode: res.status as 401 | 403,
            route,
          });
        }
      } catch {
        /* URL parse failure — ignore */
      }
    }
    return res;
  };
}

/** Manual helper for supabase.rpc() catch blocks. */
export function reportRpcPermissionError(fn: string, err: unknown): void {
  const e = err as { code?: string; status?: number; message?: string };
  const status = e?.status === 401 ? 401 : 403;
  const sqlstate = e?.code ?? null;
  if (sqlstate !== "42501" && e?.status !== 401 && e?.status !== 403) return;
  void reportPermissionError({
    statusCode: status,
    route: `rpc:${fn}`,
    sqlstate,
    message: e?.message ?? null,
  });
}
