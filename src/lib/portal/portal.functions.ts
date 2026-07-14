import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ----------------------------- getMyProfile ------------------------------ */

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, phone, avatar_url, national_id, date_of_birth, gender, preferred_language, emergency_contact_name, emergency_contact_phone, insurance_provider, insurance_policy_no, dark_mode, notification_prefs, default_branch_id",
      )
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/* ---------------------------- updateMyProfile ---------------------------- */

const UpdateProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(32).optional().nullable(),
  national_id: z.string().trim().max(32).optional().nullable(),
  date_of_birth: z.string().date().optional().nullable(),
  gender: z.enum(["male", "female"]).optional().nullable(),
  preferred_language: z.enum(["ar", "en"]).optional(),
  emergency_contact_name: z.string().trim().max(120).optional().nullable(),
  emergency_contact_phone: z.string().trim().max(32).optional().nullable(),
  insurance_provider: z.string().trim().max(120).optional().nullable(),
  insurance_policy_no: z.string().trim().max(64).optional().nullable(),
  avatar_url: z.string().url().max(1024).optional().nullable(),
  dark_mode: z.boolean().optional(),
  notification_prefs: z
    .object({
      email: z.boolean().optional(),
      sms: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
      push: z.boolean().optional(),
    })
    .optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateProfileSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("profiles")
      .update(data)
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return updated;
  });

/* -------------------------- getDashboardSummary -------------------------- */

export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Profile
    const profileRes = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, phone, preferred_language")
      .eq("id", userId)
      .maybeSingle();

    // Linked patient (may not exist yet for brand-new sign-ups)
    const patientRes = await supabase
      .from("patients")
      .select("id, mrn, full_name_ar, full_name_en, blood_type, date_of_birth, branch_id")
      .eq("profile_id", userId)
      .maybeSingle();

    const patientId = patientRes.data?.id ?? null;

    // Upcoming appointments (patient link OR fallback to phone match)
    const today = new Date().toISOString().slice(0, 10);
    let upcomingQuery = supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, status, reason, doctor_id, branch_id, patient_name",
      )
      .gte("appointment_date", today)
      .in("status", ["new", "confirmed"])
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true })
      .limit(5);
    if (patientId) {
      upcomingQuery = upcomingQuery.eq("patient_id", patientId);
    } else if (profileRes.data?.phone) {
      upcomingQuery = upcomingQuery.eq("patient_phone", profileRes.data.phone);
    } else {
      upcomingQuery = upcomingQuery.eq("patient_id", "00000000-0000-0000-0000-000000000000");
    }
    const upcomingRes = await upcomingQuery;

    // Enrich doctor names for the upcoming rows we got
    const doctorIds = [
      ...new Set((upcomingRes.data ?? []).map((a) => a.doctor_id).filter(Boolean) as string[]),
    ];
    let doctorsById: Record<
      string,
      { id: string; name_ar: string; name_en: string | null; photo_url: string | null }
    > = {};
    if (doctorIds.length > 0) {
      const drs = await supabase
        .from("doctors")
        .select("id, name_ar, name_en, photo_url")
        .in("id", doctorIds);
      for (const d of drs.data ?? []) doctorsById[d.id] = d;
    }

    // Featured / active doctors for the sidebar rail
    const doctorsRail = await supabase
      .from("doctors")
      .select("id, name_ar, name_en, photo_url, title_ar, title_en, specialty_id")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(6);


    // Notifications for the current user
    const notifRes = await supabase
      .from("notifications")
      .select("id, title, body, created_at, read_at, kind")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    const unreadCount = (notifRes.data ?? []).filter((n) => !n.read_at).length;

    // Recent labs (last 5) — for a compact "recent results" card
    let labs: Array<{
      id: string;
      title: string;
      test_type: string | null;
      summary: string | null;
      status: string | null;
      report_date: string | null;
      file_path: string | null;
    }> = [];
    if (patientId) {
      const labRes = await supabase
        .from("lab_reports")
        .select("id, title, test_type, summary, status, report_date, file_path")
        .eq("patient_id", patientId)
        .order("report_date", { ascending: false })
        .limit(5);
      labs = (labRes.data ?? []) as typeof labs;
    }

    // Active medications count (status = 'active')
    let activeMedsCount = 0;
    if (patientId) {
      const medsRes = await supabase
        .from("patient_medications")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patientId)
        .eq("status", "active");
      activeMedsCount = medsRes.count ?? 0;
    }


    // Outstanding invoices (unpaid / partially paid) for the linked patient
    let outstandingInvoices: Array<{
      id: string;
      invoice_number: string | null;
      total_amount: number | null;
      paid_amount: number | null;
      due_date: string | null;
      status: string | null;
    }> = [];
    let outstandingTotal = 0;
    if (patientId) {
      const invRes = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, paid_amount, due_date, status")
        .eq("patient_id", patientId)
        .in("status", ["unpaid", "partially_paid", "pending"])
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(5);
      outstandingInvoices = (invRes.data ?? []) as typeof outstandingInvoices;
      outstandingTotal = outstandingInvoices.reduce((sum, i) => {
        const total = Number(i.total_amount ?? 0);
        const paid = Number(i.paid_amount ?? 0);
        return sum + Math.max(0, total - paid);
      }, 0);
    }

    // Pending insurance approvals
    let pendingInsurance: Array<{
      id: string;
      service: string | null;
      provider_name: string | null;
      status: string | null;
      submitted_at: string | null;
    }> = [];
    if (patientId) {
      const insRes = await supabase
        .from("insurance_approvals")
        .select("id, service, provider_name, status, submitted_at")
        .eq("patient_id", patientId)
        .in("status", ["submitted", "under_review", "additional_info_required", "draft"])
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit: 5 as never; // placeholder fixed below
      pendingInsurance = (insRes.data ?? []) as typeof pendingInsurance;
    }

    // Family members (dependents) — quick strip
    const familyRes = await supabase
      .from("dependents")
      .select("id, full_name_ar, full_name_en, relationship, date_of_birth")
      .eq("guardian_id", userId)
      .order("created_at", { ascending: false })
      .limit(6);

    return {
      profile: profileRes.data,
      patient: patientRes.data,
      upcoming: (upcomingRes.data ?? []).map((a) => ({
        ...a,
        doctor: a.doctor_id ? doctorsById[a.doctor_id] ?? null : null,
      })),
      upcomingCount: (upcomingRes.data ?? []).length,
      doctorsRail: doctorsRail.data ?? [],
      notifications: notifRes.data ?? [],
      unreadCount,
      recentLabs: labs,
      activeMedsCount,
      outstandingInvoices,
      outstandingTotal,
      pendingInsurance,
      pendingInsuranceCount: pendingInsurance.length,
      family: familyRes.data ?? [],
    };
  });
