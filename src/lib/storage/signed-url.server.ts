/**
 * Unified signed-URL helper for private documents (reports, labs, radiology,
 * invoices, complaint attachments, patient files, second-opinion uploads,
 * service-inquiry attachments). Server-only.
 *
 * RBAC contract
 * -------------
 * A signed URL grants time-boxed public access to a private object. If the
 * caller can trick the server into signing an arbitrary path, RLS on the
 * containing table is bypassed for the lifetime of the URL. To make that
 * impossible by construction, this helper NEVER signs an object unless
 * one of the following authorization proofs is provided:
 *
 *   1. `assertAuthorized: () => Promise<void>` — runs an ownership /
 *      permission check inside the helper. Must throw a `ForbiddenError`
 *      (or any Error) when the caller isn't allowed. The helper catches
 *      the error, records an audit event when possible, and re-throws a
 *      generic bilingual "لا تملك صلاحية الوصول لهذا الملف." so callers
 *      cannot leak which check failed.
 *
 *   2. `authorized: true` — literal sentinel. Only use when the caller has
 *      already performed a scoped RBAC check (e.g. loaded the row under
 *      `context.supabase` with RLS applied and matched it to `userId`).
 *      Passing `true` unconditionally is a bug — code review MUST verify
 *      an ownership check precedes the sentinel.
 *
 * Every issuance is optionally passed through `audit()` after success so
 * downstream telemetry (audit_logs, security_audit_log) has an immutable
 * record of who received a link, for which object, and when.
 *
 * Only import this from `.server.ts` / `.functions.ts` modules. Bucket
 * access still relies on RLS + authenticated context — this helper just
 * standardises the plumbing AND enforces that RBAC always runs first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNED_URL_TTL_SECONDS, type DownloadLang } from "@/lib/download-error";

export { SIGNED_URL_TTL_SECONDS };

export class ForbiddenSignedUrlError extends Error {
  constructor(message = "لا تملك صلاحية الوصول لهذا الملف.") {
    super(message);
    this.name = "ForbiddenSignedUrlError";
  }
}

type AuthProof =
  | { authorized: true; assertAuthorized?: never }
  | { assertAuthorized: () => Promise<void> | void; authorized?: never };

export type CreatePatientSignedUrlInput = {
  client: SupabaseClient<any, any, any>;
  bucket: string;
  path: string;
  /** Optional filename to force as `Content-Disposition: attachment; filename=...` */
  downloadName?: string;
  /** Override default TTL. Rarely needed. */
  ttlSeconds?: number;
  /** Locale for the thrown error message. Defaults to Arabic. */
  lang?: DownloadLang;
  /** Optional post-issuance audit hook. Failures are swallowed. */
  audit?: (result: { ok: true; expiresIn: number } | { ok: false; reason: string }) =>
    | Promise<void>
    | void;
} & AuthProof;

export interface PatientSignedUrl {
  url: string;
  expiresIn: number;
  /** ISO timestamp when the signed URL expires (client can render countdown). */
  expiresAt: string;
}

const ERR = {
  ar: {
    empty: "المسار غير صالح.",
    failed: "تعذّر إنشاء رابط التنزيل.",
    noUrl: "لم يتم إنشاء رابط تنزيل صالح.",
    forbidden: "لا تملك صلاحية الوصول لهذا الملف.",
  },
  en: {
    empty: "Invalid file path.",
    failed: "Could not generate a download link.",
    noUrl: "No valid download URL was generated.",
    forbidden: "You are not authorized to access this file.",
  },
} as const;

async function safeAudit(
  audit: CreatePatientSignedUrlInput["audit"],
  event: { ok: true; expiresIn: number } | { ok: false; reason: string },
) {
  if (!audit) return;
  try {
    await audit(event);
  } catch {
    /* audit is best-effort and must never block or leak */
  }
}

export async function createPatientSignedUrl(
  input: CreatePatientSignedUrlInput,
): Promise<PatientSignedUrl> {
  const lang: DownloadLang = input.lang ?? "ar";
  const table = ERR[lang];
  const ttl = input.ttlSeconds ?? SIGNED_URL_TTL_SECONDS;
  const path = (input.path ?? "").trim();
  if (!path) throw new Error(table.empty);

  // ---- RBAC gate ---------------------------------------------------------
  const auditFn = input.audit;
  const assertFn = (input as { assertAuthorized?: () => Promise<void> | void }).assertAuthorized;
  const authorizedFlag = (input as { authorized?: unknown }).authorized === true;
  if (assertFn) {
    try {
      await assertFn();
    } catch (err) {
      await safeAudit(auditFn, {
        ok: false,
        reason: err instanceof Error ? err.message : "forbidden",
      });
      // Never leak the underlying reason to the caller.
      throw new ForbiddenSignedUrlError(table.forbidden);
    }
  } else if (!authorizedFlag) {
    // Runtime safety net for callers that bypass the TS discriminated union.
    await safeAudit(auditFn, { ok: false, reason: "missing_authorization_proof" });
    throw new ForbiddenSignedUrlError(table.forbidden);
  }

  const opts = input.downloadName ? { download: input.downloadName } : undefined;
  const { data, error } = await input.client.storage
    .from(input.bucket)
    .createSignedUrl(path, ttl, opts);

  if (error) {
    await safeAudit(auditFn, { ok: false, reason: error.message ?? "sign_error" });
    throw new Error(error.message || table.failed);
  }
  if (!data?.signedUrl) {
    await safeAudit(auditFn, { ok: false, reason: "no_signed_url" });
    throw new Error(table.noUrl);
  }

  await safeAudit(auditFn, { ok: true, expiresIn: ttl });

  return {
    url: data.signedUrl,
    expiresIn: ttl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}
