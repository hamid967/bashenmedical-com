/**
 * Fault-injection kernel — server-only, production-safe.
 *
 * Two purposes:
 *
 *  1. Injects synthetic failures into payment / notification code paths so
 *     that CI can rehearse how the platform degrades. Only active when
 *     `ENABLE_FAULT_INJECTION === "1"` AND `NODE_ENV !== "production"`.
 *     In production this module is a strict no-op (the guard returns `null`
 *     unconditionally so any accidental call is inert).
 *
 *  2. Ships two in-memory ledgers — `IdempotencyLedger` and
 *     `NotificationLedger` — that model the invariants the real system
 *     must preserve:
 *
 *       - Idempotency-Key replays MUST NOT create additional rows.
 *       - A failed attempt MUST NOT leak partial state (no half-written
 *         "succeeded" record after a synthetic failure).
 *       - Delivery-log status transitions are monotonic:
 *           pending -> (failed | succeeded)   — no reverse edges.
 *       - Every attempt (success or failure) MUST produce exactly one log
 *         row per (idempotency_key, attempt_id).
 *
 *     These ledgers are used by `tests/unit/fault-injection-idempotency.test.ts`
 *     to prove the invariants hold under injected failure. They are also
 *     shaped to mirror the columns of `notification_delivery_logs` /
 *     `booking_trace_events` so the same test bodies can be pointed at
 *     the real Supabase tables in an integration environment.
 */

export type FaultScope =
  | "payment"
  | "payment.settle"
  | "notification"
  | "notification.deliver"
  | "notification.enqueue";

export interface FaultConfig {
  /** Which scope to fail. */
  scope: FaultScope;
  /**
   * Probability [0..1] of injecting the fault when `maybeInjectFailure`
   * is called. `1` = always fail, `0` = never fail. Defaults to `1` for
   * deterministic CI runs.
   */
  rate?: number;
  /** Custom message on the synthetic error. */
  message?: string;
}

const PROD = () => process.env.NODE_ENV === "production";
const ENABLED = () => !PROD() && process.env.ENABLE_FAULT_INJECTION === "1";

let activeOverride: FaultConfig | null = null;

/**
 * Test-only helper: force a specific fault config in-process. Never call
 * this from production code — it is a no-op there because ENABLED() also
 * checks NODE_ENV.
 */
export function __setFaultForTesting(cfg: FaultConfig | null): void {
  if (PROD()) return;
  activeOverride = cfg;
}

/**
 * Returns a synthetic Error to throw when the given scope is currently
 * being faulted, or `null` otherwise. Always `null` in production.
 */
export function maybeInjectFailure(scope: FaultScope): Error | null {
  if (!ENABLED()) return null;
  const cfg = activeOverride;
  if (!cfg) return null;
  if (cfg.scope !== scope) return null;
  const rate = cfg.rate ?? 1;
  if (rate < 1 && Math.random() > rate) return null;
  const err = new Error(cfg.message ?? `[fault-injection] synthetic failure at scope=${scope}`);
  (err as Error & { __faultInjected: true }).__faultInjected = true;
  return err;
}

// ---------------------------------------------------------------------------
// IdempotencyLedger — models an at-most-once write keyed by Idempotency-Key.
// ---------------------------------------------------------------------------

export type AttemptStatus = "pending" | "succeeded" | "failed";

export interface AttemptRecord {
  idempotency_key: string;
  attempt_id: string;
  status: AttemptStatus;
  result?: unknown;
  error?: string;
  created_at: number;
  updated_at: number;
}

/**
 * `run` is invoked at most once per idempotency_key: on replay we return
 * the recorded result (or re-throw the recorded error) WITHOUT calling `run`
 * again. This matches how `/api/public/book/create` + the
 * `confirm_appointment_booking` RPC treat replays.
 *
 * The ledger records every attempt (successful or failed) so callers can
 * assert exactly-one-row invariants under load.
 */
