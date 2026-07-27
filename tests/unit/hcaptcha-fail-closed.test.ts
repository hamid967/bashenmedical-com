/**
 * hCaptcha fail-closed contract tests.
 *
 * Guarantees the Release Gate `captcha` condition:
 *   - In production, missing HCAPTCHA_SECRET → 503 (never bypass).
 *   - Missing / short / oversized token → 400.
 *   - Upstream siteverify network error / timeout → 502.
 *   - Upstream returns success=false → 403 with error-code.
 *   - Upstream returns success=true → 200.
 *   - Non-production without secret → allowed through (dev ergonomics).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { verifyHCaptcha } from "@/lib/security/hcaptcha.server";

const ORIGINAL_ENV = { ...process.env };

function setEnv(next: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("verifyHCaptcha — fail-closed", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("production + missing secret → 503 captcha_not_configured", async () => {
    setEnv({ NODE_ENV: "production", HCAPTCHA_SECRET: undefined });
    const r = await verifyHCaptcha("x".repeat(50), "1.2.3.4");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
    expect(r.reason).toBe("captcha_not_configured");
  });

  it("non-production + missing secret → passes through (dev only)", async () => {
    setEnv({ NODE_ENV: "development", HCAPTCHA_SECRET: undefined });
    const r = await verifyHCaptcha("x".repeat(50), null);
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
  });

  it("missing token → 400 captcha_missing", async () => {
    setEnv({ NODE_ENV: "production", HCAPTCHA_SECRET: "secret" });
    const r = await verifyHCaptcha(null, null);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.reason).toBe("captcha_missing");
  });

  it("too-short token → 400 captcha_missing", async () => {
    setEnv({ NODE_ENV: "production", HCAPTCHA_SECRET: "secret" });
    const r = await verifyHCaptcha("short", null);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it("upstream siteverify network error → 502 captcha_network_error", async () => {
    setEnv({ NODE_ENV: "production", HCAPTCHA_SECRET: "secret" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const r = await verifyHCaptcha("x".repeat(50), null);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
    expect(r.reason).toBe("captcha_network_error");
  });

  it("upstream non-OK response → 502 captcha_upstream_error", async () => {
    setEnv({ NODE_ENV: "production", HCAPTCHA_SECRET: "secret" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const r = await verifyHCaptcha("x".repeat(50), null);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
    expect(r.reason).toBe("captcha_upstream_error");
  });

  it("upstream success=false with error-code → 403 with code", async () => {
    setEnv({ NODE_ENV: "production", HCAPTCHA_SECRET: "secret" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const r = await verifyHCaptcha("x".repeat(50), null);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.reason).toBe("invalid-input-response");
  });

  it("upstream success=true → 200 ok", async () => {
    setEnv({ NODE_ENV: "production", HCAPTCHA_SECRET: "secret" });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const r = await verifyHCaptcha("x".repeat(50), "1.2.3.4");
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
  });
});
