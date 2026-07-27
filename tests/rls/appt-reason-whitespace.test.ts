/**
 * Integration tests: whitespace normalization of `reason` before it is
 * persisted to appointment_audit.
 *
 * Covers the exact classes of whitespace the reception UI can plausibly
 * receive from a browser prompt / paste / IME:
 *   - ASCII spaces
 *   - line feeds \n and carriage returns \r
 *   - tabs \t
 *   - non-breaking space U+00A0 (NBSP)
 *   - zero-width space U+200B (ZWSP) — NOT trimmed by String#trim(); must
 *     survive untouched (proves we don't over-strip meaningful characters)
 *   - full-width Arabic-friendly punctuation is preserved
 *
 * Two layers:
 *   A) Pure Zod validator (mirrors updateAppointmentStatus input)
 *   B) End-to-end DB write via update_appointment_status RPC; the trimmed
 *      value must be stored verbatim in appointment_audit.reason.
 *
 * Run:  bun tests/rls/appt-reason-whitespace.test.ts
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Mirror of the reason validator in src/lib/admin.functions.ts
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

// ── Layer A: pure Zod normalization ─────────────────────────────────────────
async function runPureTests() {
  console.log("── Layer A: whitespace normalization (Zod .trim) ──");

  const cases: Array<[string, string, string]> = [
    ["plain spaces", "   طلب المريض   ", "طلب المريض"],
    ["tabs", "\t\tطلب المريض\t", "طلب المريض"],
    ["newlines", "\n\nطلب المريض\n", "طلب المريض"],
    ["CRLF", "\r\nطلب المريض\r\n", "طلب المريض"],
    ["mixed ws", "  \n\t طلب المريض \t\n\r ", "طلب المريض"],
    ["NBSP U+00A0", "\u00A0\u00A0طلب المريض\u00A0", "طلب المريض"],
    ["mixed + NBSP", "\u00A0 \t\nطلب المريض \n\u00A0", "طلب المريض"],
    ["internal ws preserved", "اتصل  المريض\tلإلغاء\nالحجز", "اتصل  المريض\tلإلغاء\nالحجز"],
  ];
  for (const [name, raw, want] of cases) {
    await test(`trim: ${name}`, () => {
      const got = reasonSchema.parse(raw);
      assert(got === want, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    });
  }

  await test("trim: ZWSP U+200B is NOT stripped (not whitespace per spec)", () => {
    const got = reasonSchema.parse("\u200Bطلب\u200B");
    assert(got === "\u200Bطلب\u200B", `ZWSP must survive, got ${JSON.stringify(got)}`);
  });

  await test("trim: whitespace-only variants all collapse to ''", () => {
    for (const raw of ["   ", "\n", "\t", "\r", "\u00A0", "  \n\t\r\u00A0  "]) {
      const got = reasonSchema.parse(raw);
      assert(got === "", `expected '' for ${JSON.stringify(raw)}, got ${JSON.stringify(got)}`);
    }
  });
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
        patient_name: "WS-Reason",
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

  console.log("\n── Layer B: reason stored verbatim (post-trim) ──");
  const stamp = Date.now();
  const adminU = await createUser(`wsr-admin-${stamp}@test.local`, "admin");
  const adminC = await signInAs(adminU.email, adminU.password);
  const created: string[] = [];
  const cleanup = async () => {
    if (created.length) await admin.from("appointments").delete().in("id", created);
    await admin.auth.admin.deleteUser(adminU.userId);
  };

  const cases: Array<[string, string, string]> = [
    ["tabs+newlines", "\n\t اتصل المريض لإلغاء الحجز \t\n", "اتصل المريض لإلغاء الحجز"],
    ["NBSP wrapping", "\u00A0\u00A0المريض لم يحضر\u00A0", "المريض لم يحضر"],
    ["mixed all", "\r\n \t\u00A0طلب إلغاء\u00A0\t\n\r", "طلب إلغاء"],
    ["internal ws kept", "تم\tالإلغاء\nبناءً على طلب", "تم\tالإلغاء\nبناءً على طلب"],
  ];

  try {
    for (const [name, raw, want] of cases) {
      await test(`cancelled + ${name}: audit.reason === trimmed`, async () => {
        const id = await newAppt();
        created.push(id);
        const trimmed = reasonSchema.parse(raw)!;
        assert(trimmed === want, `pre-flight: Zod trim mismatch got ${JSON.stringify(trimmed)}`);
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

    await test("whitespace-only reason (after trim === '') → trigger rejects", async () => {
      const id = await newAppt();
      created.push(id);
      const trimmed = reasonSchema.parse("\u00A0 \t\n\r  ");
      assert(
        trimmed === "",
        `precondition: expected '' after trim, got ${JSON.stringify(trimmed)}`,
      );
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "cancelled",
        _reason: trimmed,
      });
      assert(!!error, "expected DB trigger to reject empty reason");
      assert(
        error!.code === "23514" || /reason_required_for_cancelled/.test(error!.message),
        `unexpected error: ${error?.code} ${error?.message}`,
      );
      assert((await auditOf(id)).length === 0, "no audit row expected on rejection");
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
