/**
 * Unit tests for the central booking-error mapping.
 * Run: bun test tests/unit/booking-errors.test.ts
 */
import { describe, test, expect } from "bun:test";
import {
  describeBookingError,
  kindToCode,
  formatCorrelationId,
  localizedMessage,
} from "../../src/lib/booking/errors";

describe("booking error mapping", () => {
  test("resolves known codes across casings", () => {
    expect(describeBookingError("SLOT_TAKEN").code).toBe("SLOT_TAKEN");
    expect(describeBookingError("slot-taken").code).toBe("SLOT_TAKEN");
    expect(describeBookingError("hold_expired").code).toBe("HOLD_EXPIRED");
  });

  test("falls back to UNKNOWN for unrecognised input", () => {
    expect(describeBookingError(null).code).toBe("UNKNOWN");
    expect(describeBookingError("").code).toBe("UNKNOWN");
    expect(describeBookingError("nope").code).toBe("UNKNOWN");
  });

  test("prefers server code over transport kind", () => {
    expect(kindToCode("conflict", "HOLD_EXPIRED")).toBe("HOLD_EXPIRED");
    expect(kindToCode("network", null)).toBe("NETWORK");
    expect(kindToCode("conflict", null)).toBe("SLOT_TAKEN");
    expect(kindToCode("db", null)).toBe("SERVER");
  });

  test("localized copy differs across languages and is non-empty", () => {
    const d = describeBookingError("SLOT_TAKEN");
    expect(localizedMessage(d, "ar").length).toBeGreaterThan(5);
    expect(localizedMessage(d, "en").length).toBeGreaterThan(5);
    expect(localizedMessage(d, "ar")).not.toBe(localizedMessage(d, "en"));
  });

  test("marks non-recoverable states clearly", () => {
    expect(describeBookingError("INVALID_IDEMPOTENCY_KEY").recoverable).toBe(false);
    expect(describeBookingError("SESSION_EXPIRED").recoverable).toBe(false);
    expect(describeBookingError("SLOT_TAKEN").recoverable).toBe(true);
  });

  test("formats correlation ID as short suffix", () => {
    expect(formatCorrelationId(null)).toBeNull();
    expect(formatCorrelationId("abc")).toBeNull();
    expect(formatCorrelationId("corr-1234567890abcdef")).toBe("90ABCDEF");
  });
});
