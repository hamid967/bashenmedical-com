/**
 * Integration tests: ZWSP + space-variant handling for `reason`.
 *
 * Goal: prove the shared normalizer/trigger stack
 *   1. TRIMS only leading/trailing whitespace (ASCII space, \t, \n, \r, NBSP U+00A0),
 *   2. NEVER strips zero-width space (U+200B) — it is not whitespace per spec,
 *   3. NEVER collapses internal runs of NBSP / regular spaces / mixed spaces
 *      (preserving user intent, spacing, alignment inside the reason),
 *   4. Stores the exact post-trim value in appointment_audit.reason.
 *
 * Layer A: pure Zod .trim() parity check (mirrors src/lib/admin.functions.ts).
 * Layer B: end-to-end write via update_appointment_status → appointment_audit.
 *
 * Run:  bun tests/rls/appt-reason-zwsp-spaces.test.ts
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const reasonSchema = z.string().trim().max(500).optional();

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${(err as Error).message}`);
    failed++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const ZWSP = "\u200B";
const NBSP = "\u00A0";
const SP = " ";

// ── Layer A: pure Zod .trim() ───────────────────────────────────────────────
async function runPureTests() {
  console.log("── Layer A: ZWSP + space variants (Zod .trim) ──");

  // ZWSP is NOT whitespace → must survive at any position (edge or internal).
  const zwspCases: Array<[string, string, string]> = [
    ["leading ZWSP", `${ZWSP}طلب`, `${ZWSP}طلب`],
    ["trailing ZWSP", `طلب${ZWSP}`, `طلب${ZWSP}`],
    ["ZWSP both sides", `${ZWSP}طلب${ZWSP}`, `${ZWSP}طلب${ZWSP}`],
    ["ZWSP internal only", `طلب${ZWSP}المريض`, `طلب${ZWSP}المريض`],
    ["ZWSP + edge spaces", `  ${ZWSP}طلب${ZWSP}  `, `${ZWSP}طلب${ZWSP}`],
    ["ZWSP + edge NBSP", `${NBSP}${ZWSP}طلب${ZWSP}${NBSP}`, `${ZWSP}طلب${ZWSP}`],
    ["ZWSP + edge tabs/newlines", `\n\t${ZWSP}طلب${ZWSP}\t\n`, `${ZWSP}طلب${ZWSP}`],
    ["only ZWSP → not trimmed", `${ZWSP}${ZWSP}${ZWSP}`, `${ZWSP}${ZWSP}${ZWSP}`],
  ];
  for (const [name, raw, want] of zwspCases) {
    await test(`ZWSP: ${name}`, () => {
      const got = reasonSchema.parse(raw);
      assert(got === want, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    });
  }

  // Internal space variants — must NOT be collapsed / lost.
  const spaceCases: Array<[string, string, string]> = [
    ["double regular space kept", `اتصل${SP}${SP}المريض`, `اتصل${SP}${SP}المريض`],
    ["triple regular space kept", `اتصل${SP}${SP}${SP}المريض`, `اتصل${SP}${SP}${SP}المريض`],
    ["internal NBSP kept", `اتصل${NBSP}المريض`, `اتصل${NBSP}المريض`],
    [
      "internal NBSP run kept",
      `اتصل${NBSP}${NBSP}${NBSP}المريض`,
      `اتصل${NBSP}${NBSP}${NBSP}المريض`,
    ],
    ["mixed NBSP + space kept", `اتصل${NBSP}${SP}${NBSP}المريض`, `اتصل${NBSP}${SP}${NBSP}المريض`],
    ["NBSP between words, edges trimmed", `  اتصل${NBSP}المريض  `, `اتصل${NBSP}المريض`],
    [
      "edge NBSP + internal NBSP",
      `${NBSP}اتصل${NBSP}${NBSP}المريض${NBSP}`,
      `اتصل${NBSP}${NBSP}المريض`,
    ],
    ["tabs stripped at edges, internal tab kept", `\tاتصل\tالمريض\t`, `اتصل\tالمريض`],
    ["newline stripped at edges, internal newline kept", `\nاتصل\nالمريض\n`, `اتصل\nالمريض`],
  ];
  for (const [name, raw, want] of spaceCases) {
    await test(`spaces: ${name}`, () => {
      const got = reasonSchema.parse(raw);
      assert(got === want, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    });
  }
}

// ── Layer B: end-to-end persistence in appointment_audit ────────────────────
async function runDbTests() {
  const URL = process.env.SUPABASE_URL!;
  const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!URL || !ANON || !SERVICE) {
    console.log("\n(skipping Layer B — missing Supabase env vars)");
    return;
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  async function signInAs(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    assert(data.session, "no session");
    return c;
  }
  async function createUser(email: string, role: string) {
    const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await admin.from("user_roles").insert({ user_id: data.user.id, role });
    return { userId: data.user.id, email, password };
  }
  async function newAppt() {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "WS-ZWSP",
        patient_phone: "0500000000",
        appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        appointment_time: "10:00",
        status: "confirmed",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
  const auditOf = async (id: string) =>
    (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];

  console.log("\n── Layer B: ZWSP + space variants stored verbatim (post-trim) ──");
  const stamp = Date.now();
  const adminU = await createUser(`wsz-admin-${stamp}@test.local`, "admin");
  const adminC = await signInAs(adminU.email, adminU.password);
  const created: string[] = [];
  const cleanup = async () => {
    if (created.length) await admin.from("appointments").delete().in("id", created);
    await admin.auth.admin.deleteUser(adminU.userId);
  };

  // Each: label, raw reason (as user might send), expected stored value.
  const cases: Array<[string, string, string]> = [
    // ZWSP preservation
    ["ZWSP internal kept", `طلب${ZWSP}المريض إلغاء الحجز`, `طلب${ZWSP}المريض إلغاء الحجز`],
    [
      "ZWSP wrapped + edge ws trimmed",
      ` \n${ZWSP}طلب المريض${ZWSP}\t `,
      `${ZWSP}طلب المريض${ZWSP}`,
    ],
    ["ZWSP-only reason survives", `${ZWSP}${ZWSP}${ZWSP}`, `${ZWSP}${ZWSP}${ZWSP}`],

    // Internal space runs preserved
    [
      "double space internal kept",
      `اتصل${SP}${SP}المريض لإلغاء الحجز`,
      `اتصل${SP}${SP}المريض لإلغاء الحجز`,
    ],
    [
      "internal NBSP kept, edge NBSP stripped",
      `${NBSP}اتصل${NBSP}المريض${NBSP}`,
      `اتصل${NBSP}المريض`,
    ],
    [
      "internal NBSP run kept",
      `اتصل${NBSP}${NBSP}${NBSP}المريض`,
      `اتصل${NBSP}${NBSP}${NBSP}المريض`,
    ],
    [
      "mixed NBSP + space internal kept",
      `اتصل${NBSP}${SP}${NBSP}المريض`,
      `اتصل${NBSP}${SP}${NBSP}المريض`,
    ],
    ["internal tab kept, edge tab stripped", `\tاتصل\tالمريض\t`, `اتصل\tالمريض`],
    ["internal newline kept, edge newline stripped", `\nاتصل\nالمريض\n`, `اتصل\nالمريض`],
  ];

  try {
    for (const [name, raw, want] of cases) {
      await test(`cancelled + ${name}: audit.reason === expected`, async () => {
        const id = await newAppt();
        created.push(id);
        const trimmed = reasonSchema.parse(raw)!;
        assert(
          trimmed === want,
          `pre-flight Zod mismatch:\n  got=${JSON.stringify(trimmed)}\n  want=${JSON.stringify(want)}`,
        );
        const { error } = await adminC.rpc("update_appointment_status" as any, {
          _id: id,
          _status: "cancelled",
          _reason: trimmed,
        });
        assert(!error, `rpc failed: ${error?.message}`);
        const rows = await auditOf(id);
        assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
        assert(
          rows[0].reason === want,
          `stored reason mismatch:\n  got=${JSON.stringify(rows[0].reason)}\n  want=${JSON.stringify(want)}`,
        );
        assert(rows[0].new_status === "cancelled", "new_status wrong");
      });
    }

    // Guard: internal-space content must not be misread as blank by the DB check.
    await test("internal-only spaces + ZWSP is NOT rejected as blank", async () => {
      const id = await newAppt();
      created.push(id);
      const raw = `${ZWSP}${SP}${NBSP}${SP}${ZWSP}`; // trims to "${SP}${NBSP}${SP}" ? No: trim strips edges only.
      // .trim() strips leading/trailing ZWSP? No — ZWSP survives; but edges here are ZWSP so
      // they stay. Result equals the raw string.
      const trimmed = reasonSchema.parse(raw)!;
      assert(trimmed.length > 0, `expected non-empty after trim, got ${JSON.stringify(trimmed)}`);
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "cancelled",
        _reason: trimmed,
      });
      // The DB normalize_reason uses \s + NBSP: ZWSP is not \s, so this stays non-blank.
      assert(!error, `unexpected DB rejection: ${error?.code} ${error?.message}`);
      const rows = await auditOf(id);
      assert(
        rows.length === 1 && rows[0].reason === trimmed,
        `expected verbatim store, got ${JSON.stringify(rows[0]?.reason)}`,
      );
    });
  } finally {
    console.log("\nCleaning up…");
    await cleanup();
  }
}

(async () => {
  await runPureTests();
  await runDbTests();
  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
