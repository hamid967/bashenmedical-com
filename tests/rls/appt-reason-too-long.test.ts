/**
 * Integration test: update_appointment_status rejects any reason whose
 * length AFTER trim exceeds REASON_MAX (500 chars), and returns an error
 * whose message / HINT lets the UI show the unified user-facing message
 *   «السبب طويل جدًا (الحد الأقصى 500 حرفًا)»
 *
 * Covers:
 *   - status that REQUIRES a reason (cancelled, no_show): rejected as
 *     "too long", not as "required" (the length check runs first).
 *   - edge whitespace inflates raw length but not trimmed length, so a
 *     500-char core with padding must still be accepted (proves the
 *     length is measured POST-trim).
 *   - 501 chars post-trim → rejected; 500 chars post-trim → accepted.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-reason-too-long.test.ts
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
      patient_name: "TooLong",
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
  console.log("── update_appointment_status: reason length cap (post-trim) ──");
  user = await createUser(`long-${stamp}@test.local`, "admin");
  const c = await signInAs(user.email, user.password);

  const at500 = "ا".repeat(REASON_MAX);
  const at501 = "ا".repeat(REASON_MAX + 1);
  const at1000 = "ا".repeat(REASON_MAX + 500);

  try {
    // ── ACCEPT: exactly 500 chars after trim (with and without padding) ──
    for (const [name, raw] of [
      ["exactly 500 chars", at500],
      ["500 chars + edge spaces trimmed", `   ${at500}\n\t  `],
      ["500 chars + edge NBSP trimmed", `\u00A0\u00A0${at500}\u00A0`],
    ] as const) {
      for (const status of ["cancelled", "no_show"] as const) {
        await test(`${status} + ${name} → accepted`, async () => {
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
          assert(
            rows[0].reason === at500,
            `stored reason mismatch (len=${rows[0].reason?.length})`,
          );
          assert((await statusOf(a.id)) === status, "status must have changed");
        });
      }
    }

    // ── REJECT: 501+ chars after trim ──
    for (const [name, raw, expectedTrimmedLen] of [
      ["exactly 501 chars", at501, REASON_MAX + 1],
      ["1000 chars (2×cap)", at1000, REASON_MAX + 500],
      ["501 chars + whitespace padding", `\n\t${at501} \u00A0`, REASON_MAX + 1],
    ] as const) {
      for (const status of ["cancelled", "no_show"] as const) {
        await test(`${status} + ${name} → rejected as too_long`, async () => {
          const a = await newAppt();
          created.push(a.id);
          const before = a.status;

          const { error } = await c.rpc("update_appointment_status" as any, {
            _id: a.id,
            _status: status,
            _reason: raw,
          });

          // (1) error present with the "too long" signal (UI maps this to the
          // unified user-facing toast «السبب طويل جدًا (الحد الأقصى 500 حرفًا)»).
          assert(!!error, "expected DB rejection, got success");
          const okCode = error!.code === "23514";
          const okMsg =
            /reason_too_long/i.test(error!.message) || /السبب طويل جدًا/.test(error!.message);
          assert(
            okCode && okMsg,
            `expected too_long signal, got code=${error!.code} message=${error!.message}`,
          );

          // The length must NOT be silently truncated: trigger reports the
          // ACTUAL post-trim length so the UI/log can surface it.
          if (error!.details || error!.hint) {
            const dt = String(error!.details ?? "") + " " + String(error!.hint ?? "");
            // details format: "Reason length after trim = <N>, max = 500."
            const m = dt.match(/=\s*(\d+)/);
            if (m) {
              assert(
                Number(m[1]) === expectedTrimmedLen,
                `reported trimmed length ${m[1]} !== expected ${expectedTrimmedLen}`,
              );
            }
          }

          // (2) not the "required" message — length check runs first.
          assert(
            !/reason_required_for_/i.test(error!.message),
            `expected too_long, but got 'required' message: ${error!.message}`,
          );

          // (3) atomicity: no state change, no audit row.
          assert((await statusOf(a.id)) === before, "status must remain unchanged");
          assert((await auditOf(a.id)).length === 0, "no audit row on rejection");
        });
      }
    }

    // ── Follow-up: after a "too long" rejection, a valid retry still works. ──
    await test("follow-up with a valid reason succeeds (context not lost)", async () => {
      const a = await newAppt();
      created.push(a.id);
      // First: rejected too-long attempt
      const bad = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "cancelled",
        _reason: at501,
      });
      assert(!!bad.error, "expected first attempt to be rejected");
      // Then: valid retry
      const ok = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "cancelled",
        _reason: "طلب المريض",
      });
      assert(!ok.error, `retry failed: ${ok.error?.message}`);
      const rows = await auditOf(a.id);
      assert(
        rows.length === 1 && rows[0].reason === "طلب المريض",
        `audit not written correctly: ${JSON.stringify(rows)}`,
      );
      assert((await statusOf(a.id)) === "cancelled", "retry did not apply status");
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
