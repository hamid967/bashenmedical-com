/**
 * Integration test: admin updating appointment notes via
 * update_appointment_notes writes EXACTLY ONE appointment_audit row with:
 *   - new_notes  = input trimmed on edges, internal whitespace preserved,
 *                  length ≤ 500 chars.
 *   - old_notes  = previous notes (or null)
 *   - status columns unchanged (null in audit)
 *   - reason     = trimmed reason (or null when not provided)
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-admin-notes-audit-single-row.test.ts
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
async function createAdmin(email: string) {
  const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  await admin.from("user_roles").insert({ user_id: data.user.id, role: "admin" });
  return { userId: data.user.id, email, password };
}
async function newAppt(initialNotes: string | null = null) {
  // Insert (trigger sanitizes notes to null for non-staff service-role insert),
  // then set initial notes via service-role UPDATE, then wipe audit rows so
  // the RPC under test is measured in isolation.
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "AdminNotesAuditSingle",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
    })
    .select("id")
    .single();
  if (error) throw error;
  if (initialNotes !== null) {
    const { error: uerr } = await admin
      .from("appointments")
      .update({ notes: initialNotes })
      .eq("id", data.id);
    if (uerr) throw uerr;
  }
  await admin.from("appointment_audit").delete().eq("appointment_id", data.id);
  return { id: data.id as string, notes: initialNotes };
}
const auditOf = async (id: string) =>
  (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];
const notesOf = async (id: string) =>
  (await admin.from("appointments").select("notes").eq("id", id).single()).data?.notes;

const stamp = Date.now();
const created: string[] = [];
let user: { userId: string; email: string; password: string } | null = null;

(async () => {
  console.log("── admin update_appointment_notes → exactly 1 audit row with trimmed notes ──");
  user = await createAdmin(`admin-notes-audit-single-${stamp}@test.local`);
  const c = await signInAs(user.email, user.password);

  try {
    const CORE = "ملاحظة الطبيب\tالمريض بحاجة\nمتابعة  خلال أسبوع"; // internal ws must survive
    const cases: Array<{
      label: string;
      initial: string | null;
      raw: string;
      expected: string;
      reason?: string;
      expectedReason?: string | null;
    }> = [
      {
        label: "set notes from null (plain)",
        initial: null,
        raw: CORE,
        expected: CORE,
        expectedReason: null,
      },
      {
        label: "set notes with edge whitespace trimmed",
        initial: null,
        raw: `  \t\n\u00A0${CORE}\u00A0 \r\n`,
        expected: CORE,
        expectedReason: null,
      },
      {
        label: "replace existing notes",
        initial: "قديم",
        raw: "  جديد  ",
        expected: "جديد",
        expectedReason: null,
      },
      {
        label: "notes with optional reason recorded",
        initial: null,
        raw: "  ملاحظة مهمة  ",
        expected: "ملاحظة مهمة",
        reason: "  تعديل بناءً على مراجعة الطبيب  ",
        expectedReason: "تعديل بناءً على مراجعة الطبيب",
      },
      {
        label: "500-char core with whitespace padding",
        initial: null,
        raw: `\n\t \u00A0${"ن".repeat(REASON_MAX)}\u00A0 \r\n`,
        expected: "ن".repeat(REASON_MAX),
        expectedReason: null,
      },
    ];

    for (const { label, initial, raw, expected, reason, expectedReason } of cases) {
      await test(label, async () => {
        const a = await newAppt(initial);
        created.push(a.id);

        const { error } = await c.rpc("update_appointment_notes" as any, {
          _id: a.id,
          _notes: raw,
          _reason: reason ?? null,
        });
        assert(!error, `rpc failed: ${error?.code} ${error?.message}`);

        // Notes updated on the row
        assert((await notesOf(a.id)) === expected, `notes not updated to expected value`);

        // Exactly ONE audit row
        const rows = await auditOf(a.id);
        assert(rows.length === 1, `expected exactly 1 audit row, got ${rows.length}`);
        const r = rows[0];

        // status columns untouched
        assert(
          r.old_status === null && r.new_status === null,
          `status should not be recorded (got old=${r.old_status} new=${r.new_status})`,
        );

        // notes transition recorded
        assert(
          r.old_notes === initial,
          `old_notes mismatch: expected ${JSON.stringify(initial)}, got ${JSON.stringify(r.old_notes)}`,
        );
        assert(
          r.new_notes === expected,
          `new_notes mismatch\n      expected(${expected.length})=${JSON.stringify(expected)}\n      got     (${r.new_notes?.length})=${JSON.stringify(r.new_notes)}`,
        );
        assert((r.new_notes as string).length <= REASON_MAX, `new_notes > 500 chars`);
        assert(
          !/^[\s\u00A0]|[\s\u00A0]$/.test(r.new_notes as string),
          `new_notes edges must not contain whitespace: ${JSON.stringify(r.new_notes)}`,
        );

        // reason: trimmed if provided, null otherwise
        assert(
          r.reason === expectedReason,
          `reason mismatch: expected ${JSON.stringify(expectedReason)}, got ${JSON.stringify(r.reason)}`,
        );
        if (typeof r.reason === "string") {
          assert(r.reason.length <= REASON_MAX, `reason > 500 chars`);
          assert(
            !/^[\s\u00A0]|[\s\u00A0]$/.test(r.reason),
            `reason edges must not contain whitespace: ${JSON.stringify(r.reason)}`,
          );
        }

        // changed_by is the admin caller
        assert(r.changed_by === user!.userId, `changed_by mismatch: ${r.changed_by}`);
      });
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
