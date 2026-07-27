/**
 * Integration test: whitespace normalization inside `notes` and `reason`
 * before they land in appointment_audit.
 *
 * Rule under test (mirror of src/lib/reason.ts + SQL normalize_reason):
 *   - Strip ALL leading/trailing whitespace, including:
 *       ASCII space, \t, \n, \r, CRLF, NBSP (U+00A0).
 *   - Preserve interior whitespace VERBATIM, byte-for-byte:
 *       double spaces, tabs, LF/CRLF line breaks, NBSP.
 *   - Zero-width space (U+200B) is NOT whitespace → survives even on edges.
 *   - Final length ≤ 500 chars (checked separately in boundary test).
 *
 * Applies to BOTH:
 *   - `_reason` argument on update_appointment_status / update_appointment_notes
 *   - `_notes` argument on update_appointment_notes
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run:  bun tests/rls/appt-audit-whitespace-normalization.test.ts
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
  initialStatus: "confirmed" = "confirmed",
  initialNotes: string | null = null,
) {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "WsNorm",
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
  return { id: data.id as string };
}
const auditOf = async (id: string) =>
  (await admin.from("appointment_audit").select("*").eq("appointment_id", id)).data ?? [];
const notesOf = async (id: string) =>
  (await admin.from("appointments").select("notes").eq("id", id).single()).data?.notes;

// Assertions that the string was trimmed on the edges but interior kept.
function assertNormalized(stored: string, expectedInterior: string) {
  assert(
    stored === expectedInterior,
    `normalized value mismatch\n      expected(${expectedInterior.length})=${JSON.stringify(expectedInterior)}\n      got     (${stored?.length})=${JSON.stringify(stored)}`,
  );
  assert(!/^[\s\u00A0]/.test(stored), `leading whitespace not trimmed: ${JSON.stringify(stored)}`);
  assert(!/[\s\u00A0]$/.test(stored), `trailing whitespace not trimmed: ${JSON.stringify(stored)}`);
}

const stamp = Date.now();
const created: string[] = [];
let user: { userId: string; email: string; password: string } | null = null;

// Interior payloads — designed to expose any accidental collapsing of whitespace.
const INTERIOR = {
  doubleSpaces: "كلمة  ثانية   ثالثة", // 2 & 3 ASCII spaces
  tabs: "قسم\tقسم\t\tقسم", // single + double tab
  lf: "سطر أول\nسطر ثانٍ\nسطر ثالث", // LF only
  crlf: "سطر\r\nسطر آخر\r\nنهاية", // CRLF
  mixedNl: "أ\nب\r\nج\nد", // mixed LF + CRLF
  nbsp: "أ\u00A0ب\u00A0\u00A0ج", // NBSP inside
  everything: "بداية  \tمنتصف\nثم\u00A0نهاية داخلية\r\nسطر",
  zwsp: "\u200Bكلمة\u200Bأخرى\u200B", // ZWSP survives everywhere
};

// Wraps interior with mixed edge whitespace that MUST be stripped.
const padded = (s: string) => `  \t \u00A0\n\r\n${s}\u00A0 \t\r\n  `;

(async () => {
  console.log("── whitespace normalization inside notes / reason before audit ──");
  user = await createAdmin(`ws-norm-${stamp}@test.local`);
  const c = await signInAs(user.email, user.password);

  try {
    // ── update_appointment_status: `reason` normalization ──────────────────
    for (const [label, interior] of Object.entries(INTERIOR)) {
      await test(`status=cancelled reason (${label}) → interior preserved, edges trimmed`, async () => {
        const a = await newAppt();
        created.push(a.id);
        const { error } = await c.rpc("update_appointment_status" as any, {
          _id: a.id,
          _status: "cancelled",
          _reason: padded(interior),
        });
        assert(!error, `rpc failed: ${error?.code} ${error?.message}`);
        const rows = await auditOf(a.id);
        assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
        assertNormalized(rows[0].reason as string, interior);
        // Notes untouched.
        assert(
          rows[0].old_notes === null && rows[0].new_notes === null,
          "notes cols must remain null",
        );
      });
    }

    // ── update_appointment_notes: BOTH `_notes` AND `_reason` normalization ──
    for (const [label, interior] of Object.entries(INTERIOR)) {
      await test(`notes update (${label}) → new_notes AND reason both edge-trimmed with interior preserved`, async () => {
        const a = await newAppt("confirmed");
        created.push(a.id);
        const paddedNotes = padded(interior);
        const paddedReason = padded(interior);
        const { error } = await c.rpc("update_appointment_notes" as any, {
          _id: a.id,
          _notes: paddedNotes,
          _reason: paddedReason,
        });
        assert(!error, `rpc failed: ${error?.code} ${error?.message}`);
        // The row itself carries the normalized notes value.
        assertNormalized((await notesOf(a.id)) as string, interior);
        const rows = await auditOf(a.id);
        assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
        assertNormalized(rows[0].new_notes as string, interior);
        assertNormalized(rows[0].reason as string, interior);
        // Status untouched.
        assert(
          rows[0].old_status === null && rows[0].new_status === null,
          "status cols must remain null",
        );
      });
    }

    // ── Direct UPDATE with interior whitespace in notes → stored verbatim ──
    await test("direct UPDATE notes with interior whitespace → row & audit keep it verbatim (no edge trim by trigger)", async () => {
      const a = await newAppt("confirmed", "قديم");
      created.push(a.id);
      // The trigger on direct UPDATE does NOT normalize notes — it only
      // records old→new. So the row stores exactly what we send, and the
      // audit row mirrors that exact value.
      const raw = "  " + INTERIOR.everything + "  ";
      const { error } = await c.from("appointments").update({ notes: raw }).eq("id", a.id);
      assert(!error, `update failed: ${error?.message}`);
      const stored = await notesOf(a.id);
      assert(stored === raw, `direct UPDATE must NOT trim (got ${JSON.stringify(stored)})`);
      const rows = await auditOf(a.id);
      assert(rows.length === 1, `expected 1 audit row, got ${rows.length}`);
      assert(
        rows[0].new_notes === raw,
        "audit.new_notes must mirror row value verbatim on direct UPDATE",
      );
      assert(
        rows[0].old_notes === "قديم",
        `audit.old_notes mismatch: ${JSON.stringify(rows[0].old_notes)}`,
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
