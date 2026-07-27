/**
 * Integration tests for the appointment notes flow + DB reason-enforcement.
 *
 * Covers:
 *   - update_appointment_notes RPC: only admin / reception can effectively
 *     mutate notes (RLS blocks patients silently).
 *   - Every notes change is captured in appointment_audit with the actor
 *     and the optional reason (set via app.change_reason).
 *   - DB-level guarantee: transitions to `cancelled` / `no_show` without a
 *     reason are rejected by the log_appointment_change trigger even if the
 *     caller bypasses the application layer.
 *
 * Run:  bun tests/rls/appt-notes.test.ts
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

  async function newAppt(status: "new" | "confirmed" = "new"): Promise<string> {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "NOTES-Test",
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
  const notesOf = async (id: string) =>
    (await admin.from("appointments").select("notes").eq("id", id).single()).data?.notes;
  const auditOf = async (id: string) =>
    (
      await admin
        .from("appointment_audit")
        .select("*")
        .eq("appointment_id", id)
        .order("changed_at", { ascending: false })
    ).data ?? [];

  console.log("── updateAppointmentNotes integration ──");
  const stamp = Date.now();
  const adminU = await createUser(`nt-admin-${stamp}@test.local`, "admin");
  const recepU = await createUser(`nt-recep-${stamp}@test.local`, "reception");
  const pharmU = await createUser(`nt-pharm-${stamp}@test.local`, "pharmacy");
  const patU = await createUser(`nt-pat-${stamp}@test.local`, null);

  const adminC = await signInAs(adminU.email, adminU.password);
  const recepC = await signInAs(recepU.email, recepU.password);
  const pharmC = await signInAs(pharmU.email, pharmU.password);
  const patC = await signInAs(patU.email, patU.password);

  const created: string[] = [];
  const cleanup = async () => {
    if (created.length) await admin.from("appointments").delete().in("id", created);
    for (const u of [adminU, recepU, pharmU, patU]) await admin.auth.admin.deleteUser(u.userId);
  };

  try {
    // ── Permissions ────────────────────────────────────────────────────────
    await test("reception can update notes; audit row records actor + reason", async () => {
      const id = await newAppt("new");
      created.push(id);
      const reason = "تحديث ملاحظات أثناء الاتصال";
      const { error } = await recepC.rpc("update_appointment_notes" as any, {
        _id: id,
        _notes: "المريض يفضل الفترة الصباحية",
        _reason: reason,
      });
      assert(!error, `rpc failed: ${error?.message}`);
      assert((await notesOf(id)) === "المريض يفضل الفترة الصباحية", "notes not saved");
      const audit = await auditOf(id);
      assert(audit.length === 1, `expected 1 audit row, got ${audit.length}`);
      assert(audit[0].new_notes === "المريض يفضل الفترة الصباحية", "audit new_notes wrong");
      assert(audit[0].reason === reason, `audit reason wrong: ${audit[0].reason}`);
      assert(audit[0].changed_by === recepU.userId, "audit actor wrong");
    });

    await test("admin can clear notes to NULL; audit captures old value", async () => {
      const id = await newAppt("new");
      created.push(id);
      await admin.from("appointments").update({ notes: "قديم" }).eq("id", id);
      const { error } = await adminC.rpc("update_appointment_notes" as any, {
        _id: id,
        _notes: null,
        _reason: "مسح",
      });
      assert(!error, `rpc failed: ${error?.message}`);
      assert((await notesOf(id)) === null, "notes not cleared");
      const audit = await auditOf(id);
      assert(audit[0].old_notes === "قديم" && audit[0].new_notes === null, "audit diff wrong");
    });

    await test("pharmacy cannot mutate notes (RLS blocks silently)", async () => {
      const id = await newAppt("new");
      created.push(id);
      await admin.from("appointments").update({ notes: "ثابت" }).eq("id", id);
      await pharmC.rpc("update_appointment_notes" as any, {
        _id: id,
        _notes: "محاولة تعديل",
        _reason: null,
      });
      assert((await notesOf(id)) === "ثابت", "pharmacy must not be able to change notes");
      assert((await auditOf(id)).length === 0, "no audit row should be written");
    });

    await test("patient (no role) cannot mutate notes", async () => {
      const id = await newAppt("new");
      created.push(id);
      await patC.rpc("update_appointment_notes" as any, {
        _id: id,
        _notes: "لست موظفًا",
        _reason: null,
      });
      assert((await notesOf(id)) == null, "notes must not have been set by patient");
      assert((await auditOf(id)).length === 0, "no audit row expected");
    });

    // ── DB-level reason enforcement (trigger) ──────────────────────────────
    await test("DB trigger: cancelled without reason → check_violation", async () => {
      const id = await newAppt("confirmed");
      created.push(id);
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "cancelled",
        _reason: "",
      });
      assert(!!error, "expected trigger to reject empty reason");
      assert(
        /reason_required_for_cancelled/.test(error!.message) || error!.code === "23514",
        `unexpected error: ${error?.code} ${error?.message}`,
      );
      assert((await notesOf(id)) == null, "state must not change");
    });

    await test("DB trigger: no_show without reason → check_violation", async () => {
      const id = await newAppt("confirmed");
      created.push(id);
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "no_show",
        _reason: null,
      });
      assert(!!error, "expected trigger to reject NULL reason");
      assert(
        /reason_required_for_no_show/.test(error!.message) || error!.code === "23514",
        `unexpected error: ${error?.code} ${error?.message}`,
      );
    });

    await test("DB trigger: cancelled WITH reason succeeds and is audited", async () => {
      const id = await newAppt("confirmed");
      created.push(id);
      const reason = "طلب المريض";
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "cancelled",
        _reason: reason,
      });
      assert(!error, `expected success, got: ${error?.message}`);
      const audit = await auditOf(id);
      assert(audit[0].reason === reason, `audit reason wrong: ${audit[0].reason}`);
      assert(audit[0].new_status === "cancelled", "audit new_status wrong");
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
