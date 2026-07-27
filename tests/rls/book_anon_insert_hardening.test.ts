/**
 * Integration tests for the public /book path — anon insert hardening.
 *
 * Covers the guarantees the public booking UI depends on:
 *   1) trg_force_appointment_defaults rewrites `status` and `notes` to
 *      defaults on anon INSERT, even when the caller injects values.
 *   2) RLS WITH CHECK on `anyone create appointments` rejects:
 *        - past-date appointment_date
 *        - whitespace-only patient_name (btrim length < 2)
 *        - patient_phone shorter than 6 chars
 *   3) anon cannot SELECT appointments (RLS restricts to staff).
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/book_anon_insert_hardening.test.ts
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SVC) {
  console.log("(skipping — missing Supabase env vars)");
  process.exit(0);
}

const admin = createClient(URL, SVC, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

let passed = 0,
  failed = 0;
const created: string[] = [];

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

const tomorrow = () => new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

async function run() {
  console.log("book_anon_insert_hardening");

  await test("anon INSERT with injected status/notes → trigger normalizes to 'new'/null", async () => {
    // Note: don't request representation — anon has no SELECT policy on
    // appointments, so `Prefer: return=representation` would surface as a
    // row-level-security error even though the insert itself succeeded.
    const probe = `PublicPatient-${Date.now()}`;
    const { error } = await anon.from("appointments").insert({
      patient_name: probe,
      patient_phone: "0500000000",
      appointment_date: tomorrow(),
      appointment_time: "10:00",
      status: "confirmed", // attacker injection
      notes: "leaked private note", // attacker injection
    } as any);
    assert(!error, `insert failed: ${error?.message}`);
    const { data: rows } = await admin
      .from("appointments")
      .select("id, status, notes")
      .eq("patient_name", probe)
      .limit(1);
    assert(rows && rows.length === 1, "expected exactly 1 row inserted");
    created.push(rows[0].id);
    assert(rows[0].status === "new", `expected status='new', got ${rows[0].status}`);
    assert(rows[0].notes === null, `expected notes=null, got ${JSON.stringify(rows[0].notes)}`);
  });

  await test("anon INSERT with past date → RLS rejects (42501), no row created", async () => {
    const { data, error } = await anon
      .from("appointments")
      .insert({
        patient_name: "Public Patient",
        patient_phone: "0500000000",
        appointment_date: yesterday(),
        appointment_time: "10:00",
      })
      .select("id")
      .maybeSingle();
    assert(error, "expected RLS to reject past-date insert");
    assert(!data, "no row should be returned");
    // Postgres surfaces WITH CHECK failure as 42501/RLS or as 42501 error;
    // don't over-specify the code, but the message must mention RLS.
    assert(
      /row-level security|violates row-level/i.test(error?.message ?? ""),
      `unexpected error: ${error?.message}`,
    );
  });

  await test("anon INSERT with whitespace-only name → RLS rejects, no row", async () => {
    const { data, error } = await anon
      .from("appointments")
      .insert({
        patient_name: "   ",
        patient_phone: "0500000000",
        appointment_date: tomorrow(),
        appointment_time: "10:00",
      })
      .select("id")
      .maybeSingle();
    assert(error, "expected rejection for whitespace-only name");
    assert(!data, "no row should be returned");
  });

  await test("anon INSERT with too-short phone (5 chars) → RLS rejects", async () => {
    const { data, error } = await anon
      .from("appointments")
      .insert({
        patient_name: "Valid Name",
        patient_phone: "12345",
        appointment_date: tomorrow(),
        appointment_time: "10:00",
      })
      .select("id")
      .maybeSingle();
    assert(error, "expected rejection for short phone");
    assert(!data, "no row should be returned");
  });

  await test("anon SELECT on appointments returns 0 rows (staff-only read)", async () => {
    // Insert one row via admin so a global count exists, then read as anon.
    const { data: a } = await admin
      .from("appointments")
      .insert({
        patient_name: "AnonReadProbe",
        patient_phone: "0500000000",
        appointment_date: tomorrow(),
        appointment_time: "11:00",
        status: "new",
      })
      .select("id")
      .single();
    if (a?.id) created.push(a.id);
    const { data: rows, error } = await anon.from("appointments").select("id").limit(50);
    assert(!error, `anon select errored: ${error?.message}`);
    assert(
      Array.isArray(rows) && rows.length === 0,
      `anon must not read appointments; got ${rows?.length ?? "?"} rows`,
    );
  });
}

try {
  await run();
} finally {
  if (created.length) {
    await admin.from("appointment_audit").delete().in("appointment_id", created);
    await admin.from("appointments").delete().in("id", created);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
