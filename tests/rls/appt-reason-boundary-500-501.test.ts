/**
 * Boundary integration test for the 500-char reason cap.
 *
 * For BOTH update_appointment_status and update_appointment_notes:
 *   - reason of length EXACTLY 500 after edge-trim → ACCEPTED,
 *     exactly 1 audit row written, reason stored with length 500.
 *   - reason of length EXACTLY 501 after edge-trim → REJECTED with
 *     code 23514 / hint reason_too_long, NO audit row written,
 *     appointment row unchanged.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-reason-boundary-500-501.test.ts
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
async function newAppt(
  initialStatus: "confirmed" = "confirmed",
  initialNotes: string | null = null,
) {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "ReasonBoundary",
      patient_phone: "0500000000",
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "10:00",
    })
    .select("id")
    .single();
  if (error) throw error;
  const patch: Record<string, unknown> = { status: initialStatus };
  if (initialNotes !== null) patch.notes = initialNotes;
  const { error: uerr } = await admin.from("appointments").update(patch).eq("id", data.id);
  if (uerr) throw uerr;
  await admin.from("appointment_audit").delete().eq("appointment_id", data.id);
  return { id: data.id as string, status: initialStatus, notes: initialNotes };
}
const auditOf = async (id: string) =>
  (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];
const rowOf = async (id: string) =>
  (await admin.from("appointments").select("status, notes").eq("id", id).single()).data;

// Build "core of length N with edge whitespace padding" — length after edge-trim = N.
const paddedCore = (n: number, ch = "ا") => `  \t\n\u00A0${ch.repeat(n)}\u00A0 \r\n`;

const stamp = Date.now();
const created: string[] = [];
let user: { userId: string; email: string; password: string } | null = null;

(async () => {
  console.log("── reason length boundary: 500 accepted, 501 rejected ──");
  user = await createAdmin(`boundary-500-501-${stamp}@test.local`);
  const c = await signInAs(user.email, user.password);

  try {
    const core500 = "ا".repeat(REASON_MAX);
    const core501 = "ا".repeat(REASON_MAX + 1);

    // ── update_appointment_status: 500 ACCEPTED ──
    await test("status=cancelled + reason len 500 (with edge padding) → 1 audit row, reason len 500", async () => {
      const a = await newAppt();
      created.push(a.id);
      const { error } = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "cancelled",
        _reason: paddedCore(REASON_MAX),
      });
      assert(!error, `expected acceptance, got: ${error?.code} ${error?.message}`);
      assert((await rowOf(a.id))?.status === "cancelled", "status must change to cancelled");
      const rows = await auditOf(a.id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      const stored = rows[0].reason as string;
      assert(stored === core500, "stored reason must equal edge-trimmed core");
      assert(
        stored.length === REASON_MAX,
        `stored reason length must be exactly 500, got ${stored.length}`,
      );
    });

    // ── update_appointment_status: 501 REJECTED ──
    await test("status=cancelled + reason len 501 (with edge padding) → rejected, no audit row", async () => {
      const a = await newAppt();
      created.push(a.id);
      const before = await rowOf(a.id);
      const { error } = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "cancelled",
        _reason: paddedCore(REASON_MAX + 1),
      });
      assert(!!error, "expected rejection, got success");
      assert(error!.code === "23514", `expected 23514, got ${error!.code}: ${error!.message}`);
      assert(
        /reason_too_long/i.test(error!.message) || /السبب طويل جدًا/.test(error!.message),
        `expected reason_too_long signal, got: ${error!.message}`,
      );
      const after = await rowOf(a.id);
      assert(after?.status === before?.status, "status must not change");
      assert((await auditOf(a.id)).length === 0, "no audit row must be written");
    });

    // ── update_appointment_notes: 500 ACCEPTED ──
    await test("notes update + reason len 500 (with edge padding) → 1 audit row, reason len 500", async () => {
      const a = await newAppt("confirmed", "قديم");
      created.push(a.id);
      const { error } = await c.rpc("update_appointment_notes" as any, {
        _id: a.id,
        _notes: "جديد",
        _reason: paddedCore(REASON_MAX, "ب"),
      });
      assert(!error, `expected acceptance, got: ${error?.code} ${error?.message}`);
      assert((await rowOf(a.id))?.notes === "جديد", "notes must be updated");
      const rows = await auditOf(a.id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      const stored = rows[0].reason as string;
      assert(stored === "ب".repeat(REASON_MAX), "stored reason must equal edge-trimmed core");
      assert(
        stored.length === REASON_MAX,
        `stored reason length must be exactly 500, got ${stored.length}`,
      );
    });

    // ── update_appointment_notes: 501 REJECTED ──
    await test("notes update + reason len 501 (with edge padding) → rejected, no audit row", async () => {
      const a = await newAppt("confirmed", "قديم");
      created.push(a.id);
      const before = await rowOf(a.id);
      const { error } = await c.rpc("update_appointment_notes" as any, {
        _id: a.id,
        _notes: "جديد",
        _reason: paddedCore(REASON_MAX + 1, "ب"),
      });
      assert(!!error, "expected rejection, got success");
      assert(error!.code === "23514", `expected 23514, got ${error!.code}: ${error!.message}`);
      assert(
        /reason_too_long/i.test(error!.message) || /السبب طويل جدًا/.test(error!.message),
        `expected reason_too_long signal, got: ${error!.message}`,
      );
      const after = await rowOf(a.id);
      assert(after?.notes === before?.notes, "notes must not change");
      assert(after?.status === before?.status, "status must not change");
      assert((await auditOf(a.id)).length === 0, "no audit row must be written");
    });

    // Sanity: length 501 WITHOUT padding is also rejected (edge trim not required).
    await test("status=no_show + plain reason len 501 (no padding) → rejected, no audit row", async () => {
      const a = await newAppt();
      created.push(a.id);
      const { error } = await c.rpc("update_appointment_status" as any, {
        _id: a.id,
        _status: "no_show",
        _reason: core501,
      });
      assert(
        !!error && error.code === "23514",
        `expected 23514, got: ${error?.code} ${error?.message}`,
      );
      assert((await auditOf(a.id)).length === 0, "no audit row must be written");
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
