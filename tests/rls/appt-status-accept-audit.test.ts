/**
 * Integration test: a valid update via update_appointment_status is ACCEPTED
 * only when a reason exists after normalization, AND the value persisted in
 * appointment_audit.reason is exactly the trimmed reason (edges stripped,
 * internal whitespace preserved verbatim), and always ≤ 500 chars.
 *
 * Covers:
 *   - Reason with only whitespace (ASCII space, tab, newline, CRLF, NBSP,
 *     mixed) → REJECTED for statuses that require a reason (cancelled,
 *     no_show); nothing written.
 *   - Reason with real content padded by whitespace → ACCEPTED; the value
 *     stored in appointment_audit equals the input with ONLY leading/trailing
 *     whitespace removed. Internal spaces / tabs / newlines / NBSP are kept
 *     byte-for-byte.
 *   - Exactly 500 chars post-trim → ACCEPTED, stored as-is (length 500).
 *   - status_only change (notes not touched) still writes the reason into
 *     the audit row.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-status-accept-audit.test.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SVC) {
  console.log("(skipping — missing Supabase env vars)");
  process.exit(0);
}

const REASON_MAX = 500;
const admin = createClient(URL, SVC, { auth: { persistSession: false } });

let passed = 0,
  failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
    failed++;
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

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
      patient_name: "AcceptAudit",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
      status: "confirmed",
    })
    .select("id, status")
    .single();
  if (error) throw error;
  return data as { id: string; status: string };
}
const auditOf = async (id: string) =>
  (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];
const statusOf = async (id: string) =>
  (await admin.from("appointments").select("status").eq("id", id).single()).data?.status;

const stamp = Date.now();
const created: string[] = [];
let user: { userId: string; email: string; password: string } | null = null;

(async () => {
  console.log("── update_appointment_status: accept-path stores trimmed reason ──");
  user = await createUser(`accept-${stamp}@test.local`, "admin");
  const c = await signInAs(user.email, user.password);

  try {
    // ── ACCEPTED: internal whitespace preserved verbatim, edges trimmed ──
    const CORE_SIMPLE = "طلب المريض";
    const CORE_INTERNAL = "طلب\tالمريض\nإلغاء بسبب  السفر"; // tab + LF + double space
    const CORE_NBSP = "طلب\u00A0المريض"; // NBSP is NOT trimmed when internal
    const CORE_MIX = "  السبب  \nيحتوي على\t فراغات \u00A0داخلية ";
    // ^ note: leading/trailing whitespace above will be trimmed; interior kept.
    const CORE_MIX_EXPECTED = "السبب  \nيحتوي على\t فراغات \u00A0داخلية";

    const cases: Array<{ name: string; raw: string; expected: string }> = [
      { name: "plain reason, no edges", raw: CORE_SIMPLE, expected: CORE_SIMPLE },
      { name: "edge spaces trimmed", raw: `   ${CORE_SIMPLE}   `, expected: CORE_SIMPLE },
      {
        name: "edge tabs/newlines trimmed",
        raw: `\t\n${CORE_SIMPLE}\r\n\t`,
        expected: CORE_SIMPLE,
      },
      { name: "edge NBSP trimmed", raw: `\u00A0${CORE_SIMPLE}\u00A0\u00A0`, expected: CORE_SIMPLE },
      {
        name: "internal tab + LF kept verbatim",
        raw: `  ${CORE_INTERNAL}  `,
        expected: CORE_INTERNAL,
      },
      { name: "internal NBSP kept verbatim", raw: ` ${CORE_NBSP} `, expected: CORE_NBSP },
      { name: "mixed edge + interior whitespace", raw: CORE_MIX, expected: CORE_MIX_EXPECTED },
    ];

    for (const { name, raw, expected } of cases) {
      for (const status of ["cancelled", "no_show"] as const) {
        await test(`${status} + ${name} → audit.reason == trimmed`, async () => {
          const a = await newAppt();
          created.push(a.id);
          const { error } = await c.rpc("update_appointment_status" as any, {
            _id: a.id,
            _status: status,
            _reason: raw,
          });
          assert(!error, `expected success, got: ${error?.code} ${error?.message}`);

          const rows = await auditOf(a.id);
          assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
          const stored = rows[0].reason as string;
          assert(
            stored === expected,
            `stored reason mismatch\n      expected(${expected.length})=${JSON.stringify(expected)}\n      got     (${stored?.length})=${JSON.stringify(stored)}`,
          );
          assert(stored.length <= REASON_MAX, `stored reason exceeds cap: ${stored.length}`);
          // Edges must not be whitespace after trim.
          assert(
            !/^[\s\u00A0]|[\s\u00A0]$/.test(stored),
            `stored reason has whitespace on its edges: ${JSON.stringify(stored)}`,
          );

          assert((await statusOf(a.id)) === status, "status must have changed");

          // Also: only the status change is recorded — notes fields stay null.
          assert(
            rows[0].old_notes === null && rows[0].new_notes === null,
            "notes must not be recorded when only status changed",
          );
          assert(
            rows[0].old_status !== null && rows[0].new_status === status,
            "status transition must be recorded",
          );
        });
      }
    }

    // ── ACCEPTED at cap boundary: exactly 500 chars post-trim, padded by whitespace ──
    const core500 = "ا".repeat(REASON_MAX);
    await test("cancelled + 500-char core with whitespace padding → stored as 500 chars", async () => {
      const a = await newAppt();
      created.push(a.id);
      const raw = `\n\t \u00A0${core500}\u00A0 \r\n`;
      const { error } = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "cancelled",
        _reason: raw,
      });
      assert(!error, `expected success, got: ${error?.code} ${error?.message}`);
      const rows = await auditOf(a.id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      assert(
        rows[0].reason === core500 && (rows[0].reason as string).length === REASON_MAX,
        `stored reason not exactly 500 chars: len=${(rows[0].reason as string)?.length}`,
      );
    });

    // ── REJECTED: whitespace-only reason still blocks required-reason statuses ──
    for (const [label, ws] of [
      ["ASCII spaces", "     "],
      ["tabs", "\t\t\t"],
      ["newlines", "\n\n\n"],
      ["CRLF", "\r\n\r\n"],
      ["NBSP", "\u00A0\u00A0\u00A0"],
      ["mixed", " \t\n\u00A0 \r\n"],
    ] as const) {
      for (const status of ["cancelled", "no_show"] as const) {
        await test(`${status} + whitespace-only (${label}) → rejected, nothing written`, async () => {
          const a = await newAppt();
          created.push(a.id);
          const before = a.status;
          const { error } = await c.rpc("update_appointment_status" as any, {
            _id: a.id,
            _status: status,
            _reason: ws,
          });
          assert(!!error, "expected rejection, got success");
          const okCode = error!.code === "23514";
          const okMsg =
            /reason_required_for_/i.test(error!.message) ||
            /reason_blank_after_trim/i.test(error!.message) ||
            /السبب مطلوب/.test(error!.message) ||
            /فارغ بعد إزالة الفراغات/.test(error!.message);
          assert(
            okCode && okMsg,
            `expected required/blank signal, got code=${error!.code} message=${error!.message}`,
          );
          assert((await statusOf(a.id)) === before, "status must remain unchanged");
          assert((await auditOf(a.id)).length === 0, "no audit row on rejection");
        });
      }
    }
  } finally {
    console.log("\nCleaning up…");
    if (created.length) await admin.from("appointments").delete().in("id", created);
    if (user) await admin.auth.admin.deleteUser(user.userId);
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
