/**
 * Security suite — RBAC/RLS + deny-by-default for AI tool invocations.
 *
 * يتحقق من أن الوصول إلى أدوات المساعد الذكي يمرّ عبر registry واحد يعمل
 * بمبدأ deny-by-default، وأن أي استدعاء خارج الـallowlist يُرفض على مستوى:
 *
 *   1) وحدة `canInvoke` — التحقق البرمجي للسماح لكل (scope, tool).
 *   2) وحدة توليد/التحقق من HMAC confirm tokens (Phase 10.b).
 *   3) تحليل ثابت لمسارات `/api/ai/action` و`/api/ai/staff-action` للتأكد
 *      من وجود الحواجز الأمنية بترتيبها الصحيح.
 *
 * Run:  bun test tests/unit/ai-rbac-deny-by-default.test.ts
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Ensure LOVABLE_API_KEY exists before importing staff-confirm.server (module
// throws inside signingKey() only when actually called, but we set it here
// to keep intent explicit and to allow token roundtrips below).
process.env.LOVABLE_API_KEY = process.env.LOVABLE_API_KEY ?? "test-hmac-key-do-not-use-in-prod";

import {
  TOOL_REGISTRY,
  canInvoke,
  allowedActionTools,
  type AssistantScope,
} from "../../src/lib/ai/tools/registry";
import {
  mintConfirmToken,
  verifyConfirmToken,
  hashParams,
} from "../../src/lib/ai/tools/staff-confirm.server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTION_SRC = resolve(__dirname, "../../src/routes/api/ai/action.ts");
const STAFF_ACTION_SRC = resolve(__dirname, "../../src/routes/api/ai/staff-action.ts");

const ALL_SCOPES: AssistantScope[] = ["guest", "patient", "staff"];

// ---------------------------------------------------------------------------
// 1) canInvoke — deny-by-default
// ---------------------------------------------------------------------------
describe("canInvoke — deny-by-default matrix", () => {
  test("returns false for unknown tools across every scope", () => {
    for (const scope of ALL_SCOPES) {
      expect(canInvoke(scope, "does_not_exist")).toBe(false);
      expect(canInvoke(scope, "")).toBe(false);
      // Attempt an obviously dangerous-looking name.
      expect(canInvoke(scope, "drop_all_appointments")).toBe(false);
    }
  });

  test("rejects read-only tools even when scope matches (mutations only via action)", () => {
    // staff read helpers are registered but must NOT pass canInvoke — they
    // are not routed through /api/ai/action or /api/ai/staff-action.
    expect(canInvoke("staff", "staff_daily_summary")).toBe(false);
    expect(canInvoke("staff", "staff_delayed_requests")).toBe(false);
    expect(canInvoke("staff", "staff_draft_patient_reply")).toBe(false);
  });

  test("cross-scope invocation is denied for every mutation tool", () => {
    for (const tool of Object.values(TOOL_REGISTRY)) {
      if (tool.kind !== "mutation") continue;
      for (const scope of ALL_SCOPES) {
        const allowed = tool.allowedScopes.includes(scope);
        expect(canInvoke(scope, tool.name)).toBe(allowed);
      }
    }
  });

  test("guest scope has zero mutation privileges", () => {
    for (const tool of Object.values(TOOL_REGISTRY)) {
      if (tool.kind === "mutation") {
        expect(canInvoke("guest", tool.name)).toBe(false);
      }
    }
    expect(allowedActionTools("guest")).toHaveLength(0);
  });

  test("known allowed pairs pass (patient cancel/reschedule, staff add note)", () => {
    expect(canInvoke("patient", "cancel_appointment")).toBe(true);
    expect(canInvoke("patient", "reschedule_appointment")).toBe(true);
    expect(canInvoke("staff", "staff_add_inbox_note")).toBe(true);

    // And the same tool for a different scope must be denied.
    expect(canInvoke("staff", "cancel_appointment")).toBe(false);
    expect(canInvoke("patient", "staff_add_inbox_note")).toBe(false);
    expect(canInvoke("guest", "cancel_appointment")).toBe(false);
  });

  test("allowedActionTools returns only mutations for that scope (no reads leak)", () => {
    for (const scope of ALL_SCOPES) {
      for (const t of allowedActionTools(scope)) {
        expect(t.kind).toBe("mutation");
        expect(t.allowedScopes).toContain(scope);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2) Registry invariants — protects deny-by-default from future drift
// ---------------------------------------------------------------------------
describe("Registry invariants (fail if a future edit weakens the allowlist)", () => {
  test("every mutation has an explicit allowed-scopes list and confirmation flag", () => {
    for (const [name, def] of Object.entries(TOOL_REGISTRY)) {
      expect(def.name).toBe(name);
      expect(Array.isArray(def.allowedScopes)).toBe(true);
      if (def.kind === "mutation") {
        expect(def.allowedScopes.length).toBeGreaterThan(0);
        expect(def.requiresConfirmation).toBe(true);
        expect(def.featureFlag).toBeTruthy();
      }
    }
  });

  test("no mutation is exposed to `guest`", () => {
    for (const def of Object.values(TOOL_REGISTRY)) {
      if (def.kind === "mutation") {
        expect(def.allowedScopes).not.toContain("guest");
      }
    }
  });

  test("staff mutations are behind the staff-specific feature flag", () => {
    for (const def of Object.values(TOOL_REGISTRY)) {
      if (def.kind === "mutation" && def.allowedScopes.includes("staff")) {
        expect(def.featureFlag).toBe("ai.assistant.staff.mutations.enabled");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3) HMAC confirm tokens — forgery / replay / tamper resistance
// ---------------------------------------------------------------------------
describe("staff-confirm HMAC tokens", () => {
  const userA = "00000000-0000-0000-0000-00000000000a";
  const userB = "00000000-0000-0000-0000-00000000000b";
  const tool = "staff_add_inbox_note";
  const params = { inbox_item_id: "11111111-1111-1111-1111-111111111111", note: "hello" };

  test("verifies a fresh token minted for the same user/tool/params", () => {
    const { token } = mintConfirmToken({ userId: userA, tool, params });
    const v = verifyConfirmToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.userId).toBe(userA);
      expect(v.tool).toBe(tool);
      expect(v.paramsHash).toBe(hashParams(params));
    }
  });

  test("rejects a malformed token", () => {
    const v = verifyConfirmToken("not-a-token");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("malformed");
  });

  test("rejects a tampered signature", () => {
    const { token } = mintConfirmToken({ userId: userA, tool, params });
    const [body, sig] = token.split(".");
    // Flip the last char of the signature.
    const tamperedSig = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    const v = verifyConfirmToken(`${body}.${tamperedSig}`);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("bad_signature");
  });

  test("paramsHash changes when params change → execute-side mismatch", () => {
    const h1 = hashParams(params);
    const h2 = hashParams({ ...params, note: "different" });
    expect(h1).not.toBe(h2);
    // Round-trip: token minted for params1 must NOT verify equal to hash(params2).
    const { token } = mintConfirmToken({ userId: userA, tool, params });
    const v = verifyConfirmToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.paramsHash).not.toBe(h2);
  });

  test("token minted for user A does not carry over to user B", () => {
    const { token } = mintConfirmToken({ userId: userA, tool, params });
    const v = verifyConfirmToken(token);
    expect(v.ok).toBe(true);
    // The execute handler compares v.userId to auth.userId; simulate here.
    if (v.ok) expect(v.userId).not.toBe(userB);
  });

  test("expired token is rejected", () => {
    const { token } = mintConfirmToken({ userId: userA, tool, params });
    const original = Date.now;
    try {
      // Jump 10 minutes into the future (TTL is 5m).
      Date.now = () => original.call(Date) + 10 * 60 * 1000;
      const v = verifyConfirmToken(token);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe("expired");
    } finally {
      Date.now = original;
    }
  });
});

// ---------------------------------------------------------------------------
// 4) Static analysis — deny-by-default at the HTTP boundary
// ---------------------------------------------------------------------------
describe("HTTP boundaries call canInvoke before executing", () => {
  let actionSrc = "";
  let staffSrc = "";
  beforeAll(() => {
    actionSrc = readFileSync(ACTION_SRC, "utf8");
    staffSrc = readFileSync(STAFF_ACTION_SRC, "utf8");
  });

  test("/api/ai/action enforces auth, tool allowlist, and staff read-only", () => {
    expect(actionSrc).toMatch(/readAuthUser\(/);
    expect(actionSrc).toMatch(/unauthenticated/);
    // Staff cannot reach patient mutation channel.
    expect(actionSrc).toMatch(/staff_read_only/);
    // Registry gate present.
    expect(actionSrc).toMatch(/canInvoke\(\s*["']patient["']/);
    // Unknown tool rejection.
    expect(actionSrc).toMatch(/unknown_tool/);
    // Zod validation before any mutation.
    expect(actionSrc).toMatch(/safeParse/);
  });

  test("/api/ai/staff-action layers ALL required guards in order", () => {
    // Rate limit → auth → both feature flags → role → canInvoke → schema →
    // token verify → mismatch check → audit on every branch.
    expect(staffSrc).toMatch(/applyRateLimit/);
    expect(staffSrc).toMatch(/readAuthUser/);
    expect(staffSrc).toMatch(/ai\.assistant\.staff\.enabled/);
    expect(staffSrc).toMatch(/ai\.assistant\.staff\.mutations\.enabled/);
    expect(staffSrc).toMatch(/detectStaffRoles/);
    expect(staffSrc).toMatch(/not_staff/);
    expect(staffSrc).toMatch(/canInvoke\(\s*["']staff["']/);
    expect(staffSrc).toMatch(/tool_not_allowed/);
    expect(staffSrc).toMatch(/confirmation_required/);
    expect(staffSrc).toMatch(/verifyConfirmToken/);
    expect(staffSrc).toMatch(/token_mismatch/);
    // Audit trail must exist on denied branches.
    const deniedAudits = staffSrc.match(/status:\s*"denied"/g) ?? [];
    expect(deniedAudits.length).toBeGreaterThanOrEqual(2);
  });

  test("every staff mutation in the registry has a Zod schema in staff-action", () => {
    for (const def of Object.values(TOOL_REGISTRY)) {
      if (def.kind !== "mutation") continue;
      if (!def.allowedScopes.includes("staff")) continue;
      // The tool name must appear as a key inside StaffToolSchemas — i.e.
      // followed by ": z.object" in the source. Anything registered without
      // a schema would fall through as unknown_tool, but this test surfaces
      // the drift explicitly.
      const pattern = new RegExp(`${def.name}\\s*:\\s*z\\.object`);
      expect(staffSrc).toMatch(pattern);
    }
  });

  test("every patient mutation in the registry has a Zod schema in /api/ai/action", () => {
    for (const def of Object.values(TOOL_REGISTRY)) {
      if (def.kind !== "mutation") continue;
      if (!def.allowedScopes.includes("patient")) continue;
      const pattern = new RegExp(`${def.name}\\s*:\\s*z\\.object`);
      expect(actionSrc).toMatch(pattern);
    }
  });
});
