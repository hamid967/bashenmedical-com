/**
 * Chaos: payment + notification fault-injection tests.
 *
 * Run: bun test tests/unit/fault-injection-idempotency.test.ts
 *
 * These tests exercise the invariants that the platform must preserve
 * when a payment settlement or an outbound notification fails:
 *
 *   1. Log integrity     — every attempt produces exactly one terminal
 *                          row (success xor failure). No pending row is
 *                          left behind and no half-written "succeeded"
 *                          row appears when the underlying call threw.
 *   2. Idempotency       — replaying the same Idempotency-Key after a
 *                          successful settle returns the recorded result
 *                          without invoking the side effect a second time.
 *   3. Monotonic state   — delivery log status transitions only forward
 *                          (pending -> succeeded | failed). Never backwards.
 *   4. Failure isolation — a failure on one key does not corrupt an
 *                          unrelated key's ledger row.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __setFaultForTesting,
  IdempotencyLedger,
  maybeInjectFailure,
  NotificationLedger,
} from "../../src/lib/testing/fault-injection.server";

beforeEach(() => {
  process.env.ENABLE_FAULT_INJECTION = "1";
  process.env.NODE_ENV = "test";
  __setFaultForTesting(null);
});

afterEach(() => {
  __setFaultForTesting(null);
  delete process.env.ENABLE_FAULT_INJECTION;
});

describe("fault-injection kernel", () => {
  test("is inert in production even when opted-in", () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_FAULT_INJECTION = "1";
    __setFaultForTesting({ scope: "payment" });
    expect(maybeInjectFailure("payment")).toBeNull();
    process.env.NODE_ENV = "test";
  });

  test("is inert when the env flag is missing", () => {
    delete process.env.ENABLE_FAULT_INJECTION;
    __setFaultForTesting({ scope: "payment" });
    expect(maybeInjectFailure("payment")).toBeNull();
  });

  test("only fires for the configured scope", () => {
    __setFaultForTesting({ scope: "notification" });
    expect(maybeInjectFailure("payment")).toBeNull();
    expect(maybeInjectFailure("notification")).toBeInstanceOf(Error);
  });
});

describe("payment failure — idempotency + log integrity", () => {
  test("failed settle preserves the failed row and allows a clean retry", async () => {
    const ledger = new IdempotencyLedger<{ receipt: string }>();
    const key = "pay_2026_07_24_001";

    // Attempt 1: fault injected — must throw AND record a failed row.
    __setFaultForTesting({ scope: "payment.settle", message: "gateway_5xx" });
    await expect(
      ledger.execute(key, async () => {
        const f = maybeInjectFailure("payment.settle");
        if (f) throw f;
        return { receipt: "r-1" };
      }),
    ).rejects.toThrow("gateway_5xx");

    const failed = ledger.terminalRows();
    expect(failed).toHaveLength(1);
    expect(failed[0].status).toBe("failed");
    expect(failed[0].idempotency_key).toBe(key);

    // Attempt 2: fault cleared — retry succeeds and records a SECOND row
    // (append-only history), never overwrites the failed one.
    __setFaultForTesting(null);
    const ok = await ledger.execute(key, async () => ({ receipt: "r-2" }));
    expect(ok.receipt).toBe("r-2");

    const terminal = ledger.terminalRows();
    expect(terminal).toHaveLength(2);
    expect(terminal.map((r) => r.status)).toEqual(["failed", "succeeded"]);
    expect(ledger.succeededKeys()).toEqual([key]);
  });

  test("idempotent replay after success does not invoke the side effect twice", async () => {
    const ledger = new IdempotencyLedger<{ receipt: string }>();
    const key = "pay_2026_07_24_002";
    let sideEffectCount = 0;

    const run = async () => {
      sideEffectCount += 1;
      return { receipt: `r-${sideEffectCount}` };
    };

    const first = await ledger.execute(key, run);
    const replay = await ledger.execute(key, run);
    const replay2 = await ledger.execute(key, run);

    expect(sideEffectCount).toBe(1);
    expect(replay).toEqual(first);
    expect(replay2).toEqual(first);
    // One pending + one terminal on the first attempt; replays add nothing.
    expect(ledger.terminalRows()).toHaveLength(1);
  });

  test("concurrent replays of the same key still record exactly one success", async () => {
    const ledger = new IdempotencyLedger<{ receipt: string }>();
    const key = "pay_2026_07_24_003";
    let sideEffectCount = 0;

    const run = async () => {
      sideEffectCount += 1;
      // Small delay to widen the concurrency window.
      await new Promise((r) => setTimeout(r, 5));
      return { receipt: "r-only" };
    };

    // First call resolves and records; subsequent parallel calls arrive
    // AFTER the terminal row is written and replay the recorded result.
    const first = await ledger.execute(key, run);
    const results = await Promise.all(Array.from({ length: 25 }, () => ledger.execute(key, run)));

    expect(sideEffectCount).toBe(1);
    expect(results.every((r) => r.receipt === first.receipt)).toBe(true);
    expect(ledger.succeededKeys()).toEqual([key]);
  });

  test("failure on one key does not corrupt an unrelated key", async () => {
    const ledger = new IdempotencyLedger<{ ok: true }>();

    __setFaultForTesting({ scope: "payment.settle" });
    await expect(
      ledger.execute("bad-key", async () => {
        const f = maybeInjectFailure("payment.settle");
        if (f) throw f;
        return { ok: true as const };
      }),
    ).rejects.toBeInstanceOf(Error);

    __setFaultForTesting(null);
    const ok = await ledger.execute("good-key", async () => ({ ok: true as const }));
    expect(ok.ok).toBe(true);

    const rows = ledger.terminalRows();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.idempotency_key === "bad-key")?.status).toBe("failed");
    expect(rows.find((r) => r.idempotency_key === "good-key")?.status).toBe("succeeded");
  });
});

describe("notification failure — delivery log integrity", () => {
  test("injected delivery failure records exactly one failed row", async () => {
    const log = new NotificationLedger();
    __setFaultForTesting({ scope: "notification.deliver", message: "whatsapp_5xx" });

    const { status, row } = await log.send("notif-1", "whatsapp", async () => {
      const f = maybeInjectFailure("notification.deliver");
      if (f) throw f;
    });

    expect(status).toBe("failed");
    expect(row.error).toBe("whatsapp_5xx");
    expect(log.rowsForKey("notif-1")).toHaveLength(1);
  });

  test("replay of the same Idempotency-Key returns the terminal row, no second send", async () => {
    const log = new NotificationLedger();
    let sends = 0;

    const first = await log.send("notif-2", "sms", async () => {
      sends += 1;
    });
    const replay = await log.send("notif-2", "sms", async () => {
      sends += 1;
    });

    expect(sends).toBe(1);
    expect(first.status).toBe("succeeded");
    expect(replay.row.id).toBe(first.row.id);
    expect(log.rowsForKey("notif-2")).toHaveLength(1);
  });

  test("status transitions are strictly monotonic (no pending row survives)", async () => {
    const log = new NotificationLedger();
    __setFaultForTesting({ scope: "notification.deliver" });
    await log.send("notif-3", "push", async () => {
      const f = maybeInjectFailure("notification.deliver");
      if (f) throw f;
    });
    __setFaultForTesting(null);
    await log.send("notif-4", "email", async () => {});

    for (const r of log.all()) {
      expect(r.status === "succeeded" || r.status === "failed").toBe(true);
    }
  });

  test("50% fault rate — every attempt still produces exactly one log row", async () => {
    const log = new NotificationLedger();
    __setFaultForTesting({ scope: "notification.deliver", rate: 0.5 });
    const keys = Array.from({ length: 40 }, (_, i) => `notif-mixed-${i}`);
    await Promise.all(
      keys.map((k) =>
        log.send(k, "whatsapp", async () => {
          const f = maybeInjectFailure("notification.deliver");
          if (f) throw f;
        }),
      ),
    );
    // one row per unique key, no duplicates, no pending survivors.
    expect(log.all()).toHaveLength(keys.length);
    for (const k of keys) expect(log.rowsForKey(k)).toHaveLength(1);
    expect(log.all().every((r) => r.status !== "pending")).toBe(true);
  });
});
