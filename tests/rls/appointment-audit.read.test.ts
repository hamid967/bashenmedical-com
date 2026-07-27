/**
 * Integration tests: only admin & reception can read appointment_audit rows.
 *
 * Verifies the end-to-end contract used by the history modal:
 *   1. A status change through update_appointment_status writes an audit row.
 *   2. Signed-in admin  → sees the row.
 *   3. Signed-in reception → sees the row.
 *   4. Signed-in pharmacy → sees zero rows (RLS filters).
 *   5. Signed-in patient (no role) → sees zero rows.
 *   6. Anonymous client → cannot read at all.
 *
 * Run:  bun tests/rls/appointment-audit.read.test.ts
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

async function run() {
  const URL = process.env.SUPABASE_URL!;
  const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!URL || !ANON || !SERVICE) {
    console.log("(skipping — missing Supabase env vars)");
    return;
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const anonC = createClient(URL, ANON, { auth: { persistSession: false } });

  async function signInAs(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    assert(data.session, "no session");
    return c;
  }
  async function createUser(email: string, role: string | null) {
    const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (role) await admin.from("user_roles").insert({ user_id: data.user.id, role });
    return { userId: data.user.id, email, password };
  }

  const stamp = Date.now();
  const adminU = await createUser(`ar-admin-${stamp}@test.local`, "admin");
  const recepU = await createUser(`ar-recep-${stamp}@test.local`, "reception");
  const pharmU = await createUser(`ar-pharm-${stamp}@test.local`, "pharmacy");
  const patU = await createUser(`ar-pat-${stamp}@test.local`, null);

  const adminC = await signInAs(adminU.email, adminU.password);
  const recepC = await signInAs(recepU.email, recepU.password);
  const pharmC = await signInAs(pharmU.email, pharmU.password);
  const patC = await signInAs(patU.email, patU.password);

  // Seed an appointment + generate an audit row (reception confirms it)
  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .insert({
      patient_name: "AUD-Test",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
      status: "new",
    })
    .select("id")
    .single();
  if (apptErr) throw apptErr;
  const apptId = appt.id as string;

  const { error: rpcErr } = await recepC.rpc("update_appointment_status" as any, {
    _id: apptId,
    _status: "confirmed",
    _reason: null,
  });
  assert(!rpcErr, `seed rpc failed: ${rpcErr?.message}`);

  const cleanup = async () => {
    await admin.from("appointments").delete().eq("id", apptId);
    for (const u of [adminU, recepU, pharmU, patU]) await admin.auth.admin.deleteUser(u.userId);
  };

  try {
    console.log("── appointment_audit read visibility ──");

    await test("admin: sees the audit row for the appointment", async () => {
      const { data, error } = await adminC
        .from("appointment_audit")
        .select("*")
        .eq("appointment_id", apptId);
      assert(!error, `error: ${error?.message}`);
      assert((data ?? []).length === 1, `expected 1 row, got ${(data ?? []).length}`);
      assert(data![0].new_status === "confirmed", "wrong audit content");
    });

    await test("reception: sees the audit row for the appointment", async () => {
      const { data, error } = await recepC
        .from("appointment_audit")
        .select("*")
        .eq("appointment_id", apptId);
      assert(!error, `error: ${error?.message}`);
      assert((data ?? []).length === 1, `expected 1 row, got ${(data ?? []).length}`);
    });

    await test("pharmacy: audit rows filtered out by RLS (0 rows)", async () => {
      const { data, error } = await pharmC
        .from("appointment_audit")
        .select("*")
        .eq("appointment_id", apptId);
      // RLS SELECT deny is silent (0 rows), not an error
      assert(!error, `unexpected error: ${error?.message}`);
      assert((data ?? []).length === 0, "pharmacy must not see audit rows");
    });

    await test("patient (no role): audit rows filtered out by RLS (0 rows)", async () => {
      const { data, error } = await patC
        .from("appointment_audit")
        .select("*")
        .eq("appointment_id", apptId);
      assert(!error, `unexpected error: ${error?.message}`);
      assert((data ?? []).length === 0, "patient must not see audit rows");
    });

    await test("anonymous: cannot read audit table", async () => {
      const { data, error } = await anonC
        .from("appointment_audit")
        .select("*")
        .eq("appointment_id", apptId);
      // Either RLS returns 0 rows or the policy blocks with an error;
      // both outcomes mean the row is not exposed anonymously.
      assert((data ?? []).length === 0, `anon must see 0 rows, got ${(data ?? []).length}`);
      if (error) console.log(`    (anon error, acceptable): ${error.message}`);
    });

    await test("admin: cannot INSERT into appointment_audit directly (only trigger writes)", async () => {
      const { error } = await adminC.from("appointment_audit").insert({
        appointment_id: apptId,
        new_status: "cancelled",
      } as any);
      assert(!!error, "expected RLS/GRANT to block direct insert");
    });

    await test("reception: cannot UPDATE audit rows", async () => {
      const { error } = await recepC
        .from("appointment_audit")
        .update({ reason: "tampered" } as any)
        .eq("appointment_id", apptId);
      assert(!!error || true, "update should be denied or a no-op");
      // Verify audit row is untouched
      const { data } = await admin
        .from("appointment_audit")
        .select("reason")
        .eq("appointment_id", apptId)
        .limit(1)
        .single();
      assert(data?.reason !== "tampered", "audit row must be immutable via app roles");
    });
  } finally {
    console.log("\nCleaning up…");
    await cleanup();
  }
}

(async () => {
  await run();
  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
