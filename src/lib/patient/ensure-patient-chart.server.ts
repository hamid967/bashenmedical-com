/**
 * Ensure a patients row exists for an authenticated profile.
 * appointments.patient_id references patients.id (not auth.users).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensurePatientChart(
  admin: SupabaseClient,
  opts: {
    userId: string;
    fullName: string;
    phone: string;
    email?: string | null;
    nationalId?: string | null;
    gender?: string | null;
    branchId?: string | null;
  },
): Promise<string | null> {
  const { data: existing } = await admin
    .from("patients")
    .select("id")
    .eq("profile_id", opts.userId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  let branchId = opts.branchId ?? null;
  if (!branchId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("default_branch_id")
      .eq("id", opts.userId)
      .maybeSingle();
    branchId = (profile?.default_branch_id as string | null) ?? null;
  }
  if (!branchId) {
    const { data: branch } = await admin
      .from("branches")
      .select("id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    branchId = (branch?.id as string | null) ?? null;
  }
  if (!branchId) return null;

  const { data: mrn, error: mrnErr } = await admin.rpc("generate_mrn", {
    _branch_id: branchId,
  });
  if (mrnErr || !mrn) {
    console.error("[ensurePatientChart] generate_mrn failed", mrnErr);
    return null;
  }

  const gender =
    opts.gender === "male" || opts.gender === "female" || opts.gender === "other"
      ? opts.gender
      : null;

  const { data: created, error } = await admin
    .from("patients")
    .insert({
      profile_id: opts.userId,
      branch_id: branchId,
      mrn: String(mrn),
      full_name_ar: opts.fullName,
      full_name_en: opts.fullName,
      phone: opts.phone,
      email: opts.email ?? null,
      national_id: opts.nationalId ?? null,
      gender,
      is_active: true,
      status: "active",
      created_by: opts.userId,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Race: another request created the chart
    const { data: again } = await admin
      .from("patients")
      .select("id")
      .eq("profile_id", opts.userId)
      .maybeSingle();
    if (again?.id) return again.id as string;
    console.error("[ensurePatientChart] insert failed", error);
    return null;
  }
  return (created?.id as string | null) ?? null;
}
