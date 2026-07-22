/**
 * Patient's own doctors — distinct doctors from the patient's appointments,
 * enriched with the last visit date and upcoming-appointment count.
 *
 * RLS-scoped through requireSupabaseAuth (patient reads their own rows only).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyDoctor = {
  id: string;
  name_ar: string;
  name_en: string | null;
  title_ar: string | null;
  title_en: string | null;
  photo_url: string | null;
  slug: string | null;
  specialty_ar: string | null;
  branch_ar: string | null;
  last_visit_date: string | null;
  upcoming_count: number;
  total_visits: number;
  avg_rating: number | null;
};

export const listMyDoctors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<MyDoctor[]> => {
    const { supabase, userId } = context;

    // Resolve the patient row for this user (may not exist for brand-new sign-ups).
    const { data: patient } = await supabase
      .from("patients")
      .select("id, phone")
      .eq("profile_id", userId)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();

    // Pull appointments belonging to this patient (by patient_id or fallback phone).
    let apptQ = supabase
      .from("appointments")
      .select("doctor_id, appointment_date, status, specialty_id, branch_id")
      .not("doctor_id", "is", null);

    if (patient?.id) {
      apptQ = apptQ.eq("patient_id", patient.id);
    } else if (profile?.phone) {
      apptQ = apptQ.eq("patient_phone", profile.phone);
    } else {
      return [];
    }

    const { data: appts, error } = await apptQ;
    if (error) throw new Error(error.message);
    if (!appts || appts.length === 0) return [];

    const today = new Date().toISOString().slice(0, 10);
    type Agg = {
      last_visit_date: string | null;
      upcoming_count: number;
      total_visits: number;
      specialty_id: string | null;
      branch_id: string | null;
    };
    const byDoctor = new Map<string, Agg>();
    for (const a of appts) {
      if (!a.doctor_id) continue;
      const cur = byDoctor.get(a.doctor_id) ?? {
        last_visit_date: null,
        upcoming_count: 0,
        total_visits: 0,
        specialty_id: a.specialty_id ?? null,
        branch_id: a.branch_id ?? null,
      };
      cur.total_visits += 1;
      const upcoming =
        (a.appointment_date ?? "") >= today &&
        (a.status === "new" || a.status === "confirmed");
      if (upcoming) cur.upcoming_count += 1;
      const isPastCompleted = a.status === "completed";
      if (isPastCompleted) {
        if (!cur.last_visit_date || (a.appointment_date ?? "") > cur.last_visit_date) {
          cur.last_visit_date = a.appointment_date;
        }
      }
      byDoctor.set(a.doctor_id, cur);
    }

    const doctorIds = [...byDoctor.keys()];
    if (doctorIds.length === 0) return [];

    const [drRes, spRes, brRes] = await Promise.all([
      supabase
        .from("doctors")
        .select(
          "id, name_ar, name_en, title_ar, title_en, photo_url, slug, avg_rating, specialty_id, branch_id",
        )
        .in("id", doctorIds),
      supabase.from("specialties").select("id, name_ar"),
      supabase.from("branches").select("id, name_ar"),
    ]);

    const specialtyMap = new Map((spRes.data ?? []).map((s) => [s.id, s.name_ar]));
    const branchMap = new Map((brRes.data ?? []).map((b) => [b.id, b.name_ar]));

    return (drRes.data ?? [])
      .map((d): MyDoctor => {
        const agg = byDoctor.get(d.id)!;
        return {
          id: d.id,
          name_ar: d.name_ar,
          name_en: d.name_en ?? null,
          title_ar: d.title_ar ?? null,
          title_en: d.title_en ?? null,
          photo_url: d.photo_url ?? null,
          slug: d.slug ?? null,
          specialty_ar:
            specialtyMap.get(d.specialty_id ?? agg.specialty_id ?? "") ?? null,
          branch_ar: branchMap.get(d.branch_id ?? agg.branch_id ?? "") ?? null,
          last_visit_date: agg.last_visit_date,
          upcoming_count: agg.upcoming_count,
          total_visits: agg.total_visits,
          avg_rating: d.avg_rating != null ? Number(d.avg_rating) : null,
        };
      })
      .sort((a, b) => {
        if (a.upcoming_count !== b.upcoming_count)
          return b.upcoming_count - a.upcoming_count;
        return (b.last_visit_date ?? "").localeCompare(a.last_visit_date ?? "");
      });
  });
