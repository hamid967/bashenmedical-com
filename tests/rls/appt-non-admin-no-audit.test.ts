/**
 * Integration test: non-admin roles attempting to update `status` or `notes`
 * MUST NOT produce any row in appointment_audit.
 *
 * RLS silently filters the UPDATE to 0 rows (no error, no state change),
 * and because the audit trigger only fires on actual row UPDATEs, no audit
 * row is written. This test locks that invariant in.
 *
 * Roles covered: reception, pharmacy, patient (no role), anon.
 * Both direct UPDATE and the RPC surfaces are exercised.
 * An admin control at the end proves the setup would otherwise write audit rows.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-non-admin-no-audit.test.ts
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
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

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
async function newAppt(initialStatus: "confirmed" = "confirmed", initialNotes: string = "أصلية") {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "NonAdminNoAudit",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: uerr } = await admin
    .from("appointments")
    .update({ status: initialStatus, notes: initialNotes })
    .eq("id", data.id);
  if (uerr) throw uerr;
  await admin.from("appointment_audit").delete().eq("appointment_id", data.id);
  return { id: data.id as string, status: initialStatus, notes: initialNotes };
}
const auditCount = async (id: string) =>
  (await admin.from("appointment_audit").select("id").eq("appointment_id", id)).data?.length ?? 0;
const rowOf = async (id: string) =>
  (await admin.from("appointments").select("status, notes").eq("id", id).single()).data;

const stamp = Date.now();
const created: string[] = [];
const users: Array<{ userId: string; email: string; password: string }> = [];

(async () => {
  console.log("── non-admin status/notes updates: 0 audit rows ──");

  const pharm = await createUser(`nad-pharm-${stamp}@test.local`, "pharmacy");
  const patient = await createUser(`nad-patient-${stamp}@test.local`, null);
  const adminU = await createUser(`nad-admin-${stamp}@test.local`, "admin");
  users.push(pharm, patient, adminU);

  try {
    // Note: `reception` is deliberately excluded — reception legitimately
    // updates appointments and IS expected to write audit rows. This test
    // targets roles that MUST be blocked entirely.
    const clients: Array<{ label: string; client: SupabaseClient }> = [
      { label: "pharmacy", client: await signInAs(pharm.email, pharm.password) },
      { label: "patient", client: await signInAs(patient.email, patient.password) },
      { label: "anon", client: anon },
    ];

    for (const { label, client } of clients) {
      // ── Direct UPDATE: status ──
      await test(`${label} → direct UPDATE status: 0 rows changed, 0 audit rows`, async () => {
        const a = await newAppt();
        created.push(a.id);
        const before = await rowOf(a.id);
        const { data, error } = await client
          .from("appointments")
          .update({ status: "cancelled" })
          .eq("id", a.id)
          .select();
        assert(!error, `unexpected error: ${error?.message}`);
        assert((data ?? []).length === 0, `expected 0 rows updated, got ${data?.length}`);
        const after = await rowOf(a.id);
        assert(after?.status === before?.status, "status must not change");
        assert((await auditCount(a.id)) === 0, "no audit row must be written");
      });

      // ── Direct UPDATE: notes ──
      await test(`${label} → direct UPDATE notes: 0 rows changed, 0 audit rows`, async () => {
        const a = await newAppt();
        created.push(a.id);
        const before = await rowOf(a.id);
        const { data, error } = await client
          .from("appointments")
          .update({ notes: "محاولة تعديل" })
          .eq("id", a.id)
          .select();
        assert(!error, `unexpected error: ${error?.message}`);
        assert((data ?? []).length === 0, `expected 0 rows updated, got ${data?.length}`);
        const after = await rowOf(a.id);
        assert(after?.notes === before?.notes, "notes must not change");
        assert((await auditCount(a.id)) === 0, "no audit row must be written");
      });

      // ── RPC: update_appointment_status (non-required transition + a required one) ──
      for (const [status, reason] of [
        ["completed", null] as const,
        ["cancelled", "قرار المريض"] as const,
      ]) {
        await test(`${label} → RPC update_appointment_status(${status}): 0 audit rows`, async () => {
          const a = await newAppt();
          created.push(a.id);
          const before = await rowOf(a.id);
          const { error } = await client.rpc("update_appointment_status" as any, {
            _id: a.id,
            _status: status,
            _reason: reason,
          });
          // The RPC itself does not error (it just runs an UPDATE that RLS filters to 0 rows).
          assert(!error, `unexpected error: ${error?.code} ${error?.message}`);
          const after = await rowOf(a.id);
          assert(
            after?.status === before?.status,
            `status must not change (was ${before?.status}, now ${after?.status})`,
          );
          assert((await auditCount(a.id)) === 0, "no audit row must be written");
        });
      }

      // ── RPC: update_appointment_notes ──
      await test(`${label} → RPC update_appointment_notes: 0 audit rows`, async () => {
        const a = await newAppt();
        created.push(a.id);
        const before = await rowOf(a.id);
        const { error } = await client.rpc("update_appointment_notes" as any, {
          _id: a.id,
          _notes: "محاولة تعديل عبر RPC",
          _reason: null,
        });
        assert(!error, `unexpected error: ${error?.code} ${error?.message}`);
        const after = await rowOf(a.id);
        assert(
          after?.notes === before?.notes,
          `notes must not change (was ${JSON.stringify(before?.notes)}, now ${JSON.stringify(after?.notes)})`,
        );
        assert((await auditCount(a.id)) === 0, "no audit row must be written");
      });
    }

    // ── ADMIN CONTROL ─────────────────────────────────────────────────────────
    // Prove the setup would otherwise write audit rows, so the "0" above is
    // meaningful — not a mis-wired trigger.
    const adminC = await signInAs(adminU.email, adminU.password);
    await test("control: admin RPC status change → 1 audit row (setup works)", async () => {
      const a = await newAppt();
      created.push(a.id);
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "completed",
        _reason: null,
      });
      assert(!error, `admin rpc failed: ${error?.code} ${error?.message}`);
      assert((await rowOf(a.id))?.status === "completed", "admin change must apply");
      assert((await auditCount(a.id)) === 1, "admin change must produce exactly 1 audit row");
    });
  } finally {
    console.log("\nCleaning up…");
    if (created.length) await admin.from("appointments").delete().in("id", created);
    for (const u of users) await admin.auth.admin.deleteUser(u.userId);
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
