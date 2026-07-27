/**
 * Extended integration tests for appointment_audit behavior.
 *
 * Covers cases not exercised by the existing audit tests:
 *   1. Combined status + notes change in ONE UPDATE →
 *      exactly ONE audit row with BOTH transitions recorded.
 *   2. Reason omitted (null / undefined) on a required-status change →
 *      REJECTED (nothing written).
 *   3. Reason omitted on a NON-required status change (e.g. confirmed→completed
 *      via direct UPDATE with notes change) → audit row stored with reason=null
 *      (NOT empty string).
 *   4. No-op update (same status, same notes) → NO audit row.
 *   5. Multiple sequential status transitions → multiple audit rows in
 *      chronological order, each with its own old→new pair.
 *   6. Only notes change via direct UPDATE (no RPC) → audit row has
 *      status columns null and notes columns populated.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-audit-extended.test.ts
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
async function createAdmin(email: string) {
  const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  await admin.from("user_roles").insert({ user_id: data.user.id, role: "admin" });
  return { userId: data.user.id, email, password };
}
async function newAppt(
  initialStatus: "confirmed" | "new" = "confirmed",
  initialNotes: string | null = null,
) {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "AuditExtended",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
    })
    .select("id")
    .single();
  if (error) throw error;
  const patch: Record<string, unknown> = {};
  if (initialStatus !== "new") patch.status = initialStatus;
  if (initialNotes !== null) patch.notes = initialNotes;
  if (Object.keys(patch).length) {
    const { error: uerr } = await admin.from("appointments").update(patch).eq("id", data.id);
    if (uerr) throw uerr;
  }
  await admin.from("appointment_audit").delete().eq("appointment_id", data.id);
  return { id: data.id as string, status: initialStatus, notes: initialNotes };
}
const auditOf = async (id: string) =>
  (
    await admin
      .from("appointment_audit")
      .select("*")
      .eq("appointment_id", id)
      .order("changed_at", { ascending: true })
  ).data ?? [];
const rowOf = async (id: string) =>
  (await admin.from("appointments").select("status, notes").eq("id", id).single()).data;

const stamp = Date.now();
const created: string[] = [];
let user: { userId: string; email: string; password: string } | null = null;

(async () => {
  console.log("── appointment_audit — extended admin scenarios ──");
  user = await createAdmin(`audit-extended-${stamp}@test.local`);
  const c = await signInAs(user.email, user.password);

  try {
    // ── 1. Combined status + notes in one UPDATE → 1 row, both transitions ──
    await test("combined status+notes in one UPDATE → 1 audit row with BOTH transitions", async () => {
      const a = await newAppt("confirmed", "قديم");
      created.push(a.id);
      const { error } = await c
        .from("appointments")
        .update({ status: "completed", notes: "  جديد  " })
        .eq("id", a.id);
      assert(!error, `update failed: ${error?.message}`);

      const rows = await auditOf(a.id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      const r = rows[0];
      assert(
        r.old_status === "confirmed" && r.new_status === "completed",
        `status transition mismatch: ${r.old_status}→${r.new_status}`,
      );
      // notes are stored verbatim on the row (no client-side trim on direct UPDATE),
      // but the audit column mirrors the actual old/new values on the row.
      assert(r.old_notes === "قديم", `old_notes mismatch: ${JSON.stringify(r.old_notes)}`);
      assert(
        r.new_notes === "  جديد  " || r.new_notes === "جديد",
        `new_notes should match final row value, got ${JSON.stringify(r.new_notes)}`,
      );
      const row = await rowOf(a.id);
      assert(
        row?.status === "completed" && row?.notes === r.new_notes,
        "row must reflect the same final state as the audit row",
      );
    });

    // ── 2. Required-status change with NULL reason → REJECTED ──
    for (const status of ["cancelled", "no_show"] as const) {
      await test(`status=${status} with reason=null → rejected, no audit row`, async () => {
        const a = await newAppt("confirmed");
        created.push(a.id);
        const { error } = await c.rpc("update_appointment_status" as any, {
          _id: a.id,
          _status: status,
          _reason: null,
        });
        assert(!!error, "expected rejection when reason is null");
        assert(error!.code === "23514", `expected 23514, got ${error!.code}: ${error!.message}`);
        assert(
          /reason_required_for_/i.test(error!.message) || /السبب مطلوب/.test(error!.message),
          `expected reason_required signal, got: ${error!.message}`,
        );
        assert((await auditOf(a.id)).length === 0, "no audit row on rejection");
        assert((await rowOf(a.id))?.status === "confirmed", "status must not change");
      });
    }

    // ── 3. Non-required transition with reason=null → audit row has reason=null ──
    await test("non-required status (confirmed→completed) via RPC with reason=null → audit reason IS null", async () => {
      const a = await newAppt("confirmed");
      created.push(a.id);
      const { error } = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "completed",
        _reason: null,
      });
      assert(!error, `rpc failed: ${error?.code} ${error?.message}`);
      const rows = await auditOf(a.id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      assert(
        rows[0].reason === null,
        `reason must be null (not empty string), got ${JSON.stringify(rows[0].reason)}`,
      );
      assert(
        rows[0].old_status === "confirmed" && rows[0].new_status === "completed",
        "status transition must be recorded",
      );
    });

    // ── 4. No-op update (same status, same notes) → NO audit row ──
    await test("no-op UPDATE (same status, same notes) → 0 audit rows", async () => {
      const a = await newAppt("confirmed", "ملاحظة");
      created.push(a.id);
      const { error } = await c
        .from("appointments")
        .update({ status: "confirmed", notes: "ملاحظة" })
        .eq("id", a.id);
      assert(!error, `update failed: ${error?.message}`);
      const rows = await auditOf(a.id);
      assert(rows.length === 0, `expected 0 audit rows for no-op, got ${rows.length}`);
    });

    // ── 5. Sequential transitions → multiple audit rows in chronological order ──
    await test("sequential transitions → N audit rows in chronological order", async () => {
      const a = await newAppt("new");
      created.push(a.id);
      const steps = [
        { to: "confirmed" as const, reason: null },
        { to: "completed" as const, reason: null },
      ];
      for (const s of steps) {
        const { error } = await c.rpc("update_appointment_status" as any, {
          _id: a.id,
          _status: s.to,
          _reason: s.reason,
        });
        assert(!error, `rpc failed at step ${s.to}: ${error?.code} ${error?.message}`);
      }
      // Extra step needing a reason
      const { error: e3 } = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "cancelled",
        _reason: "قرار المريض",
      });
      assert(!e3, `cancelled rpc failed: ${e3?.code} ${e3?.message}`);

      const rows = await auditOf(a.id);
      assert(rows.length === 3, `expected 3 audit rows, got ${rows.length}`);
      const expected = [
        ["new", "confirmed", null],
        ["confirmed", "completed", null],
        ["completed", "cancelled", "قرار المريض"],
      ] as const;
      rows.forEach((r, i) => {
        const [oldS, newS, reason] = expected[i];
        assert(
          r.old_status === oldS && r.new_status === newS,
          `row ${i} transition mismatch: ${r.old_status}→${r.new_status}, expected ${oldS}→${newS}`,
        );
        assert(
          r.reason === reason,
          `row ${i} reason mismatch: got ${JSON.stringify(r.reason)}, expected ${JSON.stringify(reason)}`,
        );
      });
      // chronological order
      for (let i = 1; i < rows.length; i++) {
        assert(
          new Date(rows[i].changed_at as string).getTime() >=
            new Date(rows[i - 1].changed_at as string).getTime(),
          `audit rows must be in chronological order`,
        );
      }
    });

    // ── 6. Notes-only direct UPDATE (no RPC) → status cols null in audit ──
    await test("notes-only direct UPDATE → audit row has status cols null and notes cols set", async () => {
      const a = await newAppt("confirmed", "قبل");
      created.push(a.id);
      const { error } = await c.from("appointments").update({ notes: "بعد" }).eq("id", a.id);
      assert(!error, `update failed: ${error?.message}`);
      const rows = await auditOf(a.id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      const r = rows[0];
      assert(
        r.old_status === null && r.new_status === null,
        `status cols must be null when only notes change (got ${r.old_status}/${r.new_status})`,
      );
      assert(
        r.old_notes === "قبل" && r.new_notes === "بعد",
        `notes transition mismatch: ${r.old_notes}→${r.new_notes}`,
      );
    });
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
