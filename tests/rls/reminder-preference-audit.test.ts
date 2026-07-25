/**
 * Integration tests: reminder_preference_audit (per-kind rows)
 *
 * Each row now identifies exactly one reminder kind ("reminder_24h" or
 * "reminder_2h"). A single UPDATE that flips both flags produces TWO rows.
 *
 * Run:  bun tests/rls/reminder-preference-audit.test.ts
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
  const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const anon: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false } });

  const created: string[] = [];
  const phone = "0500000001";

  async function newAppt(reminder_24h = true, reminder_2h = true) {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "Audit-Test",
        patient_phone: phone,
        appointment_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        appointment_time: "09:00",
        status: "new",
        reminder_24h,
        reminder_2h,
      })
      .select("id")
      .single();
    if (error) throw error;
    const id = data.id as string;
    created.push(id);
    return { id, ref: id.replace(/-/g, "").slice(0, 8) };
  }

  type AuditRow = {
    id: string;
    appointment_id: string;
    reminder_kind: "reminder_24h" | "reminder_2h";
    changed_by: string | null;
    source: string;
    old_value: boolean | null;
    new_value: boolean | null;
    reason: string | null;
    changed_at: string;
  };

  async function auditRows(appointment_id: string): Promise<AuditRow[]> {
    const { data, error } = await admin
      .from("reminder_preference_audit")
      .select("*")
      .eq("appointment_id", appointment_id)
      .order("changed_at", { ascending: true });
    if (error) throw error;
    return data as AuditRow[];
  }

  console.log("\n── reminder_preference_audit (per-kind) ──");

  try {
    await test("single-flag change → exactly one row for that kind", async () => {
      const { id, ref } = await newAppt(true, true);
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: true,
        } as never,
      );
      const rows = await auditRows(id);
      assert(rows.length === 1, `expected 1 row, got ${rows.length}`);
      assert(rows[0].reminder_kind === "reminder_24h", `kind=${rows[0].reminder_kind}`);
      assert(rows[0].old_value === true && rows[0].new_value === false, "old/new wrong");
      assert(rows[0].source === "self_service", `source=${rows[0].source}`);
      assert(rows[0].changed_by === null, "changed_by should be null for anon");
    });

    await test("both flags change in one UPDATE → two rows, one per kind", async () => {
      const { id } = await newAppt(true, true);
      const { error } = await admin
        .from("appointments")
        .update({ reminder_24h: false, reminder_2h: false })
        .eq("id", id);
      assert(!error, `update err: ${error?.message}`);
      const rows = await auditRows(id);
      assert(rows.length === 2, `expected 2 rows, got ${rows.length}`);
      const kinds = rows.map((r) => r.reminder_kind).sort();
      assert(
        kinds[0] === "reminder_24h" && kinds[1] === "reminder_2h",
        `expected both kinds, got ${JSON.stringify(kinds)}`,
      );
      for (const r of rows) {
        assert(r.old_value === true && r.new_value === false, `${r.reminder_kind} old/new wrong`);
      }
    });

    await test("reschedule (no flag change) → zero audit rows", async () => {
      const { id, ref } = await newAppt(true, false);
      const newDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      await anon.rpc(
        "reschedule_appointment_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _new_date: newDate,
          _new_time: "11:00:00",
          _reason: "r",
        } as never,
      );
      const rows = await auditRows(id);
      assert(rows.length === 0, `expected 0 rows, got ${rows.length}`);
    });

    await test("no-op update (same values) → zero rows", async () => {
      const { id, ref } = await newAppt(true, false);
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: true,
          _reminder_2h: false,
        } as never,
      );
      const rows = await auditRows(id);
      assert(rows.length === 0, `expected 0 rows for no-op, got ${rows.length}`);
    });

    await test("null-COALESCE update → zero rows (no actual change)", async () => {
      const { id, ref } = await newAppt(true, true);
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: null,
          _reminder_2h: null,
        } as never,
      );
      const rows = await auditRows(id);
      assert(rows.length === 0, `expected 0 rows, got ${rows.length}`);
    });

    await test("multiple sequential single-flag changes are logged in order", async () => {
      const { id, ref } = await newAppt(true, true);
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: true,
        } as never,
      );
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: false,
        } as never,
      );
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: true,
          _reminder_2h: false,
        } as never,
      );
      const rows = await auditRows(id);
      // Row 1: 24h true→false. Row 2: 2h true→false. Row 3: 24h false→true.
      assert(rows.length === 3, `expected 3 rows, got ${rows.length}`);
      assert(
        rows[0].reminder_kind === "reminder_24h" && rows[0].new_value === false,
        "row 1 wrong",
      );
      assert(rows[1].reminder_kind === "reminder_2h" && rows[1].new_value === false, "row 2 wrong");
      assert(rows[2].reminder_kind === "reminder_24h" && rows[2].new_value === true, "row 3 wrong");
    });

    await test("filter by reminder_kind works (linkable as ReminderId)", async () => {
      const { id } = await newAppt(true, true);
      await admin
        .from("appointments")
        .update({ reminder_24h: false, reminder_2h: false })
        .eq("id", id);
      const { data: onlyTwentyFour, error: e1 } = await admin
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", id)
        .eq("reminder_kind", "reminder_24h");
      assert(!e1, `err: ${e1?.message}`);
      assert(onlyTwentyFour!.length === 1, `expected 1 24h row, got ${onlyTwentyFour!.length}`);
      const { data: onlyTwo } = await admin
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", id)
        .eq("reminder_kind", "reminder_2h");
      assert(onlyTwo!.length === 1, `expected 1 2h row, got ${onlyTwo!.length}`);
    });

    await test("CHECK constraint rejects unknown reminder_kind on direct insert", async () => {
      const { id } = await newAppt(true, true);
      const { error } = await admin.from("reminder_preference_audit").insert({
        appointment_id: id,
        reminder_kind: "reminder_5min",
        source: "system",
        old_value: false,
        new_value: true,
      });
      assert(error !== null, "invalid kind should be rejected");
    });

    await test("CHECK constraint rejects no-op row (old_value = new_value)", async () => {
      const { id } = await newAppt(true, true);
      const { error } = await admin.from("reminder_preference_audit").insert({
        appointment_id: id,
        reminder_kind: "reminder_24h",
        source: "system",
        old_value: true,
        new_value: true,
      });
      assert(error !== null, "no-op row should be rejected by CHECK");
    });

    await test("anon cannot SELECT audit rows", async () => {
      const { id } = await newAppt(true, true);
      await admin.from("appointments").update({ reminder_24h: false }).eq("id", id);
      const { data } = await anon
        .from("reminder_preference_audit")
        .select("*")
        .eq("appointment_id", id);
      assert(!data || data.length === 0, `anon must see 0 rows, got ${data?.length}`);
    });

    await test("anon cannot INSERT audit rows directly", async () => {
      const { id } = await newAppt(true, true);
      const { error } = await anon.from("reminder_preference_audit").insert({
        appointment_id: id,
        reminder_kind: "reminder_24h",
        source: "self_service",
        old_value: true,
        new_value: false,
      });
      assert(error !== null, "insert must be blocked");
    });

    await test("cascade delete: removing appointment removes its audit rows", async () => {
      const { id, ref } = await newAppt(true, true);
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: false,
        } as never,
      );
      assert((await auditRows(id)).length === 2, "should have 2 rows before delete");
      await admin.from("appointments").delete().eq("id", id);
      const idx = created.indexOf(id);
      if (idx !== -1) created.splice(idx, 1);
      const { data } = await admin
        .from("reminder_preference_audit")
        .select("id")
        .eq("appointment_id", id);
      assert(!data || data.length === 0, `cascade failed, ${data?.length} rows remain`);
    });

    await test("changed_at is recent and monotonic", async () => {
      const { id, ref } = await newAppt(true, true);
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: true,
        } as never,
      );
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: false,
          _reminder_2h: false,
        } as never,
      );
      const rows = await auditRows(id);
      assert(rows.length === 2, `expected 2 rows`);
      const t0 = new Date(rows[0].changed_at).getTime();
      const t1 = new Date(rows[1].changed_at).getTime();
      assert(t1 >= t0, `monotonic broken: ${t0} → ${t1}`);
      assert(Date.now() - t1 < 60_000, `not recent: ${Date.now() - t1}ms ago`);
    });
  } finally {
    if (created.length) {
      await admin.from("appointments").delete().in("id", created);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
