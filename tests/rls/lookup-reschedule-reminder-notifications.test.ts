/**
 * Verify that reminder notifications are correctly "rescheduled" after
 * a /lookup reschedule flow.
 *
 * Reminders in this app are client-generated ICS VALARM entries produced by
 * buildIcs() from the reminder_24h / reminder_2h booleans stored on the
 * appointment. There is no server-side notification queue, so "re-scheduling
 * a reminder" is equivalent to: after reschedule_appointment_by_ref +
 * update_reminders_by_ref, the ICS regenerated for the updated row must
 *   1) use the NEW DTSTART / DTEND, and
 *   2) include VALARM(-PT24H) iff reminder_24h is true,
 *      include VALARM(-PT2H)  iff reminder_2h  is true.
 *
 * Layer A — pure buildIcs unit tests (fast, no DB).
 * Layer B — end-to-end: reschedule via anon RPC, read row, feed into buildIcs.
 *
 * Run:  bun tests/rls/lookup-reschedule-reminder-notifications.test.ts
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildIcs, type ShareBooking } from "../../src/lib/booking-share";

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

const countAlarms = (ics: string) => (ics.match(/BEGIN:VALARM/g) ?? []).length;
const has24h = (ics: string) => /TRIGGER:-PT24H/.test(ics);
const has2h = (ics: string) => /TRIGGER:-PT2H/.test(ics);

// Riyadh local → the times stored in the DB are treated as Asia/Riyadh (UTC+3)
// by buildIcs(), so DTSTART = (date+time) - 3h expressed in UTC.
function expectedDtstart(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d, h - 3, mi));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `DTSTART:${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}00Z`;
}

const base = (over: Partial<ShareBooking> = {}): ShareBooking => ({
  ref: "abcd1234",
  patient_name: "Test",
  appointment_date: "2099-01-15",
  appointment_time: "10:00",
  ...over,
});

// ── Layer A: buildIcs unit tests ────────────────────────────────────────────
async function layerA() {
  console.log("\n── Layer A: buildIcs VALARM contract ──");

  await test("both reminders true → 2 VALARM (-PT24H and -PT2H)", () => {
    const ics = buildIcs(base({ reminder_24h: true, reminder_2h: true }));
    assert(countAlarms(ics) === 2, `expected 2 alarms, got ${countAlarms(ics)}`);
    assert(has24h(ics) && has2h(ics), "missing one of the triggers");
  });

  await test("both reminders false → NO VALARM", () => {
    const ics = buildIcs(base({ reminder_24h: false, reminder_2h: false }));
    assert(countAlarms(ics) === 0, `expected 0 alarms, got ${countAlarms(ics)}`);
    assert(!has24h(ics) && !has2h(ics), "no triggers should be present");
  });

  await test("only 24h → 1 VALARM at -PT24H", () => {
    const ics = buildIcs(base({ reminder_24h: true, reminder_2h: false }));
    assert(countAlarms(ics) === 1, `expected 1 alarm, got ${countAlarms(ics)}`);
    assert(has24h(ics), "missing -PT24H");
    assert(!has2h(ics), "unexpected -PT2H");
  });

  await test("only 2h → 1 VALARM at -PT2H", () => {
    const ics = buildIcs(base({ reminder_24h: false, reminder_2h: true }));
    assert(countAlarms(ics) === 1, `expected 1 alarm, got ${countAlarms(ics)}`);
    assert(has2h(ics), "missing -PT2H");
    assert(!has24h(ics), "unexpected -PT24H");
  });

  await test("DTSTART reflects the NEW date/time after reschedule (not the original)", () => {
    const original = buildIcs(base({ appointment_date: "2099-01-15", appointment_time: "10:00" }));
    const rescheduled = buildIcs(
      base({ appointment_date: "2099-02-20", appointment_time: "14:30" }),
    );
    assert(original.includes(expectedDtstart("2099-01-15", "10:00")), "original DTSTART wrong");
    assert(
      rescheduled.includes(expectedDtstart("2099-02-20", "14:30")),
      "rescheduled DTSTART wrong",
    );
    assert(
      !rescheduled.includes(expectedDtstart("2099-01-15", "10:00")),
      "rescheduled ICS must NOT contain the original DTSTART",
    );
  });

  await test("UID is stable across reschedule (same ref → calendar clients replace the event)", () => {
    const a = buildIcs(base({ appointment_date: "2099-01-15", appointment_time: "10:00" }));
    const b = buildIcs(base({ appointment_date: "2099-02-20", appointment_time: "14:30" }));
    const uidA = a.match(/UID:[^\r\n]+/)?.[0];
    const uidB = b.match(/UID:[^\r\n]+/)?.[0];
    assert(uidA && uidA === uidB, `UID must be stable: ${uidA} vs ${uidB}`);
  });

  await test("undefined reminder fields default to true (2 VALARM)", () => {
    // Matches the DB default (reminder_* NOT NULL DEFAULT true) and the
    // buildIcs comment: "Default to true when the field isn't provided".
    const ics = buildIcs(base({ reminder_24h: undefined, reminder_2h: undefined }));
    assert(countAlarms(ics) === 2, `expected 2 alarms, got ${countAlarms(ics)}`);
  });

  await test("toggling 24h OFF then ON regenerates VALARM(-PT24H) (cancel → recreate)", () => {
    const off = buildIcs(base({ reminder_24h: false, reminder_2h: true }));
    assert(!has24h(off), "OFF phase must have no -PT24H");
    const on = buildIcs(base({ reminder_24h: true, reminder_2h: true }));
    assert(has24h(on), "ON phase must re-add -PT24H");
  });
}

// ── Layer B: end-to-end DB round-trip ───────────────────────────────────────
async function layerB() {
  const URL = process.env.SUPABASE_URL!;
  const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!URL || !ANON || !SERVICE) {
    console.log("\n(skipping Layer B — missing Supabase env vars)");
    return;
  }
  const admin: SupabaseClient = createClient(URL, SERVICE, {
    auth: { persistSession: false },
  });
  const anon: SupabaseClient = createClient(URL, ANON, {
    auth: { persistSession: false },
  });

  const phone = "0500000000";
  const created: string[] = [];

  async function newAppt(
    opts: {
      reminder_24h?: boolean;
      reminder_2h?: boolean;
    } = {},
  ): Promise<{ id: string; ref: string }> {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        patient_name: "RN-Test",
        patient_phone: phone,
        appointment_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        appointment_time: "10:00",
        status: "new",
        reminder_24h: opts.reminder_24h ?? true,
        reminder_2h: opts.reminder_2h ?? true,
      })
      .select("id")
      .single();
    if (error) throw error;
    const id = data.id as string;
    created.push(id);
    return { id, ref: id.replace(/-/g, "").slice(0, 8) };
  }

  async function readRow(id: string) {
    const { data, error } = await admin
      .from("appointments")
      .select("appointment_date, appointment_time, reminder_24h, reminder_2h")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  const futureParts = (offsetMs: number) => {
    const d = new Date(Date.now() + offsetMs);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    };
  };

  console.log("\n── Layer B: reschedule → ICS end-to-end ──");

  try {
    await test("reschedule keeps both reminders → new ICS has 2 VALARM at new DTSTART", async () => {
      const { id, ref } = await newAppt({ reminder_24h: true, reminder_2h: true });
      const target = futureParts(3 * 86_400_000);
      const { error: e1 } = await anon.rpc(
        "reschedule_appointment_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _new_date: target.date,
          _new_time: target.time,
          _reason: "r",
        } as never,
      );
      assert(!e1, `reschedule err: ${e1?.message}`);
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: true,
          _reminder_2h: true,
        } as never,
      );
      const row = await readRow(id);
      const ics = buildIcs({
        ref,
        patient_name: "RN-Test",
        appointment_date: row.appointment_date,
        appointment_time: String(row.appointment_time).slice(0, 5),
        reminder_24h: row.reminder_24h,
        reminder_2h: row.reminder_2h,
      });
      assert(
        ics.includes(
          expectedDtstart(row.appointment_date, String(row.appointment_time).slice(0, 5)),
        ),
        "ICS must reflect the new DTSTART",
      );
      assert(countAlarms(ics) === 2, `expected 2 alarms, got ${countAlarms(ics)}`);
    });

    await test("disabling both reminders cancels notifications (ICS has no VALARM)", async () => {
      const { id, ref } = await newAppt({ reminder_24h: true, reminder_2h: true });
      const target = futureParts(4 * 86_400_000);
      await anon.rpc(
        "reschedule_appointment_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _new_date: target.date,
          _new_time: target.time,
          _reason: "r",
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
      const row = await readRow(id);
      const ics = buildIcs({
        ref,
        patient_name: "RN-Test",
        appointment_date: row.appointment_date,
        appointment_time: String(row.appointment_time).slice(0, 5),
        reminder_24h: row.reminder_24h,
        reminder_2h: row.reminder_2h,
      });
      assert(countAlarms(ics) === 0, `expected 0 alarms, got ${countAlarms(ics)}`);
    });

    await test("mixed selection (24h on, 2h off) → ICS has only -PT24H", async () => {
      const { id, ref } = await newAppt({ reminder_24h: true, reminder_2h: true });
      const target = futureParts(5 * 86_400_000);
      await anon.rpc(
        "reschedule_appointment_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _new_date: target.date,
          _new_time: target.time,
          _reason: "r",
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
      const row = await readRow(id);
      const ics = buildIcs({
        ref,
        patient_name: "RN-Test",
        appointment_date: row.appointment_date,
        appointment_time: String(row.appointment_time).slice(0, 5),
        reminder_24h: row.reminder_24h,
        reminder_2h: row.reminder_2h,
      });
      assert(countAlarms(ics) === 1, `expected 1 alarm, got ${countAlarms(ics)}`);
      assert(has24h(ics) && !has2h(ics), "only -PT24H must remain");
    });

    await test("previously OFF reminders can be turned back ON (notifications recreated)", async () => {
      const { id, ref } = await newAppt({ reminder_24h: false, reminder_2h: false });
      const target = futureParts(6 * 86_400_000);
      await anon.rpc(
        "reschedule_appointment_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _new_date: target.date,
          _new_time: target.time,
          _reason: "r",
        } as never,
      );
      await anon.rpc(
        "update_reminders_by_ref" as never,
        {
          _ref: ref,
          _phone: phone,
          _reminder_24h: true,
          _reminder_2h: true,
        } as never,
      );
      const row = await readRow(id);
      const ics = buildIcs({
        ref,
        patient_name: "RN-Test",
        appointment_date: row.appointment_date,
        appointment_time: String(row.appointment_time).slice(0, 5),
        reminder_24h: row.reminder_24h,
        reminder_2h: row.reminder_2h,
      });
      assert(countAlarms(ics) === 2, `expected 2 alarms after re-enable, got ${countAlarms(ics)}`);
      assert(has24h(ics) && has2h(ics), "both triggers must reappear");
    });
  } finally {
    if (created.length) {
      await admin.from("appointments").delete().in("id", created);
    }
  }
}

async function main() {
  await layerA();
  await layerB();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
