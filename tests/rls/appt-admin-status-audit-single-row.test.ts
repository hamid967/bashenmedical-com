/**
 * Integration test: admin updating appointment status via
 * update_appointment_status writes EXACTLY ONE appointment_audit row with:
 *   - new_status = target status
 *   - old_status = previous status
 *   - reason     = input trimmed on edges, internal whitespace preserved,
 *                  length ≤ 500 chars.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-admin-status-audit-single-row.test.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SVC) {
  console.log("(skipping — missing Supabase env vars)");
  process.exit(0);
}

const REASON_MAX = 500;
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
async function newAppt(initialStatus: "confirmed" | "new" = "confirmed") {
  // Insert (force_appointment_defaults sanitizes status to 'new' for non-staff),
  // then set the desired status via service-role UPDATE, then wipe audit rows
  // so the RPC under test is measured in isolation.
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "AdminAuditSingle",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
    })
    .select("id")
    .single();
  if (error) throw error;
  if (initialStatus !== "new") {
    const { error: uerr } = await admin
      .from("appointments")
      .update({ status: initialStatus })
      .eq("id", data.id);
    if (uerr) throw uerr;
  }
  await admin.from("appointment_audit").delete().eq("appointment_id", data.id);
  return { id: data.id as string, status: initialStatus };
}
const auditOf = async (id: string) =>
  (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];
const statusOf = async (id: string) =>
  (await admin.from("appointments").select("status").eq("id", id).single()).data?.status;

const stamp = Date.now();
const created: string[] = [];
let user: { userId: string; email: string; password: string } | null = null;

(async () => {
  console.log("── admin update_appointment_status → exactly 1 audit row with trimmed reason ──");
  user = await createAdmin(`admin-audit-single-${stamp}@test.local`);
  const c = await signInAs(user.email, user.password);

  try {
    const CORE = "طلب المريض\tإلغاء بسبب  السفر\nمهم"; // internal ws must survive
    const cases: Array<{
      label: string;
      from: "confirmed" | "new";
      to: "cancelled" | "no_show" | "completed";
      raw: string;
      expected: string;
    }> = [
      {
        label: "cancelled + plain reason",
        from: "confirmed",
        to: "cancelled",
        raw: CORE,
        expected: CORE,
      },
      {
        label: "no_show + padded reason (edges trimmed)",
        from: "confirmed",
        to: "no_show",
        raw: `  \t\n\u00A0${CORE}\u00A0 \r\n`,
        expected: CORE,
      },
      {
        label: "completed + optional reason recorded",
        from: "confirmed",
        to: "completed",
        raw: "  تم الحضور والفحص  ",
        expected: "تم الحضور والفحص",
      },
      {
        label: "cancelled + 500-char core with padding",
        from: "confirmed",
        to: "cancelled",
        raw: `\n\t \u00A0${"ا".repeat(REASON_MAX)}\u00A0 \r\n`,
        expected: "ا".repeat(REASON_MAX),
      },
    ];

    for (const { label, from, to, raw, expected } of cases) {
      await test(label, async () => {
        const a = await newAppt(from);
        created.push(a.id);

        const { error } = await c.rpc("update_appointment_status" as any, {
          _id: a.id,
          _status: to,
          _reason: raw,
        });
        assert(!error, `rpc failed: ${error?.code} ${error?.message}`);

        // Status changed
        assert((await statusOf(a.id)) === to, `status not updated to ${to}`);

        // Exactly ONE audit row
        const rows = await auditOf(a.id);
        assert(rows.length === 1, `expected exactly 1 audit row, got ${rows.length}`);
        const r = rows[0];

        // Status transition recorded
        assert(r.old_status === from, `old_status mismatch: ${r.old_status}`);
        assert(r.new_status === to, `new_status mismatch: ${r.new_status}`);

        // notes untouched → both null in audit
        assert(
          r.old_notes === null && r.new_notes === null,
          `notes should not be recorded (got old=${r.old_notes} new=${r.new_notes})`,
        );

        // Reason: trimmed on edges, internal ws preserved, ≤ 500
        assert(
          r.reason === expected,
          `reason mismatch\n      expected(${expected.length})=${JSON.stringify(expected)}\n      got     (${r.reason?.length})=${JSON.stringify(r.reason)}`,
        );
        assert((r.reason as string).length <= REASON_MAX, `reason > 500 chars`);
        assert(
          !/^[\s\u00A0]|[\s\u00A0]$/.test(r.reason as string),
          `reason edges must not contain whitespace: ${JSON.stringify(r.reason)}`,
        );

        // changed_by is the admin caller
        assert(r.changed_by === user!.userId, `changed_by mismatch: ${r.changed_by}`);
      });
    }
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
