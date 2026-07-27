/**
 * Integration tests: reason trimming + rejection of empty reasons for
 * transitions to `cancelled` / `no_show`.
 *
 * Guarantees exercised end-to-end:
 *   1. A reason made only of whitespace ("   ", "\n\t ") is treated as
 *      empty by the app layer (Zod .trim()) AND by the DB trigger.
 *   2. A valid reason with surrounding whitespace is stored trimmed
 *      (the server function forwards data.reason after Zod parse), and
 *      the trimmed value appears verbatim in appointment_audit.reason.
 *   3. An empty string reason is rejected by the DB trigger with
 *      error code 23514 / "reason_required_for_<status>".
 *
 * Run:  bun tests/rls/appt-reason-trim.test.ts
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

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

// Mirror of the Zod validator used inside updateAppointmentStatus so we can
// prove the app-layer normalization matches what the DB trigger enforces.
const reasonSchema = z.string().trim().max(500).optional();

async function run() {
  console.log("── reason trimming (app-layer parity) ──");

  await test("app: '  اتصل المريض  ' → trimmed to 'اتصل المريض'", () => {
    const out = reasonSchema.parse("  اتصل المريض  ");
    assert(out === "اتصل المريض", `got ${JSON.stringify(out)}`);
  });
  await test("app: whitespace-only reason parses to empty string ''", () => {
    // Zod's .trim() collapses whitespace to '' (still a valid optional string).
    const out = reasonSchema.parse("   \n\t  ");
    assert(out === "", `got ${JSON.stringify(out)}`);
  });
  await test("app: undefined reason stays undefined", () => {
    const out = reasonSchema.parse(undefined);
    assert(out === undefined, `got ${JSON.stringify(out)}`);
  });

  const URL = process.env.SUPABASE_URL!;
  const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!URL || !ANON || !SERVICE) {
    console.log("\n(skipping DB layer — missing Supabase env vars)");
    console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  async function signInAs(email: string, password: string): Promise<SupabaseClient> {
    const c = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    assert(data.session, "no session");
    return c;
  }
  async function createUser(email: string, role: string) {
    const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await admin.from("user_roles").insert({ user_id: data.user.id, role });
    return { userId: data.user.id, email, password };
  }
  async function newAppt(status: "confirmed" | "new" = "confirmed") {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "REASON-Test",
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
  const auditOf = async (id: string) =>
    (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];
  const statusOf = async (id: string) =>
    (await admin.from("appointments").select("status").eq("id", id).single()).data?.status;

  const stamp = Date.now();
  const adminU = await createUser(`rsn-admin-${stamp}@test.local`, "admin");
  const adminC = await signInAs(adminU.email, adminU.password);

  const created: string[] = [];
  const cleanup = async () => {
    if (created.length) await admin.from("appointments").delete().in("id", created);
    await admin.auth.admin.deleteUser(adminU.userId);
  };

  try {
    console.log("\n── reason trimming (DB layer) ──");

    await test("cancelled: trimmed reason stored verbatim in audit.reason", async () => {
      const id = await newAppt("confirmed");
      created.push(id);
      const raw = "  اتصل المريض لإلغاء الحجز  ";
      const trimmed = reasonSchema.parse(raw)!; // what the server function forwards
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "cancelled",
        _reason: trimmed,
      });
      assert(!error, `rpc failed: ${error?.message}`);
      assert((await statusOf(id)) === "cancelled", "status not updated");
      const rows = await auditOf(id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      assert(
        rows[0].reason === "اتصل المريض لإلغاء الحجز",
        `reason not stored trimmed, got: ${JSON.stringify(rows[0].reason)}`,
      );
    });

    await test("no_show: trimmed reason stored verbatim in audit.reason", async () => {
      const id = await newAppt("confirmed");
      created.push(id);
      const raw = "\n المريض لم يحضر بعد الاتصال \t";
      const trimmed = reasonSchema.parse(raw)!;
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "no_show",
        _reason: trimmed,
      });
      assert(!error, `rpc failed: ${error?.message}`);
      const rows = await auditOf(id);
      assert(
        rows[0].reason === "المريض لم يحضر بعد الاتصال",
        `reason not stored trimmed, got: ${JSON.stringify(rows[0].reason)}`,
      );
    });

    await test("cancelled: empty-string reason → rejected by trigger", async () => {
      const id = await newAppt("confirmed");
      created.push(id);
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "cancelled",
        _reason: "",
      });
      assert(!!error, "expected trigger to reject empty reason");
      assert(
        error!.code === "23514" || /reason_required_for_cancelled/.test(error!.message),
        `unexpected error: ${error?.code} ${error?.message}`,
      );
      assert((await statusOf(id)) === "confirmed", "status must remain confirmed on rejection");
      assert((await auditOf(id)).length === 0, "no audit row on rejection");
    });

    await test("no_show: whitespace-only reason → post-trim empty → rejected", async () => {
      const id = await newAppt("confirmed");
      created.push(id);
      const rawTrimmed = reasonSchema.parse("   \n\t   "); // === ""
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "no_show",
        _reason: rawTrimmed,
      });
      assert(!!error, "expected trigger to reject whitespace-only reason");
      assert(
        error!.code === "23514" || /reason_required_for_no_show/.test(error!.message),
        `unexpected error: ${error?.code} ${error?.message}`,
      );
      assert((await auditOf(id)).length === 0, "no audit row on rejection");
    });

    await test("cancelled: NULL reason → rejected by trigger", async () => {
      const id = await newAppt("confirmed");
      created.push(id);
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "cancelled",
        _reason: null,
      });
      assert(!!error, "expected trigger to reject NULL reason");
      assert(
        error!.code === "23514" || /reason_required_for_cancelled/.test(error!.message),
        `unexpected error: ${error?.code} ${error?.message}`,
      );
    });

    await test("confirmed (non-cancel/no_show): reason optional, empty accepted", async () => {
      const id = await newAppt("new");
      created.push(id);
      const { error } = await adminC.rpc("update_appointment_status" as any, {
        _id: id,
        _status: "confirmed",
        _reason: "",
      });
      assert(!error, `rpc failed unexpectedly: ${error?.message}`);
      const rows = await auditOf(id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      // The trigger stores NULLIF(reason,''), so an empty reason is stored as NULL.
      assert(
        rows[0].reason === null,
        `expected NULL reason, got ${JSON.stringify(rows[0].reason)}`,
      );
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
