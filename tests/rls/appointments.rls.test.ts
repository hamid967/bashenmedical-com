/**
 * Integration tests for RLS policies on public.appointments.
 *
 * Uses the service-role key to seed 3 real auth.users (admin / reception /
 * patient), then exercises SELECT/INSERT/UPDATE/DELETE as each role through
 * PostgREST with the publishable key + user JWT. Cleans up after.
 *
 * Run:   bun tests/rls/appointments.rls.test.ts
 * Env:   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SERVICE) {
  console.error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
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

async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  assert(data.session, "no session");
  return c;
}

async function createUserWithRole(email: string, role: string | null) {
  const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  if (role) {
    const { error: rerr } = await admin.from("user_roles").insert({ user_id: userId, role });
    if (rerr) throw rerr;
  }
  return { userId, email, password };
}

async function main() {
  console.log("Seeding test users…");
  const stamp = Date.now();
  const adminU = await createUserWithRole(`rls-admin-${stamp}@test.local`, "admin");
  const recepU = await createUserWithRole(`rls-recep-${stamp}@test.local`, "reception");
  const patntU = await createUserWithRole(`rls-patient-${stamp}@test.local`, null);

  // Seed an appointment via service role for read/update/delete tests
  const { data: seed, error: seedErr } = await admin
    .from("appointments")
    .insert({
      patient_name: "Seed Patient",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
      status: "new",
    })
    .select("id")
    .single();
  if (seedErr) throw seedErr;
  const seedId = seed.id as string;

  const cleanup = async () => {
    await admin.from("appointments").delete().eq("id", seedId);
    await admin.from("appointments").delete().ilike("patient_name", "RLS-%");
    for (const u of [adminU, recepU, patntU]) {
      await admin.auth.admin.deleteUser(u.userId);
    }
  };

  try {
    // ── ANON ──────────────────────────────────────────────────────────────────
    console.log("\n── anon ──");
    await test("anon can INSERT valid appointment (status/notes sanitized)", async () => {
      // Note: anon lacks SELECT, so we cannot use .select() after insert.
      // Insert with return=minimal, then verify via the admin client.
      const marker = `RLS-Anon-${Date.now()}`;
      const { error } = await anon.from("appointments").insert({
        patient_name: marker,
        patient_phone: "0512345678",
        appointment_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        appointment_time: "11:00",
        status: "confirmed", // trigger should force to 'new'
        notes: "attempted staff note", // trigger should NULL
      } as any);
      assert(!error, `insert failed: ${error?.message}`);
      const { data: row } = await admin
        .from("appointments")
        .select("status,notes")
        .eq("patient_name", marker)
        .single();
      assert(row?.status === "new", `status not forced to 'new' (got ${row?.status})`);
      assert(row?.notes === null, "notes not cleared by trigger");
    });

    await test("anon INSERT with short phone rejected", async () => {
      const { error } = await anon.from("appointments").insert({
        patient_name: "RLS-X",
        patient_phone: "12",
        appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        appointment_time: "11:00",
      } as any);
      assert(error, "expected rejection");
    });

    await test("anon INSERT with past date rejected", async () => {
      const { error } = await anon.from("appointments").insert({
        patient_name: "RLS-X",
        patient_phone: "0512345678",
        appointment_date: "2000-01-01",
        appointment_time: "11:00",
      } as any);
      assert(error, "expected rejection");
    });

    await test("anon SELECT returns 0 rows", async () => {
      const { data, error } = await anon.from("appointments").select("id");
      assert(!error, `select errored: ${error?.message}`);
      assert(data!.length === 0, `expected 0 rows, got ${data!.length}`);
    });

    await test("anon UPDATE affects 0 rows", async () => {
      const { data, error } = await anon
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", seedId)
        .select();
      assert(!error, `update errored: ${error?.message}`);
      assert(data!.length === 0, "expected 0 rows updated");
    });

    await test("anon DELETE affects 0 rows", async () => {
      const { data, error } = await anon.from("appointments").delete().eq("id", seedId).select();
      assert(!error, `delete errored: ${error?.message}`);
      assert(data!.length === 0, "expected 0 rows deleted");
    });

    // ── PATIENT (authenticated, no staff role) ────────────────────────────────
    console.log("\n── authenticated (no staff role) ──");
    const patient = await signInAs(patntU.email, patntU.password);

    await test("patient SELECT returns 0 rows", async () => {
      const { data, error } = await patient.from("appointments").select("id");
      assert(!error, `select errored: ${error?.message}`);
      assert(data!.length === 0, `expected 0 rows, got ${data!.length}`);
    });
    await test("patient UPDATE affects 0 rows", async () => {
      const { data } = await patient
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", seedId)
        .select();
      assert(data!.length === 0, "expected 0");
    });
    await test("patient DELETE affects 0 rows", async () => {
      const { data } = await patient.from("appointments").delete().eq("id", seedId).select();
      assert(data!.length === 0, "expected 0");
    });

    // ── RECEPTION ─────────────────────────────────────────────────────────────
    console.log("\n── reception ──");
    const reception = await signInAs(recepU.email, recepU.password);

    await test("reception can SELECT appointments", async () => {
      const { data, error } = await reception.from("appointments").select("id");
      assert(!error, `select errored: ${error?.message}`);
      assert(data!.length >= 1, "expected ≥ 1 row");
    });
    await test("reception can UPDATE appointment status", async () => {
      const { data, error } = await reception
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("id", seedId)
        .select();
      assert(!error, `update errored: ${error?.message}`);
      assert(data!.length === 1, "expected 1 row updated");
    });
    await test("reception DELETE affects 0 rows (admin-only)", async () => {
      const { data } = await reception.from("appointments").delete().eq("id", seedId).select();
      assert(data!.length === 0, "reception must NOT delete");
    });

    // ── ADMIN ─────────────────────────────────────────────────────────────────
    console.log("\n── admin ──");
    const adminUser = await signInAs(adminU.email, adminU.password);

    await test("admin can SELECT appointments", async () => {
      const { data, error } = await adminUser.from("appointments").select("id");
      assert(!error, `select errored: ${error?.message}`);
      assert(data!.length >= 1, "expected ≥ 1 row");
    });
    await test("admin can UPDATE appointment", async () => {
      const { data, error } = await adminUser
        .from("appointments")
        .update({ status: "completed", notes: "done" })
        .eq("id", seedId)
        .select();
      assert(!error, `update errored: ${error?.message}`);
      assert(data!.length === 1, "expected 1 row updated");
    });
    await test("admin can DELETE appointment", async () => {
      const { data, error } = await adminUser
        .from("appointments")
        .delete()
        .eq("id", seedId)
        .select();
      assert(!error, `delete errored: ${error?.message}`);
      assert(data!.length === 1, "expected 1 row deleted");
    });
  } finally {
    console.log("\nCleaning up…");
    await cleanup();
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
