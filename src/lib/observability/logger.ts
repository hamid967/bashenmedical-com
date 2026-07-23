/**
 * Phase 1 — safe structured logger (browser + server safe).
 *
 * Contract:
 *  - Emits one JSON-ish console line per event with a correlation id.
 *  - NEVER accepts patient / identity / payment / medical fields; a small
 *    denylist strips them defensively if a caller passes them by mistake.
 *  - Level filtered by NODE_ENV in production (error/warn always, info only
 *    when `VITE_LOG_LEVEL=info` or on the server).
 *
 * Import: `import { log } from "@/lib/observability/logger"`.
 */
type Level = "debug" | "info" | "warn" | "error";

const DENY_KEYS = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "national_id",
  "iqama",
  "phone",
  "mobile",
  "email",
  "address",
  "dob",
  "birth_date",
  "card",
  "cvc",
  "cvv",
  "pan",
  "diagnosis",
  "medical_history",
  "prescription",
  "medication",
  "allergy",
  "patient_id",
  "patient_name",
  "medical_record_number",
  "mrn",
]);

function scrub(value: unknown, depth = 0): unknown {
  if (value == null || depth > 3) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DENY_KEYS.has(k.toLowerCase())) {
        out[k] = "[redacted]";
      } else {
        out[k] = scrub(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function makeCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function shouldEmit(level: Level): boolean {
  if (level === "error" || level === "warn") return true;
  if (typeof window === "undefined") return true;
  try {
    // @ts-expect-error - Vite injects this at build time
    return import.meta.env?.MODE !== "production" || import.meta.env?.VITE_LOG_LEVEL === "info";
  } catch {
    return false;
  }
}

function emit(level: Level, event: string, data?: Record<string, unknown>) {
  if (!shouldEmit(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    correlationId: (data?.correlationId as string) ?? makeCorrelationId(),
    ...(data ? (scrub(data) as Record<string, unknown>) : {}),
  };
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "info"
          ? console.info
          : console.debug;
  fn(JSON.stringify(payload));
}

export const log = {
  debug: (event: string, data?: Record<string, unknown>) => emit("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
  newCorrelationId: makeCorrelationId,
};
