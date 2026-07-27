/**
 * Patient RLS integration test.
 *
 * Simulates two isolated authenticated patients (A and B) and verifies that
 * RLS strictly prevents cross-patient reads/writes on the surfaces exposed
 * by the /patient portal:
 *
 *   1. Patient A reads only their own appointments.
 *   2. Patient A cannot read Patient B's appointment.
 *   3. Patient A cannot update Patient B's appointment (RLS filters row).
 *   4. Patient A reads only their own prescriptions.
 *   5. Patient A cannot read Patient B's prescription.
 *   6. Patient A reads only their own patient_profiles row.
 *   7. Patient A cannot read Patient B's patient_profiles row.
 *   8. Patient A can submit a rating (anon-shape).
 *   9. Patient A cannot reply to their own rating (staff-only UPDATE).
 *  10. Patient A cannot delete any rating (staff-only DELETE).
 *
 * Run:   bun tests/rls/patient-workflow.rls.test.ts
 * Env:   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_PUBLISHABLE_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SERVICE) {
  console.error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

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

async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  assert(data.session, "no session");
  return c;
}

async function createPatientUser(email: string) {
  const password = "Test!" + Math.random().toString(36).slice(2, 10) + "Aa1";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  // Register the "patient" role so downstream authz helpers behave normally.
  const { error: rerr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: "patient" });
  if (rerr && !String(rerr.message).includes("duplicate")) throw rerr;
  return { userId, email, password };
}

async function createPatientRow(profileUserId: string, name: string) {
  const { data: branch, error: bErr } = await admin
    .from("branches")
    .select("id")
    .limit(1)
    .single();
  if (bErr) throw bErr;
  const suffix = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
  const { data, error } = await admin
    .from("patients")
    .insert({
      full_name_ar: name,
      phone: "+96650" + Math.floor(1e7 + Math.random() * 9e7),
      branch_id: branch.id,
      mrn: "PAT-" + suffix,
      profile_id: profileUserId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function upsertPatientProfile(userId: string, mrn: string) {
  const { error } = await admin
    .from("patient_profiles")
    .upsert({ user_id: userId, mrn, full_name_ar: "بروفايل " + mrn });
  if (error) throw error;
}

async function verifyProfilePhone(userId: string, phone: string) {
  // The `users read own appointments` policy resolves ownership via
  // `_appointment_belongs_to_me(phone)`, which requires a verified phone
  // on `public.profiles` matching (digits-only) the appointment phone.
  const { error } = await admin
    .from("profiles")
    .upsert({
      id: userId,
      verified_phone: phone,
      phone_verified_at: new Date().toISOString(),
    });
  if (error) throw error;
}

async function anyDoctorId(): Promise<string> {
  const { data, error } = await admin.from("doctors").select("id").limit(1).single();
  if (error) throw error;
  return data.id as string;
}

async function seedAppointmentForPhone(phone: string, doctorId: string) {
  // Leave `patient_id` NULL so RLS falls through to the phone-verified
  // ownership branch (`_appointment_belongs_to_me`). The FK on patient_id
  // targets `patients.id`, not `auth.uid`, so the equality branch of the
  // policy is unreachable for real bookings.
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_name: "Appt " + Date.now(),
      patient_phone: phone,
      doctor_id: doctorId,
      appointment_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      appointment_time: "09:30",
      status: "new",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function seedPrescription(patientsRowId: string) {
  const { data, error } = await admin
    .from("prescriptions")
    .insert({
      patient_id: patientsRowId,
      medication: "Amoxicillin 500mg",
      dosage: "1 cap / 8h",
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function main() {
  console.log("Seeding patient-workflow test fixtures…");
  const stamp = Date.now();
  const userA = await createPatientUser(`rls-patA-${stamp}@test.local`);
  const userB = await createPatientUser(`rls-patB-${stamp}@test.local`);

  const patientsRowA = await createPatientRow(userA.userId, "مريض أ " + stamp);
  const patientsRowB = await createPatientRow(userB.userId, "مريض ب " + stamp);

  await upsertPatientProfile(userA.userId, "MRN-A-" + stamp);
  await upsertPatientProfile(userB.userId, "MRN-B-" + stamp);

  const phoneA = "+966500000101";
  const phoneB = "+966500000102";
  await verifyProfilePhone(userA.userId, phoneA);
  await verifyProfilePhone(userB.userId, phoneB);
  const apptA = await seedAppointmentForPhone(phoneA);
  const apptB = await seedAppointmentForPhone(phoneB);

  const rxA = await seedPrescription(patientsRowA);
  const rxB = await seedPrescription(patientsRowB);

  const patA = await signInAs(userA.email, userA.password);
  const patB = await signInAs(userB.email, userB.password);

  console.log("\nAppointments — patient isolation:");
  await test("Patient A reads own appointment", async () => {
    const { data, error } = await patA.from("appointments").select("id").eq("id", apptA);
    assert(!error, error?.message ?? "");
    assert(data && data.length === 1, `expected 1 row, got ${data?.length}`);
  });

  await test("Patient A CANNOT read Patient B's appointment", async () => {
    const { data, error } = await patA.from("appointments").select("id").eq("id", apptB);
    assert(!error, error?.message ?? "");
    assert(!data || data.length === 0, "leaked another patient's appointment");
  });

  await test("Patient A whole-table SELECT never returns Patient B's appointment", async () => {
    const { data, error } = await patA.from("appointments").select("id, patient_id");
    assert(!error, error?.message ?? "");
    const leaked = (data ?? []).filter((r) => r.id === apptB);
    assert(leaked.length === 0, `saw ${leaked.length} foreign appointment rows`);
  });

  await test("Patient A CANNOT update Patient B's appointment", async () => {
    const { data } = await patA
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", apptB)
      .select("id");
    assert(!data || data.length === 0, "was able to mutate another patient's appointment");
  });

  console.log("\nPrescriptions — patient isolation:");
  await test("Patient A reads own prescription", async () => {
    const { data, error } = await patA.from("prescriptions").select("id").eq("id", rxA);
    assert(!error, error?.message ?? "");
    assert(data && data.length === 1, "cannot read own rx");
  });

  await test("Patient A CANNOT read Patient B's prescription", async () => {
    const { data, error } = await patA.from("prescriptions").select("id").eq("id", rxB);
    assert(!error, error?.message ?? "");
    assert(!data || data.length === 0, "leaked another patient's rx");
  });

  await test("Patient A whole-table prescriptions SELECT never returns B's rx", async () => {
    const { data, error } = await patA.from("prescriptions").select("id");
    assert(!error, error?.message ?? "");
    const leaked = (data ?? []).filter((r) => r.id === rxB);
    assert(leaked.length === 0, `saw ${leaked.length} foreign rx rows`);
  });

  console.log("\nPatient profiles — owner-only SELECT:");
  await test("Patient A reads own patient_profiles row", async () => {
    const { data, error } = await patA
      .from("patient_profiles")
      .select("user_id")
      .eq("user_id", userA.userId)
      .maybeSingle();
    assert(!error, error?.message ?? "");
    assert(data?.user_id === userA.userId, "cannot read own profile");
  });

  await test("Patient A CANNOT read Patient B's patient_profiles row", async () => {
    const { data, error } = await patA
      .from("patient_profiles")
      .select("user_id")
      .eq("user_id", userB.userId)
      .maybeSingle();
    assert(!error, error?.message ?? "");
    assert(!data, "leaked another patient's profile");
  });

  console.log("\nRatings — write-only for patients, no cross-patient mutations:");
  let myRatingId: string | null = null;
  await test("Patient A can submit a public rating", async () => {
    const { data, error } = await patA
      .from("patient_ratings")
      .insert({ rating: 5, source: "public", patient_name: "أ. اختبار", comment: "شكراً" })
      .select("id")
      .single();
    assert(!error, error?.message ?? "");
    myRatingId = data.id;
  });

  await test("Patient A CANNOT reply to any rating (staff-only UPDATE)", async () => {
    assert(myRatingId, "no rating id");
    const { data } = await patB
      .from("patient_ratings")
      .update({ staff_reply: "بالخدمة" })
      .eq("id", myRatingId)
      .select("id");
    assert(!data || data.length === 0, "non-staff was able to reply to a rating");
  });

  await test("Patient A CANNOT delete a rating (staff-only DELETE)", async () => {
    assert(myRatingId, "no rating id");
    const { data } = await patA
      .from("patient_ratings")
      .delete()
      .eq("id", myRatingId)
      .select("id");
    assert(!data || data.length === 0, "non-staff was able to delete a rating");
  });

  // Cleanup
  console.log("\nCleaning up…");
  if (myRatingId) await admin.from("patient_ratings").delete().eq("id", myRatingId);
  await admin.from("prescriptions").delete().in("id", [rxA, rxB]);
  await admin.from("appointments").delete().in("id", [apptA, apptB]);
  await admin.from("patients").delete().in("id", [patientsRowA, patientsRowB]);
  await admin.from("patient_profiles").delete().in("user_id", [userA.userId, userB.userId]);
  await admin.auth.admin.deleteUser(userA.userId);
  await admin.auth.admin.deleteUser(userB.userId);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
