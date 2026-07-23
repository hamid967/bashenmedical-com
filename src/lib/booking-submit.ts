/**
 * Shared submission helper for the booking / service-request forms.
 * Wraps `fetch('/api/public/book/create', …)` with:
 *   - a 20s abort timeout,
 *   - classification of failures into user-facing kinds,
 *   - one consistent { ok, reference, message, kind } shape.
 *
 * The server endpoint already returns { ok, kind, message } with Arabic
 * messages for validation and DB errors — we preserve those verbatim and
 * only synthesize a message for transport-level failures (network, timeout,
 * malformed JSON, 5xx without a body).
 */

export type BookingSubmitPayload = {
  patient_name: string;
  patient_phone: string;
  patient_email?: string | null;
  appointment_date: string;
  appointment_time: string;
  reason?: string;
  national_id?: string | null;
  gender?: "male" | "female";
  specialty_id?: string | null;
  doctor_id?: string | null;
  reminder_24h?: boolean;
  reminder_2h?: boolean;
  insurance_provider_id?: string | null;
  insurance_policy_number?: string | null;
  insurance_member_id?: string | null;
};

export type BookingSubmitKind =
  "success" | "validation" | "db" | "conflict" | "network" | "timeout" | "server" | "unknown";

export type BookingSubmitResult =
  | { ok: true; kind: "success"; reference: string | null }
  | {
      ok: false;
      kind: Exclude<BookingSubmitKind, "success">;
      message: string;
      /** Machine-readable error code from the server; `SLOT_TAKEN` on 409 slot clash. */
      code?: string;
    };

const TIMEOUT_MS = 20_000;

const FALLBACK_MESSAGES: Record<Exclude<BookingSubmitKind, "success">, string> = {
  validation: "تحقّق من صحة البيانات المدخلة وحاول مجددًا.",
  db: "تعذّر حفظ الطلب حاليًا. حاول بعد قليل أو تواصل مع الاستقبال.",
  conflict: "الموعد محجوز مسبقًا. اختر وقتًا آخر.",
  network: "تعذّر الاتصال بالخادم. تحقّق من اتصال الإنترنت وحاول مرة أخرى.",
  timeout: "استغرقت العملية وقتًا أطول من المعتاد. حاول مرة أخرى.",
  server: "حدث خطأ مؤقت في الخادم. حاول مرة أخرى بعد قليل.",
  unknown: "تعذّر إرسال الطلب. حاول مرة أخرى.",
};

const IDEMPOTENCY_KEY_STORAGE = "booking:idempotency-key";

/**
 * Return the current in-flight booking's idempotency key, creating one on
 * first use. Persisted in sessionStorage so a retry after a timeout — or
 * even after a page reload — sends the same key and the server replays the
 * original success instead of creating a duplicate.
 * Cleared with clearBookingIdempotencyKey() after a successful submit or
 * when the user starts a brand-new booking.
 */
function getOrCreateIdempotencyKey(): string {
  if (typeof window === "undefined") {
    return `srv-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
  try {
    const existing = sessionStorage.getItem(IDEMPOTENCY_KEY_STORAGE);
    if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) return existing;
  } catch {
    /* ignore */
  }
  const fresh =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `k-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  try {
    sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE, fresh);
  } catch {
    /* ignore */
  }
  return fresh;
}

export function clearBookingIdempotencyKey(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export async function submitBooking(payload: BookingSubmitPayload): Promise<BookingSubmitResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Idempotency-Key: stable per in-flight booking attempt. Persisted in
  // sessionStorage so a retry after a network timeout — or after the user
  // hits reload before the response arrived — sends the SAME key and the
  // server returns the same reference instead of creating a duplicate row.
  // Cleared by the caller (see /book handleSubmit success + handleReset).
  const idempotencyKey = getOrCreateIdempotencyKey();

  let res: Response;
  try {
    res = await fetch("/api/public/book/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err as { name?: string } | null)?.name === "AbortError";
    if (isAbort) {
      return { ok: false, kind: "timeout", message: FALLBACK_MESSAGES.timeout };
    }
    return { ok: false, kind: "network", message: FALLBACK_MESSAGES.network };
  }
  clearTimeout(timer);

  let body: {
    ok?: boolean;
    kind?: string;
    code?: string;
    message?: string;
    reference?: string | null;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Non-JSON response (e.g. a bare 502 from an edge proxy). Fall back
    // based on status code.
    const kind: Exclude<BookingSubmitKind, "success"> = res.status >= 500 ? "server" : "unknown";
    return { ok: false, kind, message: FALLBACK_MESSAGES[kind] };
  }

  if (res.ok && body.ok) {
    // Success — retire the current key so the next booking gets a fresh one.
    clearBookingIdempotencyKey();
    return { ok: true, kind: "success", reference: body.reference ?? null };
  }

  // A 409 with code=SLOT_TAKEN is the canonical slot-clash signal from the
  // server (fast-path check OR the RPC's 23505 on the partial UNIQUE INDEX).
  // Normalize kind to "conflict" so downstream UI treats it uniformly.
  const isSlotTaken = res.status === 409 || body.code === "SLOT_TAKEN" || body.kind === "conflict";

  // Malformed Idempotency-Key: rotate the stored key so an immediate retry
  // uses a fresh, well-formed one. Surfaced to the UI as `validation`
  // with an explicit code so the message can be specific.
  const isInvalidIdemKey = body.code === "INVALID_IDEMPOTENCY_KEY";
  if (isInvalidIdemKey) {
    clearBookingIdempotencyKey();
  }

  // Validation and conflict errors also retire the key: the payload will
  // change before the next attempt (fixed field, new slot), so reusing the
  // same key would incorrectly replay the OLD attempt if it had ever
  // partially succeeded. `network`/`timeout`/`server` KEEP the key so an
  // immediate retry is idempotent against a possibly-persisted row.
  if (body.kind === "validation" || isSlotTaken) {
    clearBookingIdempotencyKey();
  }

  const kind: Exclude<BookingSubmitKind, "success"> = isSlotTaken
    ? "conflict"
    : body.kind === "validation" || body.kind === "db"
      ? body.kind
      : res.status >= 500
        ? "server"
        : "unknown";
  return {
    ok: false,
    kind,
    message: body.message?.trim() || FALLBACK_MESSAGES[kind],
    code: body.code,
  };
}
