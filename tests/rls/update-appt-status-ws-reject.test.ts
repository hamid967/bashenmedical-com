/**
 * Integration test: update_appointment_status must REJECT a reason that
 * normalizes to '' (whitespace-only, including \n \t NBSP), and must:
 *   1. return an error carrying the exact `reason_required_for_<status>`
 *      HINT / message the UI translates to "السبب مطلوب لهذا الإجراء",
 *   2. NOT change the appointment status (operation is atomic),
 *   3. NOT insert any row into appointment_audit,
 *   4. leave the appointment fully operable afterwards (a subsequent valid
 *      call with a real reason succeeds — no lost/locked context).
 *
 * Run:  bun tests/rls/update-appt-status-ws-reject.test.ts
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SVC) {
  console.log("(skipping — missing Supabase env vars)");
  process.exit(0);
}

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
      patient_name: "WS-Reject",
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
  console.log("── update_appointment_status: whitespace-only reason is rejected ──");
  user = await createUser(`ws-reject-${stamp}@test.local`, "admin");
  const c = await signInAs(user.email, user.password);

  // Every one of these normalizes to '' under both JS trim() and DB normalize_reason.
  const wsInputs: Array<[string, string]> = [
    ["ASCII spaces", "     "],
    ["tabs", "\t\t\t"],
    ["newlines", "\n\n"],
    ["CRLF", "\r\n\r\n"],
    ["NBSP", "\u00A0\u00A0\u00A0"],
    ["mixed all", " \t\n\r\u00A0 "],
    ["empty string", ""],
  ];

  try {
    for (const [name, raw] of wsInputs) {
      for (const status of ["cancelled", "no_show"] as const) {
        await test(`${status} + ${name} → rejected + no state change`, async () => {
          const a = await newAppt();
          created.push(a.id);
          const before = a.status;

          const { error } = await c.rpc("update_appointment_status" as any, {
            _id: a.id,
            _status: status,
            _reason: raw,
          });

          // (1) error is present and carries the expected code / message
          assert(!!error, "expected DB rejection, got success");
          const okCode = error!.code === "23514";
          const okMsg =
            new RegExp(`reason_required_for_${status}`).test(error!.message) ||
            /السبب مطلوب/.test(error!.message);
          assert(
            okCode || okMsg,
            `unexpected error shape: code=${error!.code} message=${error!.message}`,
          );

          // (2) appointment status is unchanged
          const after = await statusOf(a.id);
          assert(after === before, `status changed: ${before} → ${after} (must remain unchanged)`);

          // (3) no audit row inserted
          const rows = await auditOf(a.id);
          assert(
            rows.length === 0,
            `expected 0 audit rows, got ${rows.length}: ${JSON.stringify(rows)}`,
          );

          // (4) subsequent valid call succeeds — context is not lost / locked
          const { error: err2 } = await c.rpc("update_appointment_status" as any, {
            _id: a.id,
            _status: status,
            _reason: "طلب المريض",
          });
          assert(!err2, `follow-up valid call failed: ${err2?.message}`);
          const finalStatus = await statusOf(a.id);
          assert(finalStatus === status, `follow-up did not apply: ${finalStatus} !== ${status}`);
          const rows2 = await auditOf(a.id);
          assert(
            rows2.length === 1 && rows2[0].reason === "طلب المريض",
            `audit not written correctly: ${JSON.stringify(rows2)}`,
          );
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
