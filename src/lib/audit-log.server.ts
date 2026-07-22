/**
 * Server-side helper to write app-level events into `security_audit_log`.
 * Captures actor via `auth.uid()` inside the RPC, plus request IP / User-Agent.
 * Use for actions that don't hit an audited table (exports, signed URLs,
 * bulk operations) so the audit trail is complete.
 */
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

function getClientMeta() {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ua = getRequestHeader("user-agent") ?? null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch {}
    if (!ip) {
      const fwd = getRequestHeader("x-forwarded-for");
      const real = getRequestHeader("x-real-ip");
      const cf = getRequestHeader("cf-connecting-ip");
      ip = cf ?? real ?? (fwd ? fwd.split(",")[0]?.trim() : null) ?? null;
    }
  } catch {}
  return { ip, ua };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logAppEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  action: string,
  metadata?: Record<string, unknown> | null,
) {
  const { ip, ua } = getClientMeta();
  try {
    await supabase.rpc("log_security_event", {
      _action: action,
      _appointment_id: null,
      _from_status: null,
      _to_status: null,
      _reason: null,
      _metadata: (metadata ?? null) as never,
      _ip_address: ip,
      _user_agent: ua,
    } as never);
  } catch (e) {
    // Never block the caller on audit-log failures
    console.error("[logAppEvent] failed", (e as Error)?.message);
  }
}
