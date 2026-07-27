/**
 * Integration tests: public.normalize_reason(text) SQL function.
 *
 * Contract (must match src/lib/reason.ts normalizeReason):
 *   - Strips leading/trailing whitespace only: \s (ASCII space, \t, \n, \r,
 *     \f, \v) plus NBSP U+00A0.
 *   - Preserves internal whitespace verbatim (no collapsing).
 *   - Preserves any character that is NOT \s / NBSP at the edges, including
 *     ZWSP U+200B, ZWJ U+200D, LRM U+200E, BOM U+FEFF, and Arabic letters.
 *   - Caps output at 500 characters (after trim).
 *   - NULL → NULL.
 *
 * Called directly via PostgREST rpc('normalize_reason', { _raw }).
 *
 * Run:  bun tests/rls/normalize-reason-sql.test.ts
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
if (!URL || !ANON) {
  console.log("(skipping — missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY)");
  process.exit(0);
}
const sb = createClient(URL, ANON, { auth: { persistSession: false } });

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

async function norm(raw: string | null): Promise<string | null> {
  const { data, error } = await sb.rpc("normalize_reason" as any, { _raw: raw });
  if (error) throw new Error(`rpc failed: ${error.message}`);
  return data as string | null;
}
function eq(got: unknown, want: unknown, label = "value") {
  assert(
    got === want,
    `${label} mismatch:\n    got=${JSON.stringify(got)}\n    want=${JSON.stringify(want)}`,
  );
}

const ZWSP = "\u200B";
const ZWJ = "\u200D";
const LRM = "\u200E";
const BOM = "\uFEFF";
const NBSP = "\u00A0";
const SP = " ";

(async () => {
  console.log("── normalize_reason: NULL ──");
  await test("NULL → NULL", async () => eq(await norm(null), null));

  console.log("\n── whitespace-only (all classes trimmed) → '' ──");
  for (const [name, raw] of [
    ["empty", ""],
    ["ASCII spaces", "     "],
    ["tabs", "\t\t"],
    ["LF", "\n\n"],
    ["CR", "\r\r"],
    ["CRLF", "\r\n\r\n"],
    ["FF (\\f)", "\f\f"],
    ["VT (\\v)", "\v\v"],
    ["NBSP", `${NBSP}${NBSP}${NBSP}`],
    ["mixed all", ` \t\n\r\f\v${NBSP} `],
  ] as const) {
    await test(`ws-only (${name}) → ''`, async () => eq(await norm(raw), ""));
  }

  console.log("\n── edge trimming only (interior preserved) ──");
  const edgeCases: Array<[string, string, string]> = [
    ["leading spaces", `   طلب`, `طلب`],
    ["trailing spaces", `طلب   `, `طلب`],
    ["leading/trailing tabs", `\t\tطلب\t`, `طلب`],
    ["leading/trailing newlines", `\n\nطلب\n`, `طلب`],
    ["CRLF wrapping", `\r\nطلب\r\n`, `طلب`],
    ["NBSP wrapping", `${NBSP}${NBSP}طلب${NBSP}`, `طلب`],
    ["mixed edges + NBSP", `  \n\t${NBSP}طلب${NBSP}\t\n\r `, `طلب`],
    ["FF / VT edges", `\f\vطلب\v\f`, `طلب`],
  ];
  for (const [name, raw, want] of edgeCases) {
    await test(`trim edges: ${name}`, async () => eq(await norm(raw), want));
  }

  console.log("\n── internal whitespace preserved verbatim ──");
  const internal: Array<[string, string, string]> = [
    ["double space", `اتصل${SP}${SP}المريض`, `اتصل${SP}${SP}المريض`],
    ["triple space", `اتصل${SP}${SP}${SP}المريض`, `اتصل${SP}${SP}${SP}المريض`],
    ["internal tab", `اتصل\tالمريض`, `اتصل\tالمريض`],
    ["internal newline", `اتصل\nالمريض`, `اتصل\nالمريض`],
    ["internal CRLF", `اتصل\r\nالمريض`, `اتصل\r\nالمريض`],
    ["internal NBSP", `اتصل${NBSP}المريض`, `اتصل${NBSP}المريض`],
    ["NBSP run internal", `اتصل${NBSP}${NBSP}${NBSP}المريض`, `اتصل${NBSP}${NBSP}${NBSP}المريض`],
    ["mixed NBSP + space", `اتصل${NBSP}${SP}${NBSP}المريض`, `اتصل${NBSP}${SP}${NBSP}المريض`],
    ["multi-token internal", `اتصل\tالمريض\nلإلغاء\tالحجز`, `اتصل\tالمريض\nلإلغاء\tالحجز`],
    ["edges trimmed, internal kept", `  اتصل${NBSP}${NBSP}المريض\n`, `اتصل${NBSP}${NBSP}المريض`],
  ];
  for (const [name, raw, want] of internal) {
    await test(`internal preserved: ${name}`, async () => eq(await norm(raw), want));
  }

  console.log("\n── non-\\s characters NOT trimmed at edges ──");
  const nonWs: Array<[string, string, string]> = [
    ["ZWSP U+200B leading", `${ZWSP}طلب`, `${ZWSP}طلب`],
    ["ZWSP U+200B trailing", `طلب${ZWSP}`, `طلب${ZWSP}`],
    ["ZWSP both sides", `${ZWSP}طلب${ZWSP}`, `${ZWSP}طلب${ZWSP}`],
    ["ZWSP internal only", `طلب${ZWSP}المريض`, `طلب${ZWSP}المريض`],
    ["ZWSP-only survives", `${ZWSP}${ZWSP}${ZWSP}`, `${ZWSP}${ZWSP}${ZWSP}`],
    ["ZWJ U+200D edges kept", `${ZWJ}طلب${ZWJ}`, `${ZWJ}طلب${ZWJ}`],
    ["LRM U+200E edges kept", `${LRM}طلب${LRM}`, `${LRM}طلب${LRM}`],
    ["BOM U+FEFF edges kept", `${BOM}طلب${BOM}`, `${BOM}طلب${BOM}`],
    ["ZWSP + edge spaces", `  ${ZWSP}طلب${ZWSP}  `, `${ZWSP}طلب${ZWSP}`],
    ["ZWSP + edge NBSP", `${NBSP}${ZWSP}طلب${ZWSP}${NBSP}`, `${ZWSP}طلب${ZWSP}`],
    ["ZWSP + edge tabs/nl", `\n\t${ZWSP}طلب${ZWSP}\t\n`, `${ZWSP}طلب${ZWSP}`],
    ["punct edges kept", `.طلب.`, `.طلب.`],
    ["digit edges kept", `1طلب1`, `1طلب1`],
  ];
  for (const [name, raw, want] of nonWs) {
    await test(`non-\\s kept: ${name}`, async () => eq(await norm(raw), want));
  }

  console.log("\n── 500-char cap applied AFTER trim ──");
  await test("under cap unchanged", async () => {
    const s = "ا".repeat(500);
    eq(await norm(s), s);
  });
  await test("over cap sliced to 500", async () => {
    const s = "ا".repeat(525);
    const got = (await norm(s))!;
    eq(got.length, 500, "length");
    eq(got, "ا".repeat(500));
  });
  await test("edges trimmed BEFORE counting toward cap", async () => {
    const core = "ب".repeat(510);
    const got = (await norm(`   \n${core}\t   `))!;
    eq(got.length, 500, "length");
    eq(got, "ب".repeat(500));
  });

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
