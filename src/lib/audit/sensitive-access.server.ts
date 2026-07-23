/**
 * Immutable audit trail for sensitive reads, exports, and downloads.
 *
 * Writes to `public.audit_logs`, whose RLS denies UPDATE/DELETE for every
 * non-service role (RESTRICTIVE `USING (false)` policies + revoked SQL
 * privileges). Every entry captures:
 *
 *   • WHO      — actor_id, actor_role
 *   • WHAT     — action (namespaced verb) + kind (read | export | download)
 *   • WHICH    — entity_type + entity_id (record identifier when applicable)
 *   • PERMISSION — the RBAC key that authorised the access, so auditors
 *                  can trace enforcement back to the catalog.
 *   • CONTEXT  — client IP, User-Agent, and caller-supplied metadata.
 *
 * Failures are swallowed — audit writes must never block the caller. Prefer
 * calling this alongside the existing `logAppEvent` helper (which mirrors
 * events into `security_audit_log`) so both trails stay in sync.
 */
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

export type SensitiveAccessKind = "read" | "export" | "download" | "issue";

export interface RecordSensitiveAccessInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  actorId: string;
  actorRole?: string | null;
  /** Namespaced verb, e.g. "audit_logs.viewed", "notifications.export_csv". */
  action: string;
  /** Logical entity kind, e.g. "audit_log", "medical_report", "patient_attachment". */
  entityType: string;
  /** Record identifier when the action targets a specific row. */
  entityId?: string | null;
  /** RBAC key that authorised access (from `PERMISSIONS.*`), or "self" for portal. */
  permission: string;
  kind: SensitiveAccessKind;
  status?: "success" | "failure";
  /** Additional structured context (row_count, filters, bucket, etc.). */
  metadata?: Record<string, unknown> | null;
}

function getClientMeta(): { ip: string | null; ua: string | null } {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ua = getRequestHeader("user-agent") ?? null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch {
      /* request scope may be unavailable */
    }
    if (!ip) {
      const fwd = getRequestHeader("x-forwarded-for");
      const real = getRequestHeader("x-real-ip");
      const cf = getRequestHeader("cf-connecting-ip");
      ip = cf ?? real ?? (fwd ? fwd.split(",")[0]?.trim() : null) ?? null;
    }
  } catch {
    /* headers unavailable outside request scope */
  }
  return { ip, ua };
}

export async function recordSensitiveAccess(
  input: RecordSensitiveAccessInput,
): Promise<void> {
  const { ip, ua } = getClientMeta();
  try {
    await input.supabase.from("audit_logs").insert({
      actor_id: input.actorId,
      actor_role: input.actorRole ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      ip_address: ip,
      user_agent: ua,
      metadata: {
        kind: input.kind,
        permission: input.permission,
        status: input.status ?? "success",
        ...(input.metadata ?? {}),
      },
    });
  } catch (e) {
    // Audit writes are best-effort — never block or leak the underlying error.
    console.error(
      "[recordSensitiveAccess] failed",
      (e as Error)?.message ?? "unknown",
    );
  }
}