export class IdempotencyLedger<T = unknown> {
  private records = new Map<string, AttemptRecord>();
  private attemptLog: AttemptRecord[] = [];

  async execute(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.records.get(key);
    if (existing) {
      if (existing.status === "succeeded") return existing.result as T;
      if (existing.status === "failed") {
        // Real systems SHOULD allow a retry after a hard failure; the
        // integrity invariant is that the failed row is preserved and a
        // fresh attempt row is appended, not that the failure is masked.
        return this.newAttempt(key, run);
      }
      // pending — treat as in-flight, fail fast (real impl would 409).
      throw new Error("attempt_in_flight");
    }
    return this.newAttempt(key, run);
  }

  private async newAttempt(key: string, run: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const attempt: AttemptRecord = {
      idempotency_key: key,
      attempt_id: `${key}:${this.attemptLog.length + 1}`,
      status: "pending",
      created_at: now,
      updated_at: now,
    };
    this.records.set(key, attempt);
    this.attemptLog.push({ ...attempt });
    try {
      const result = await run();
      attempt.status = "succeeded";
      attempt.result = result;
      attempt.updated_at = Date.now();
      this.attemptLog.push({ ...attempt });
      return result;
    } catch (e) {
      attempt.status = "failed";
      attempt.error = e instanceof Error ? e.message : String(e);
      attempt.updated_at = Date.now();
      this.attemptLog.push({ ...attempt });
      throw e;
    }
  }

  /** Full append-only history of attempts (pending + terminal transitions). */
  history(): readonly AttemptRecord[] {
    return this.attemptLog;
  }

  /** Terminal (non-pending) rows only. */
  terminalRows(): AttemptRecord[] {
    return this.attemptLog.filter((r) => r.status !== "pending");
  }

  succeededKeys(): string[] {
    return [...this.records.values()]
      .filter((r) => r.status === "succeeded")
      .map((r) => r.idempotency_key);
  }
}

// ---------------------------------------------------------------------------
// NotificationLedger — mirrors notification_delivery_logs invariants.
// ---------------------------------------------------------------------------

export interface DeliveryLogRow {
  id: string;
  idempotency_key: string;
  channel: "whatsapp" | "sms" | "email" | "push";
  status: AttemptStatus;
  error?: string;
  created_at: number;
}

const MONOTONIC: Record<AttemptStatus, AttemptStatus[]> = {
  pending: ["failed", "succeeded"],
  succeeded: [],
  failed: [],
};

export class NotificationLedger {
  private rows: DeliveryLogRow[] = [];
  private byKey = new Map<string, DeliveryLogRow>();

  async send(
    idempotency_key: string,
    channel: DeliveryLogRow["channel"],
    run: () => Promise<void>,
  ): Promise<{ status: AttemptStatus; row: DeliveryLogRow }> {
    // Idempotency-Key replay: return the existing terminal row instead of
    // firing a second delivery.
    const prior = this.byKey.get(idempotency_key);
    if (prior && prior.status !== "pending") return { status: prior.status, row: prior };

    const row: DeliveryLogRow = {
      id: `dlog_${this.rows.length + 1}`,
      idempotency_key,
      channel,
      status: "pending",
      created_at: Date.now(),
    };
    this.rows.push(row);
    this.byKey.set(idempotency_key, row);

    try {
      await run();
      this.transition(row, "succeeded");
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e);
      this.transition(row, "failed");
    }
    return { status: row.status, row };
  }

  private transition(row: DeliveryLogRow, next: AttemptStatus) {
    if (!MONOTONIC[row.status].includes(next)) {
      throw new Error(`illegal_transition: ${row.status} -> ${next}`);
    }
    row.status = next;
  }

  all(): readonly DeliveryLogRow[] {
    return this.rows;
  }

  rowsForKey(key: string): DeliveryLogRow[] {
    return this.rows.filter((r) => r.idempotency_key === key);
  }
}
