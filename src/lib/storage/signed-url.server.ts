/**
 * Unified signed-URL helper for patient-facing files (reports, labs,
 * radiology, invoices, attachments). Server-only.
 *
 * Centralises:
 *   - a single TTL constant (SIGNED_URL_TTL_SECONDS) so every download
 *     link expires at the same short window and the UI countdown always
 *     matches the server contract,
 *   - a bilingual error surface (Arabic / English) so callers can throw
 *     a message that displays cleanly on either locale of the portal,
 *   - a predictable return shape: { url, expiresIn, expiresAt }.
 *
 * Only use this helper from *.server.ts / *.functions.ts modules. Bucket
 * access still relies on RLS + authenticated context — this helper just
 * standardises the plumbing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SIGNED_URL_TTL_SECONDS, type DownloadLang } from "@/lib/download-error";

export { SIGNED_URL_TTL_SECONDS };

export interface CreatePatientSignedUrlInput {
  client: SupabaseClient<any, any, any>;
  bucket: string;
  path: string;
  /** Optional filename to force as `Content-Disposition: attachment; filename=...` */
  downloadName?: string;
  /** Override default TTL. Rarely needed. */
  ttlSeconds?: number;
  /** Locale for the thrown error message. Defaults to Arabic. */
  lang?: DownloadLang;
}

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
  },
  en: {
    empty: "Invalid file path.",
    failed: "Could not generate a download link.",
    noUrl: "No valid download URL was generated.",
  },
} as const;

export async function createPatientSignedUrl(
  input: CreatePatientSignedUrlInput,
): Promise<PatientSignedUrl> {
  const lang: DownloadLang = input.lang ?? "ar";
  const table = ERR[lang];
  const ttl = input.ttlSeconds ?? SIGNED_URL_TTL_SECONDS;
  const path = (input.path ?? "").trim();
  if (!path) throw new Error(table.empty);

  const opts = input.downloadName ? { download: input.downloadName } : undefined;
  const { data, error } = await input.client.storage
    .from(input.bucket)
    .createSignedUrl(path, ttl, opts);

  if (error) throw new Error(error.message || table.failed);
  if (!data?.signedUrl) throw new Error(table.noUrl);

  return {
    url: data.signedUrl,
    expiresIn: ttl,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}
