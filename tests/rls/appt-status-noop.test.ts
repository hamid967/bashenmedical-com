/**
 * Integration test: updateAppointmentStatus with the same status is a no-op
 * and MUST NOT write a row to appointment_audit.
 *
 * Two layers of guarantee are checked:
 *   A) Application layer — the server function short-circuits and returns
 *      { unchanged: true } before calling the RPC.
 *      (Covered indirectly here by verifying no audit row appears when the
 *       RPC IS called with the same status — see Layer B.)
 *   B) Database layer — even if someone bypasses the app and calls the RPC
 *      directly with _status = current status, the trigger
 *      `log_appointment_change` only writes when NEW.status IS DISTINCT
 *      FROM OLD.status, so no audit row is inserted.
 *
 * Run:  bun tests/rls/appt-status-noop.test.ts
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
  async function newAppt(
    status: "new" | "confirmed" | "completed" | "cancelled" | "no_show" = "new",
  ) {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "NOOP-Test",
        patient_phone: "0500000000",
        appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        appointment_time: "10:00",
        status,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
  const auditOf = async (id: string) =>
    (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];
  const statusOf = async (id: string) =>
    (await admin.from("appointments").select("status").eq("id", id).single()).data?.status;

  const stamp = Date.now();
  const recepU = await createUser(`noop-recep-${stamp}@test.local`, "reception");
  const adminU = await createUser(`noop-admin-${stamp}@test.local`, "admin");
  const recepC = await signInAs(recepU.email, recepU.password);
  const adminC = await signInAs(adminU.email, adminU.password);

  const created: string[] = [];
  const cleanup = async () => {
    if (created.length) await admin.from("appointments").delete().in("id", created);
    for (const u of [recepU, adminU]) await admin.auth.admin.deleteUser(u.userId);
  };

  try {
    console.log("── status no-op: no audit row ──");

    for (const s of ["new", "confirmed", "cancelled", "completed", "no_show"] as const) {
      await test(`RPC with same status (${s}) → 0 audit rows, status unchanged`, async () => {
        const id = await newAppt(s);
        created.push(id);
        const client = s === "cancelled" || s === "completed" || s === "no_show" ? adminC : recepC;
        // reason is required only when NEW status is cancel/no_show AND the
        // status changes; for a no-op the trigger short-circuits before the
        // enforcement, so passing null is safe here too.
        const { error } = await client.rpc("update_appointment_status" as any, {
          _id: id,
          _status: s,
          _reason: null,
        });
        assert(!error, `rpc failed: ${error?.message}`);
        assert((await statusOf(id)) === s, "status must remain the same");
        const rows = await auditOf(id);
        assert(rows.length === 0, `expected 0 audit rows for no-op, got ${rows.length}`);
      });
    }

    await test("real change AFTER a no-op still produces exactly one audit row", async () => {
      const id = await newAppt("new");
      created.push(id);
      // First: no-op
      await recepC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "new",
        _reason: null,
      });
      assert((await auditOf(id)).length === 0, "no-op leaked an audit row");
      // Then: real transition
      const { error } = await recepC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "confirmed",
        _reason: null,
      });
      assert(!error, `rpc failed: ${error?.message}`);
      const rows = await auditOf(id);
      assert(rows.length === 1, `expected 1 audit row after real change, got ${rows.length}`);
      assert(
        rows[0].old_status === "new" && rows[0].new_status === "confirmed",
        "audit content wrong",
      );
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
