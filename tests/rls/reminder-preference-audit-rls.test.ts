/**
 * RLS tests: reminder_preference_audit access control.
 *
 * Verifies:
 *   - anon cannot SELECT, INSERT, UPDATE, or DELETE
 *   - authenticated non-staff (no role) cannot SELECT or write
 *   - authenticated with role='reception' CAN SELECT (rows visible)
 *   - authenticated with role='admin' CAN SELECT (rows visible)
 *   - all authenticated roles (incl. staff) CANNOT INSERT/UPDATE/DELETE
 *   - only the trigger writes (service_role or triggered path)
 *
 * Run:  bun tests/rls/reminder-preference-audit-rls.test.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

async function main() {
  const URL = process.env.SUPABASE_URL!;
  const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!URL || !ANON || !SERVICE) {
    console.log("(skipping — missing Supabase env vars)");
    return;
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });

  async function signInAs(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    assert(data.session, "no session");
    return c;
  }
  async function createUser(email: string, role?: "admin" | "reception" | "pharmacy") {
    const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (role) {
      await admin.from("user_roles").insert({ user_id: data.user.id, role });
    }
    return { userId: data.user.id, email, password };
  }

  const phone = "0500000009";
  const stamp = Date.now();
  const createdAppts: string[] = [];
  const createdUsers: string[] = [];

  async function newApptWithAuditRow() {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "RLS-Audit-Test",
        patient_phone: phone,
        appointment_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        appointment_time: "10:00",
        status: "new",
        reminder_24h: true,
        reminder_2h: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    const id = data.id as string;
    createdAppts.push(id);
    // Trigger an audit row via a real change.
    await admin.from("appointments").update({ reminder_24h: false }).eq("id", id);
    return id;
  }

  const staffU = await createUser(`rpa-staff-${stamp}@test.local`, "reception");
  const adminU = await createUser(`rpa-admin-${stamp}@test.local`, "admin");
  const plainU = await createUser(`rpa-plain-${stamp}@test.local`); // no role
  const pharmU = await createUser(`rpa-pharm-${stamp}@test.local`, "pharmacy");
  createdUsers.push(staffU.userId, adminU.userId, plainU.userId, pharmU.userId);

  const staffC = await signInAs(staffU.email, staffU.password);
  const adminC = await signInAs(adminU.email, adminU.password);
  const plainC = await signInAs(plainU.email, plainU.password);
  const pharmC = await signInAs(pharmU.email, pharmU.password);

  console.log("\n── reminder_preference_audit RLS ──");

  try {
    // Seed one appointment with one audit row so SELECT tests have data.
    const apptId = await newApptWithAuditRow();
    const seedRow = await admin
      .from("reminder_preference_audit")
      .select("id")
      .eq("appointment_id", apptId)
      .single();
    assert(!seedRow.error && seedRow.data, "seed audit row missing");
    const auditId = seedRow.data.id as string;

    // ── READ (SELECT) ───────────────────────────────────────────────
    await test("anon cannot SELECT (returns 0 rows)", async () => {
      const { data, error } = await anon
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", apptId);
      assert(!error, `unexpected err: ${error?.message}`);
      assert((data ?? []).length === 0, `anon leaked ${data?.length} rows`);
    });

    await test("authenticated with no role cannot SELECT", async () => {
      const { data } = await plainC
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", apptId);
      assert((data ?? []).length === 0, `no-role user leaked ${data?.length} rows`);
    });

    await test("authenticated with role='pharmacy' cannot SELECT", async () => {
      const { data } = await pharmC
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", apptId);
      assert((data ?? []).length === 0, `pharmacy leaked ${data?.length} rows`);
    });

    await test("authenticated with role='reception' CAN SELECT", async () => {
      const { data, error } = await staffC
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", apptId);
      assert(!error, `err: ${error?.message}`);
      assert((data ?? []).length >= 1, `reception should see rows, got ${data?.length}`);
    });

    await test("authenticated with role='admin' CAN SELECT", async () => {
      const { data, error } = await adminC
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", apptId);
      assert(!error, `err: ${error?.message}`);
      assert((data ?? []).length >= 1, `admin should see rows, got ${data?.length}`);
    });

    // ── INSERT (all denied — trigger is the only writer) ────────────
    const validInsert = {
      appointment_id: apptId,
      reminder_kind: "reminder_2h",
      source: "system",
      old_value: true,
      new_value: false,
    };

    await test("anon cannot INSERT", async () => {
      const { error } = await anon.from("reminder_preference_audit").insert(validInsert);
      assert(error !== null, "anon insert must be blocked");
    });
    await test("authenticated no-role cannot INSERT", async () => {
      const { error } = await plainC.from("reminder_preference_audit").insert(validInsert);
      assert(error !== null, "no-role insert must be blocked");
    });
    await test("authenticated reception cannot INSERT", async () => {
      const { error } = await staffC.from("reminder_preference_audit").insert(validInsert);
      assert(error !== null, "reception insert must be blocked (no INSERT policy)");
    });
    await test("authenticated admin cannot INSERT directly", async () => {
      const { error } = await adminC.from("reminder_preference_audit").insert(validInsert);
      assert(error !== null, "admin insert must be blocked (no INSERT policy)");
    });

    // ── UPDATE (all denied) ─────────────────────────────────────────
    await test("anon cannot UPDATE", async () => {
      const { error, data } = await anon
        .from("reminder_preference_audit")
        .update({ reason: "hacked" })
        .eq("id", auditId)
        .select();
      // RLS may return no error + 0 rows, or an error. Either way, no mutation.
      assert(!data || data.length === 0, `anon updated ${data?.length} rows`);
      const { data: fresh } = await admin
        .from("reminder_preference_audit")
        .select("reason")
        .eq("id", auditId)
        .single();
      assert(fresh?.reason !== "hacked", "anon UPDATE leaked through");
      void error;
    });
    await test("authenticated admin cannot UPDATE", async () => {
      const { data } = await adminC
        .from("reminder_preference_audit")
        .update({ reason: "admin-hack" })
        .eq("id", auditId)
        .select();
      assert(!data || data.length === 0, `admin updated ${data?.length} rows`);
      const { data: fresh } = await admin
        .from("reminder_preference_audit")
        .select("reason")
        .eq("id", auditId)
        .single();
      assert(fresh?.reason !== "admin-hack", "admin UPDATE leaked through");
    });
    await test("authenticated reception cannot UPDATE", async () => {
      const { data } = await staffC
        .from("reminder_preference_audit")
        .update({ reason: "reception-hack" })
        .eq("id", auditId)
        .select();
      assert(!data || data.length === 0, `reception updated ${data?.length} rows`);
    });

    // ── DELETE (all denied) ─────────────────────────────────────────
    await test("anon cannot DELETE", async () => {
      await anon.from("reminder_preference_audit").delete().eq("id", auditId);
      const { data } = await admin
        .from("reminder_preference_audit")
        .select("id")
        .eq("id", auditId)
        .maybeSingle();
      assert(data?.id === auditId, "anon DELETE removed the row");
    });
    await test("authenticated admin cannot DELETE", async () => {
      await adminC.from("reminder_preference_audit").delete().eq("id", auditId);
      const { data } = await admin
        .from("reminder_preference_audit")
        .select("id")
        .eq("id", auditId)
        .maybeSingle();
      assert(data?.id === auditId, "admin DELETE removed the row");
    });
    await test("authenticated reception cannot DELETE", async () => {
      await staffC.from("reminder_preference_audit").delete().eq("id", auditId);
      const { data } = await admin
        .from("reminder_preference_audit")
        .select("id")
        .eq("id", auditId)
        .maybeSingle();
      assert(data?.id === auditId, "reception DELETE removed the row");
    });

    // ── Trigger still writes for staff-owned changes ─────────────────
    await test("staff-driven appointment update still produces an audit row via trigger", async () => {
      // Reception updates appointments table directly — trigger should log it.
      const { error } = await staffC
        .from("appointments")
        .update({ reminder_2h: false })
        .eq("id", apptId);
      assert(!error, `staff update err: ${error?.message}`);
      const { data } = await staffC
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", apptId)
        .eq("reminder_kind", "reminder_2h");
      assert((data ?? []).length >= 1, "trigger row for reminder_2h missing");
      const row = (data ?? []).at(-1) as unknown;
      assert(row.source === "staff", `expected source=staff, got ${row.source}`);
      assert(
        row.changed_by === staffU.userId,
        `changed_by should be staff user, got ${row.changed_by}`,
      );
    });
  } finally {
    if (createdAppts.length) {
      await admin.from("appointments").delete().in("id", createdAppts);
    }
    for (const uid of createdUsers) {
      await admin.auth.admin.deleteUser(uid).catch(() => {});
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
