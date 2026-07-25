/**
 * Trigger tests: log_reminder_preference_change
 *
 * Verifies:
 *   - self_service path (anon RPC update_reminders_by_ref):
 *       source='self_service', changed_by IS NULL, reason IS NULL
 *   - staff path (reception direct UPDATE):
 *       source='staff', changed_by=<receptionUid>, reason IS NULL
 *   - staff path (admin direct UPDATE):
 *       source='staff', changed_by=<adminUid>, reason IS NULL
 *
 * The "reason IS NULL" assertions exercise the trigger's read of
 * current_setting('app.change_reason', true) → NULLIF: when no caller
 * sets the GUC, the audit row's reason must be NULL. Positive coverage
 * (reason set to a value via SET LOCAL) requires DB write access we don't
 * have here — it's implicitly covered by the appointment_audit trigger
 * tests which use the same GUC-read pattern via update_appointment_status.
 *
 * Run:  bun tests/rls/reminder-preference-audit-trigger.test.ts
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
  async function createUser(email: string, role?: "admin" | "reception") {
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

  const stamp = Date.now();
  const phone = "0500000019";
  const createdAppts: string[] = [];
  const createdUsers: string[] = [];

  async function newAppt(): Promise<string> {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "Trigger-Test",
        patient_phone: phone,
        appointment_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
        appointment_time: "11:00",
        status: "new",
        reminder_24h: true,
        reminder_2h: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    const id = data.id as string;
    createdAppts.push(id);
    return id;
  }

  async function latestAuditRow(apptId: string, kind: "reminder_24h" | "reminder_2h") {
    const { data, error } = await admin
      .from("reminder_preference_audit")
      .select("*")
      .eq("appointment_id", apptId)
      .eq("reminder_kind", kind)
      .order("changed_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data ?? [])[0];
  }

  const receptionU = await createUser(`rpt-recep-${stamp}@test.local`, "reception");
  const adminU = await createUser(`rpt-admin-${stamp}@test.local`, "admin");
  createdUsers.push(receptionU.userId, adminU.userId);

  const receptionC = await signInAs(receptionU.email, receptionU.password);
  const adminC = await signInAs(adminU.email, adminU.password);

  console.log("\n── reminder_preference_audit trigger ──");

  try {
    // ── 1) self_service via anon RPC ────────────────────────────────
    await test("self_service RPC: source='self_service', changed_by IS NULL, reason IS NULL", async () => {
      const apptId = await newAppt();
      const ref = apptId.replace(/-/g, "").slice(0, 8);
      const { data: ok, error } = await anon.rpc("update_reminders_by_ref", {
        _ref: ref,
        _phone: phone,
        _reminder_24h: false,
        _reminder_2h: null as unknown as boolean,
      });
      assert(!error, `rpc err: ${error?.message}`);
      assert(ok === true, `rpc returned ${ok}`);
      const row = await latestAuditRow(apptId, "reminder_24h");
      assert(row, "no audit row created");
      assert(row.source === "self_service", `expected source=self_service, got ${row.source}`);
      assert(row.changed_by === null, `expected changed_by NULL, got ${row.changed_by}`);
      assert(
        row.old_value === true && row.new_value === false,
        `expected true→false, got ${row.old_value}→${row.new_value}`,
      );
      assert(
        row.reason === null,
        `expected reason NULL (RPC doesn't set GUC), got ${JSON.stringify(row.reason)}`,
      );
    });

    // ── 2) staff (reception) direct UPDATE ──────────────────────────
    await test("staff (reception) UPDATE: source='staff', changed_by=<receptionUid>", async () => {
      const apptId = await newAppt();
      const { error } = await receptionC
        .from("appointments")
        .update({ reminder_2h: false })
        .eq("id", apptId);
      assert(!error, `update err: ${error?.message}`);
      const row = await latestAuditRow(apptId, "reminder_2h");
      assert(row, "no audit row created");
      assert(row.source === "staff", `expected source=staff, got ${row.source}`);
      assert(
        row.changed_by === receptionU.userId,
        `expected changed_by=${receptionU.userId}, got ${row.changed_by}`,
      );
      assert(row.new_value === false, `expected new_value=false, got ${row.new_value}`);
      assert(
        row.reason === null,
        `expected reason NULL (no GUC set), got ${JSON.stringify(row.reason)}`,
      );
    });

    // ── 3) staff (admin) direct UPDATE ──────────────────────────────
    await test("staff (admin) UPDATE: source='staff', changed_by=<adminUid>", async () => {
      const apptId = await newAppt();
      const { error } = await adminC
        .from("appointments")
        .update({ reminder_24h: false })
        .eq("id", apptId);
      assert(!error, `update err: ${error?.message}`);
      const row = await latestAuditRow(apptId, "reminder_24h");
      assert(row, "no audit row created");
      assert(row.source === "staff", `expected source=staff, got ${row.source}`);
      assert(
        row.changed_by === adminU.userId,
        `expected changed_by=${adminU.userId}, got ${row.changed_by}`,
      );
      assert(
        row.reason === null,
        `expected reason NULL (no GUC set), got ${JSON.stringify(row.reason)}`,
      );
    });

    // ── 4) self_service via anon RPC WITH reason ────────────────────
    await test("self_service RPC with _reason: trigger reads app.change_reason", async () => {
      const apptId = await newAppt();
      const ref = apptId.replace(/-/g, "").slice(0, 8);
      const reasonText = "أريد إيقاف تذكيرات 24 ساعة فقط";
      const { data: ok, error } = await anon.rpc("update_reminders_by_ref", {
        _ref: ref,
        _phone: phone,
        _reminder_24h: false,
        _reminder_2h: null as unknown as boolean,
        _reason: reasonText,
      });
      assert(!error, `rpc err: ${error?.message}`);
      assert(ok === true, `rpc returned ${ok}`);
      const row = await latestAuditRow(apptId, "reminder_24h");
      assert(row, "no audit row created");
      assert(
        row.reason === reasonText,
        `expected reason=${JSON.stringify(reasonText)}, got ${JSON.stringify(row.reason)}`,
      );
      assert(row.source === "self_service", `expected source=self_service, got ${row.source}`);
      assert(row.changed_by === null, `expected changed_by NULL, got ${row.changed_by}`);
    });

    // ── 5) self_service RPC with whitespace-only reason → NULL ─────
    await test("self_service RPC with blank _reason: normalized to NULL", async () => {
      const apptId = await newAppt();
      const ref = apptId.replace(/-/g, "").slice(0, 8);
      const { data: ok, error } = await anon.rpc("update_reminders_by_ref", {
        _ref: ref,
        _phone: phone,
        _reminder_24h: false,
        _reminder_2h: null as unknown as boolean,
        _reason: "   \n\t  ",
      });
      assert(!error, `rpc err: ${error?.message}`);
      assert(ok === true, `rpc returned ${ok}`);
      const row = await latestAuditRow(apptId, "reminder_24h");
      assert(row, "no audit row created");
      assert(
        row.reason === null,
        `expected reason NULL after normalize, got ${JSON.stringify(row.reason)}`,
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
