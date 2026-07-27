/**
 * Integration test: non-privileged roles cannot mutate an appointment's
 * status or notes. RLS is silent on non-admin/non-reception callers — the
 * UPDATE matches zero rows (no error, no state change) — so the admin UI's
 * generic «فشل التحديث» toast never fires because the RPC returns
 * successfully with no effect. What we CAN verify end-to-end is the
 * invariant that matters to the user:
 *   - appointments.status / notes are UNCHANGED
 *   - NO row is written to appointment_audit
 *   - the same call from admin (control) succeeds and IS audited
 *
 * Roles covered per action:
 *   pharmacy, patient (no role), anonymous  →  blocked (no-op, no audit)
 *   admin (control)                        →  accepted, audited
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-non-admin-cannot-mutate.test.ts
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
async function newAppt(): Promise<string> {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "NoRoleGuard",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
      status: "confirmed",
    })
    .select("id")
    .single();
  if (error) throw error;
  // Seed initial notes via a service-role UPDATE, then wipe any audit rows
  // it may have generated so our assertions measure only the RPC under test.
  const up = await admin.from("appointments").update({ notes: "ملاحظة أصلية" }).eq("id", data.id);
  if (up.error) throw up.error;
  await admin.from("appointment_audit").delete().eq("appointment_id", data.id);
  return data.id as string;
}
const stateOf = async (id: string) => {
  const { data } = await admin.from("appointments").select("status, notes").eq("id", id).single();
  return data as { status: string; notes: string | null };
};
const auditOf = async (id: string) =>
  (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];

const stamp = Date.now();
const created: string[] = [];
let pharmU: Awaited<ReturnType<typeof createUser>> | null = null;
let patU: Awaited<ReturnType<typeof createUser>> | null = null;
let adminU: Awaited<ReturnType<typeof createUser>> | null = null;

(async () => {
  console.log("── non-admin roles cannot mutate status/notes ──");
  pharmU = await createUser(`ng-pharm-${stamp}@test.local`, "pharmacy");
  patU = await createUser(`ng-pat-${stamp}@test.local`, null);
  adminU = await createUser(`ng-admin-${stamp}@test.local`, "admin");
  const pharmC = await signInAs(pharmU.email, pharmU.password);
  const patC = await signInAs(patU.email, patU.password);
  const adminC = await signInAs(adminU.email, adminU.password);
  const anonC = createClient(URL, ANON, { auth: { persistSession: false } });

  const roles: Array<{ label: string; client: SupabaseClient }> = [
    { label: "pharmacy", client: pharmC },
    { label: "patient (none)", client: patC },
    { label: "anonymous", client: anonC },
  ];

  try {
    // ── STATUS: update_appointment_status must be a no-op for non-privileged roles ──
    for (const { label, client } of roles) {
      await test(`${label} → update_appointment_status is silently blocked (no state, no audit)`, async () => {
        const id = await newAppt();
        created.push(id);
        const before = await stateOf(id);
        const { error } = await client.rpc("update_appointment_status" as any, {
          _id: id,
          _status: "cancelled",
          _reason: "محاولة إلغاء",
        });
        // Non-privileged callers get no error — RLS filters the UPDATE to zero
        // rows. The proof of blocking is state + audit, not the error object.
        // (We tolerate an error too, in case an anon call is rejected upstream.)
        if (error) {
          // An error here is acceptable — the important thing is nothing changed.
        }
        const after = await stateOf(id);
        assert(
          after.status === before.status,
          `status changed: ${before.status} → ${after.status}`,
        );
        assert(after.notes === before.notes, "notes changed unexpectedly");
        assert(
          (await auditOf(id)).length === 0,
          "appointment_audit must NOT have a row for a blocked caller",
        );
      });
    }

    // ── NOTES: update_appointment_notes must be a no-op for non-privileged roles ──
    for (const { label, client } of roles) {
      await test(`${label} → update_appointment_notes is silently blocked (no state, no audit)`, async () => {
        const id = await newAppt();
        created.push(id);
        const before = await stateOf(id);
        const { error } = await client.rpc("update_appointment_notes" as any, {
          _id: id,
          _notes: "محاولة تعديل ملاحظة",
          _reason: "غير مصرح",
        });
        if (error) {
          /* tolerated; state + audit are the source of truth */
        }
        const after = await stateOf(id);
        assert(
          after.notes === before.notes,
          `notes changed: ${JSON.stringify(before.notes)} → ${JSON.stringify(after.notes)}`,
        );
        assert(after.status === before.status, "status changed unexpectedly");
        assert(
          (await auditOf(id)).length === 0,
          "appointment_audit must NOT have a row for a blocked caller",
        );
      });

      await test(`${label} → cannot clear notes via _notes=NULL either`, async () => {
        const id = await newAppt();
        created.push(id);
        const before = await stateOf(id);
        await client.rpc("update_appointment_notes" as any, {
          _id: id,
          _notes: null,
          _reason: null,
        });
        const after = await stateOf(id);
        assert(
          after.notes === before.notes,
          `notes cleared by non-privileged caller: ${JSON.stringify(after.notes)}`,
        );
        assert((await auditOf(id)).length === 0, "no audit row expected");
      });
    }

    // ── Control: admin CAN mutate both and IS audited ──
    await test("control: admin can update_appointment_status → state changes + audit row", async () => {
      const id = await newAppt();
      created.push(id);
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "cancelled",
        _reason: "طلب المريض",
      });
      assert(!error, `admin rpc failed: ${error?.message}`);
      const after = await stateOf(id);
      assert(after.status === "cancelled", `admin status not applied: ${after.status}`);
      const rows = await auditOf(id);
      assert(
        rows.length === 1 && rows[0].new_status === "cancelled" && rows[0].reason === "طلب المريض",
        `admin audit not written correctly: ${JSON.stringify(rows)}`,
      );
    });

    await test("control: admin can update_appointment_notes → state changes + audit row", async () => {
      const id = await newAppt();
      created.push(id);
      const { error } = await adminC.rpc("update_appointment_notes" as any, {
        _id: id,
        _notes: "ملاحظة جديدة",
        _reason: "تحديث",
      });
      assert(!error, `admin rpc failed: ${error?.message}`);
      const after = await stateOf(id);
      assert(after.notes === "ملاحظة جديدة", `admin notes not applied: ${after.notes}`);
      const rows = await auditOf(id);
      assert(
        rows.length === 1 && rows[0].new_notes === "ملاحظة جديدة" && rows[0].reason === "تحديث",
        `admin audit not written correctly: ${JSON.stringify(rows)}`,
      );
    });
  } finally {
    console.log("\nCleaning up…");
    if (created.length) await admin.from("appointments").delete().in("id", created);
    for (const u of [pharmU, patU, adminU]) if (u) await admin.auth.admin.deleteUser(u.userId);
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
