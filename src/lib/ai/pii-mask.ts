/**
 * G3 — Analytics AI: PII masking helpers.
 * Strip identifiers before sending payloads to the AI gateway.
 * We never ship names, phone numbers, emails, national IDs, MRNs, or
 * free-form patient identifiers. Only categorical + numeric features.
 */

const PHONE_RE = /\+?\d[\d\s\-().]{6,}\d/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ID_RE = /\b\d{9,12}\b/g;

export function maskText(input: string | null | undefined, maxLen = 2000): string {
  if (!input) return "";
  return input
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(ID_RE, "[id]")
    .slice(0, maxLen);
}

export function hashId(id: string | null | undefined): string {
  if (!id) return "";
  // Stable non-reversible short hash — good enough for correlation logs.
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}`;
}
