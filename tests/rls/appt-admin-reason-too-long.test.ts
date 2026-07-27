/**
 * Integration test: admin gets REJECTED when `_reason` exceeds 500 chars
 * after edge-trim on BOTH update_appointment_status and
 * update_appointment_notes. On rejection:
 *   - error code = 23514 (check_violation)
 *   - error hint = 'reason_too_long' (message contains "السبب طويل جدًا")
 *   - appointments.status / .notes unchanged
 *   - NO row is inserted into appointment_audit
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-admin-reason-too-long.test.ts
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
async function newAppt(
  initialStatus: "confirmed" | "new" = "confirmed",
  initialNotes: string | null = null,
) {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "AdminReasonTooLong",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
    })
    .select("id")
    .single();
  if (error) throw error;
  const patch: Record<string, unknown> = {};
  if (initialStatus !== "new") patch.status = initialStatus;
  if (initialNotes !== null) patch.notes = initialNotes;
  if (Object.keys(patch).length) {
    const { error: uerr } = await admin.from("appointments").update(patch).eq("id", data.id);
    if (uerr) throw uerr;
  }
  await admin.from("appointment_audit").delete().eq("appointment_id", data.id);
  return { id: data.id as string, status: initialStatus, notes: initialNotes };
}
const auditOf = async (id: string) =>
  (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];
const rowOf = async (id: string) =>
  (await admin.from("appointments").select("status, notes").eq("id", id).single()).data;

function assertTooLongError(err: { code?: string; message?: string } | null) {
  assert(!!err, "expected rejection, got success");
  assert(
    err!.code === "23514",
    `expected code 23514 (check_violation), got ${err!.code}: ${err!.message}`,
  );
  const okMsg =
    /reason_too_long/i.test(err!.message ?? "") || /السبب طويل جدًا/.test(err!.message ?? "");
  assert(okMsg, `expected reason_too_long signal, got: ${err!.message}`);
}

const stamp = Date.now();
const created: string[] = [];
let user: { userId: string; email: string; password: string } | null = null;

(async () => {
  console.log("── admin: reason >500 chars after trim is rejected; no audit row ──");
  user = await createAdmin(`admin-reason-toolong-${stamp}@test.local`);
  const c = await signInAs(user.email, user.password);

  try {
    // Build reasons that are >500 chars AFTER edge trim (interior counts, edges stripped).
    const core501 = "ا".repeat(REASON_MAX + 1); // 501 core, no padding
    const core600Padded = `  \t\n\u00A0${"ب".repeat(600)}\u00A0 \r\n`; // 600 core with edge ws
    const cases: Array<{ label: string; raw: string }> = [
      { label: "501-char plain reason", raw: core501 },
      { label: "600-char core with whitespace padding", raw: core600Padded },
      { label: "exactly 501 after mixed edge trim", raw: `\u00A0\t ${"ج".repeat(501)} \n\r` },
    ];

    // ── update_appointment_status ──────────────────────────────────────────
    for (const { label, raw } of cases) {
      for (const status of ["cancelled", "no_show", "completed"] as const) {
        await test(`status=${status} + ${label} → rejected, no audit row`, async () => {
          const a = await newAppt("confirmed");
          created.push(a.id);
          const before = await rowOf(a.id);

          const { error } = await c.rpc("update_appointment_status" as any, {
            _id: a.id,
            _status: status,
            _reason: raw,
          });
          assertTooLongError(error as any);

          const after = await rowOf(a.id);
          assert(
            after?.status === before?.status,
            `status must not change (was ${before?.status}, now ${after?.status})`,
          );
          assert(after?.notes === before?.notes, "notes must not change");
          assert((await auditOf(a.id)).length === 0, "no audit row must be written on rejection");
        });
      }
    }

    // ── update_appointment_notes ───────────────────────────────────────────
    for (const { label, raw } of cases) {
      await test(`notes + ${label} → rejected, no audit row`, async () => {
        const a = await newAppt("confirmed", "قديم");
        created.push(a.id);
        const before = await rowOf(a.id);

        const { error } = await c.rpc("update_appointment_notes" as any, {
          _id: a.id,
          _notes: "ملاحظة جديدة",
          _reason: raw,
        });
        assertTooLongError(error as any);

        const after = await rowOf(a.id);
        assert(
          after?.notes === before?.notes,
          `notes must not change (was ${JSON.stringify(before?.notes)}, now ${JSON.stringify(after?.notes)})`,
        );
        assert(after?.status === before?.status, "status must not change");
        assert((await auditOf(a.id)).length === 0, "no audit row must be written on rejection");
      });
    }

    // ── boundary sanity: exactly 500 after trim IS accepted (control) ──
    await test("control: exactly 500 chars after trim IS accepted for status=cancelled", async () => {
      const a = await newAppt("confirmed");
      created.push(a.id);
      const raw = `  \u00A0${"د".repeat(REASON_MAX)}\u00A0  `; // 500 after trim
      const { error } = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "cancelled",
        _reason: raw,
      });
      assert(!error, `expected acceptance at boundary, got: ${error?.code} ${error?.message}`);
      const rows = await auditOf(a.id);
      assert(rows.length === 1, `expected 1 audit row at boundary, got ${rows.length}`);
      assert(
        (rows[0].reason as string).length === REASON_MAX,
        "boundary reason must be exactly 500 chars",
      );
    });
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
