/**
 * API test for POST /api/public/book/create.
 *
 * Booking create requires an authenticated Bearer session (AUTH_REQUIRED).
 * Validation / DB / success cases run only when E2E_PATIENT_* credentials
 * are available to mint a patient access token.
 *
 * Env:  SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Optional: E2E_PATIENT_EMAIL, E2E_PATIENT_PASSWORD
 * Run:  bun tests/rls/book-api-friendly-errors.test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { FRIENDLY_INSERT_MESSAGES } from "../../src/lib/insert-errors";

const URL = process.env.SUPABASE_URL!;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE = process.env.API_BASE_URL ?? "http://localhost:8080";
if (!URL || !SVC) {
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
function assertEq<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const FUTURE = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

const validBody = (overrides: Record<string, unknown> = {}) => ({
  patient_name: `ApiBook-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  patient_phone: "0501234567",
  appointment_date: FUTURE,
  appointment_time: "10:00",
  ...overrides,
});

async function post(body: unknown, opts: { raw?: string; token?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}/api/public/book/create`, {
    method: "POST",
    headers,
    body: opts.raw ?? JSON.stringify(body),
  });
  let json: { ok?: boolean; kind?: string; code?: string; message?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function mintPatientToken(): Promise<string | null> {
  const email = process.env.E2E_PATIENT_EMAIL;
  const password = process.env.E2E_PATIENT_PASSWORD;
  if (!email || !password || !PUB) return null;
  const anon = createClient(URL, PUB, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) return null;
  return data.session.access_token;
}

async function main() {
  console.log("book-api-friendly-errors");

  await test("A1. unauthenticated → 401 AUTH_REQUIRED", async () => {
    const { status, json } = await post(validBody());
    assertEq(status, 401, "status");
    assertEq(json?.ok, false, "ok");
    assertEq(json?.kind, "auth", "kind");
    assertEq(json?.code, "AUTH_REQUIRED", "code");
  });

  const token = await mintPatientToken();
  if (!token) {
    console.log("  (skipping authenticated cases — set E2E_PATIENT_EMAIL/PASSWORD)");
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    return;
  }

  await test("V1. short patient_name → Arabic validation message, 400", async () => {
    const { status, json } = await post(validBody({ patient_name: "ا" }), { token });
    assertEq(status, 400, "status");
    assertEq(json?.ok, false, "ok");
    assertEq(json?.kind, "validation", "kind");
    assertEq(json?.message, "الاسم قصير جدًا (٢ أحرف على الأقل)", "message");
  });

  await test("V2. long patient_name → 'الاسم طويل جدًا'", async () => {
    const { json } = await post(validBody({ patient_name: "ا".repeat(200) }), { token });
    assertEq(json?.message, "الاسم طويل جدًا", "message");
  });

  await test("V3. short phone → 'رقم الهاتف قصير جدًا'", async () => {
    const { json } = await post(validBody({ patient_phone: "0501" }), { token });
    assertEq(json?.message, "رقم الهاتف قصير جدًا", "message");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
