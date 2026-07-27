/**
 * Integration test: update_appointment_notes accepts a notes value only when
 * it has content AFTER normalization, and both appointments.notes and
 * appointment_audit.new_notes store the TRIMMED text (edges only) capped at
 * 500 chars. NULL is still a valid "clear" signal.
 *
 * Covers:
 *   - REJECTED: whitespace-only notes (ASCII, tab, newline, CRLF, NBSP, mix)
 *     → same signal the UI translates to «الملاحظات المُدخلة فارغة بعد إزالة الفراغات»;
 *     appointments.notes unchanged, no audit row.
 *   - REJECTED: >500 chars post-trim → «الملاحظات طويلة جدًا (الحد الأقصى 500 حرفًا)»
 *     (code=23514, HINT=notes_too_long); state unchanged.
 *   - ACCEPTED: content with edge whitespace → stored value equals the trimmed
 *     text; internal spaces / tabs / newlines / NBSP preserved byte-for-byte;
 *     appointment_audit.new_notes matches the stored value.
 *   - ACCEPTED: exactly 500 chars post-trim (with padding) → stored as 500.
 *   - ACCEPTED: NULL clears notes (baseline sanity).
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-notes-accept-audit.test.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SVC) {
  console.log("(skipping — missing Supabase env vars)");
  process.exit(0);
}

const NOTES_MAX = 500;
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
async function newAppt(initialNotes: string | null = null) {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "NotesAcceptAudit",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
      status: "new",
    })
    .select("id, notes")
    .single();
  if (error) throw error;
  // force_appointment_defaults strips notes on INSERT for anon/non-staff;
  // set them via a follow-up UPDATE (service role, not audited by our fn).
  if (initialNotes !== null) {
    const up = await admin.from("appointments").update({ notes: initialNotes }).eq("id", data.id);
    if (up.error) throw up.error;
    // Clear any audit rows produced by that direct UPDATE so our assertions
    // measure only what the RPC under test writes.
    await admin.from("appointment_audit").delete().eq("appointment_id", data.id);
  }
  return { id: data.id, notes: initialNotes } as { id: string; notes: string | null };
}
const notesOf = async (id: string) =>
  (await admin.from("appointments").select("notes").eq("id", id).single()).data?.notes ?? null;
const auditOf = async (id: string) =>
  (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];

const stamp = Date.now();
const created: string[] = [];
let user: { userId: string; email: string; password: string } | null = null;

(async () => {
  console.log("── update_appointment_notes: accept-path stores trimmed notes ──");
  user = await createUser(`notes-accept-${stamp}@test.local`, "admin");
  const c = await signInAs(user.email, user.password);

  try {
    // ── ACCEPTED: edges trimmed, interior preserved verbatim ──
    const CORE_SIMPLE = "المريض يفضل الصباح";
    const CORE_INTERNAL = "المريض\tيفضل\nالصباح  والاثنين"; // tab + LF + double space
    const CORE_NBSP = "المريض\u00A0يفضل\u00A0الصباح"; // NBSP internal — kept
    const CORE_MIX = "  ملاحظة  \nمتعددة\tأسطر \u00A0داخلية ";
    const CORE_MIX_EXPECTED = "ملاحظة  \nمتعددة\tأسطر \u00A0داخلية";

    const cases: Array<{ name: string; raw: string; expected: string }> = [
      { name: "plain, no edges", raw: CORE_SIMPLE, expected: CORE_SIMPLE },
      { name: "edge spaces trimmed", raw: `   ${CORE_SIMPLE}   `, expected: CORE_SIMPLE },
      { name: "edge tabs/CRLF trimmed", raw: `\t\n${CORE_SIMPLE}\r\n\t`, expected: CORE_SIMPLE },
      { name: "edge NBSP trimmed", raw: `\u00A0${CORE_SIMPLE}\u00A0\u00A0`, expected: CORE_SIMPLE },
      { name: "internal tab+LF kept", raw: `  ${CORE_INTERNAL}  `, expected: CORE_INTERNAL },
      { name: "internal NBSP kept", raw: ` ${CORE_NBSP} `, expected: CORE_NBSP },
      { name: "mixed edge + interior", raw: CORE_MIX, expected: CORE_MIX_EXPECTED },
    ];

    for (const { name, raw, expected } of cases) {
      await test(`notes ${name} → stored trimmed, audit matches`, async () => {
        const a = await newAppt();
        created.push(a.id);
        const { error } = await c.rpc("update_appointment_notes" as any, {
          _id: a.id,
          _notes: raw,
          _reason: "تحديث ملاحظات",
        });
        assert(!error, `expected success, got: ${error?.code} ${error?.message}`);

        const stored = await notesOf(a.id);
        assert(
          stored === expected,
          `notes mismatch\n      expected(${expected.length})=${JSON.stringify(expected)}\n      got     (${stored?.length})=${JSON.stringify(stored)}`,
        );
        assert(
          (stored as string).length <= NOTES_MAX,
          `stored notes exceed cap: ${(stored as string).length}`,
        );
        assert(
          !/^[\s\u00A0]|[\s\u00A0]$/.test(stored as string),
          `stored notes have whitespace edges: ${JSON.stringify(stored)}`,
        );

        const rows = await auditOf(a.id);
        assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
        assert(
          rows[0].new_notes === expected,
          `audit.new_notes mismatch: got ${JSON.stringify(rows[0].new_notes)}`,
        );
        assert(rows[0].old_notes === null, "old_notes should be null on first set");
        assert(
          rows[0].old_status === null && rows[0].new_status === null,
          "status transition must NOT be recorded for a notes-only change",
        );
      });
    }

    // ── ACCEPTED at 500-char boundary ──
    const core500 = "ن".repeat(NOTES_MAX);
    await test("notes 500-char core with whitespace padding → stored as 500 chars", async () => {
      const a = await newAppt();
      created.push(a.id);
      const raw = `\n\t \u00A0${core500}\u00A0 \r\n`;
      const { error } = await c.rpc("update_appointment_notes" as any, {
        _id: a.id,
        _notes: raw,
        _reason: null,
      });
      assert(!error, `expected success, got: ${error?.code} ${error?.message}`);
      const stored = await notesOf(a.id);
      assert(
        stored === core500 && (stored as string).length === NOTES_MAX,
        `notes not exactly 500 chars: len=${(stored as string)?.length}`,
      );
      const rows = await auditOf(a.id);
      assert(
        rows.length === 1 && rows[0].new_notes === core500,
        "audit.new_notes must equal the 500-char trimmed value",
      );
    });

    // ── ACCEPTED: NULL clears notes (baseline sanity, no rejection) ──
    await test("notes = NULL clears existing value", async () => {
      const a = await newAppt("قيمة قديمة");
      created.push(a.id);
      const { error } = await c.rpc("update_appointment_notes" as any, {
        _id: a.id,
        _notes: null,
        _reason: "مسح",
      });
      assert(!error, `expected success, got: ${error?.code} ${error?.message}`);
      assert((await notesOf(a.id)) === null, "notes should be cleared");
      const rows = await auditOf(a.id);
      assert(
        rows.length === 1 && rows[0].old_notes === "قيمة قديمة" && rows[0].new_notes === null,
        "audit must record old→null transition",
      );
    });

    // ── REJECTED: whitespace-only notes (not the same as NULL) ──
    for (const [label, ws] of [
      ["ASCII spaces", "     "],
      ["tabs", "\t\t\t"],
      ["newlines", "\n\n\n"],
      ["CRLF", "\r\n\r\n"],
      ["NBSP", "\u00A0\u00A0\u00A0"],
      ["mixed", " \t\n\u00A0 \r\n"],
    ] as const) {
      await test(`notes whitespace-only (${label}) → rejected, nothing written`, async () => {
        const a = await newAppt("ثابتة");
        created.push(a.id);
        const { error } = await c.rpc("update_appointment_notes" as any, {
          _id: a.id,
          _notes: ws,
          _reason: null,
        });
        assert(!!error, "expected rejection, got success");
        const okCode = error!.code === "23514";
        const okMsg =
          /notes_blank_after_trim/i.test(error!.message) ||
          /الملاحظات المُدخلة فارغة/.test(error!.message);
        assert(
          okCode && okMsg,
          `expected notes_blank signal, got code=${error!.code} message=${error!.message}`,
        );
        assert((await notesOf(a.id)) === "ثابتة", "notes must remain unchanged");
        assert((await auditOf(a.id)).length === 0, "no audit row on rejection");
      });
    }

    // ── REJECTED: >500 chars post-trim ──
    const core501 = "ن".repeat(NOTES_MAX + 1);
    const core1000 = "ن".repeat(NOTES_MAX + 500);
    for (const [name, raw, expectedLen] of [
      ["exactly 501 chars", core501, NOTES_MAX + 1],
      ["1000 chars (2×cap)", core1000, NOTES_MAX + 500],
      ["501 chars + whitespace padding", `\n\t${core501} \u00A0`, NOTES_MAX + 1],
    ] as const) {
      await test(`notes ${name} → rejected as notes_too_long`, async () => {
        const a = await newAppt("ثابتة");
        created.push(a.id);
        const { error } = await c.rpc("update_appointment_notes" as any, {
          _id: a.id,
          _notes: raw,
          _reason: null,
        });
        assert(!!error, "expected rejection, got success");
        const okCode = error!.code === "23514";
        const okMsg =
          /notes_too_long/i.test(error!.message) || /الملاحظات طويلة جدًا/.test(error!.message);
        assert(
          okCode && okMsg,
          `expected notes_too_long signal, got code=${error!.code} message=${error!.message}`,
        );

        // Reported trimmed length must match actual — no silent truncation.
        const dt = String(error!.details ?? "") + " " + String(error!.hint ?? "");
        const m = dt.match(/=\s*(\d+)/);
        if (m) {
          assert(
            Number(m[1]) === expectedLen,
            `reported trimmed length ${m[1]} !== expected ${expectedLen}`,
          );
        }
        // Must not be misclassified as blank.
        assert(
          !/notes_blank_after_trim/i.test(error!.message),
          `expected too_long, but got 'blank' message: ${error!.message}`,
        );

        assert((await notesOf(a.id)) === "ثابتة", "notes must remain unchanged");
        assert((await auditOf(a.id)).length === 0, "no audit row on rejection");
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
