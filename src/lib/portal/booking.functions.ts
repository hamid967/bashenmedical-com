import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ---------------------------- getBookingOptions --------------------------- */

export const getBookingOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [branchesRes, specialtiesRes, doctorsRes, providersRes] = await Promise.all([
      supabase
        .from("branches")
        .select("id, name_ar, name_en, city_ar, city_en, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("specialties")
        .select("id, name_ar, name_en, slug")
        .order("name_ar", { ascending: true }),
      supabase
        .from("doctors")
        .select(
          "id, name_ar, name_en, title_ar, title_en, photo_url, specialty_id, branch_id, gender, languages, booking_enabled",
        )
        .eq("is_active", true)
        .eq("booking_enabled", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("insurance_providers")
        .select("id, name_ar, name_en, coverage_percent, coverage_tier")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
    ]);
    if (branchesRes.error) throw new Error(branchesRes.error.message);
    if (specialtiesRes.error) throw new Error(specialtiesRes.error.message);
    if (doctorsRes.error) throw new Error(doctorsRes.error.message);
    if (providersRes.error) throw new Error(providersRes.error.message);
    return {
      branches: branchesRes.data ?? [],
      specialties: specialtiesRes.data ?? [],
      doctors: doctorsRes.data ?? [],
      providers: providersRes.data ?? [],
    };
  });


/* --------------------------- getDoctorAvailability ------------------------ */

const SlotsSchema = z.object({
  doctor_id: z.string().uuid(),
  date: z.string().date(), // YYYY-MM-DD
  branch_id: z.string().uuid().optional().nullable(),
});

function toMinutes(hhmmss: string) {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}
function fromMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const getDoctorAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SlotsSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const dateObj = new Date(`${data.date}T00:00:00`);
    const weekday = dateObj.getDay(); // 0=Sun..6=Sat
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = dateObj.getTime() === today.getTime();
    const nowMins = today.getHours() * 60 + today.getMinutes();

    // Availability rules
    let availQ = supabase
      .from("availability")
      .select("start_time, end_time, slot_minutes, branch_id")
      .eq("doctor_id", data.doctor_id)
      .eq("weekday", weekday);
    if (data.branch_id) availQ = availQ.eq("branch_id", data.branch_id);
    const availRes = await availQ;
    if (availRes.error) throw new Error(availRes.error.message);

    // Leaves overlapping the day
    const leavesRes = await supabase
      .from("doctor_leaves")
      .select("start_date, end_date, all_day")
      .eq("doctor_id", data.doctor_id)
      .lte("start_date", data.date)
      .gte("end_date", data.date);
    if (leavesRes.error) throw new Error(leavesRes.error.message);
    const onLeave = (leavesRes.data ?? []).some((l) => l.all_day);
    if (onLeave || (availRes.data ?? []).length === 0) {
      return { slots: [] as Array<{ time: string; available: boolean }> };
    }

    // Booked appointments for that day
    let bookedQ = supabase
      .from("appointments")
      .select("appointment_time, branch_id")
      .eq("doctor_id", data.doctor_id)
      .eq("appointment_date", data.date)
      .in("status", ["new", "confirmed"]);
    if (data.branch_id) bookedQ = bookedQ.eq("branch_id", data.branch_id);
    const bookedRes = await bookedQ;
    if (bookedRes.error) throw new Error(bookedRes.error.message);
    const booked = new Set(
      (bookedRes.data ?? []).map((a) => (a.appointment_time as string).slice(0, 5)),
    );

    // Generate slots
    const slotsMap = new Map<string, boolean>();
    for (const rule of availRes.data ?? []) {
      const start = toMinutes(rule.start_time as string);
      const end = toMinutes(rule.end_time as string);
      const step = Math.max(5, rule.slot_minutes ?? 30);
      for (let t = start; t + step <= end; t += step) {
        const label = fromMinutes(t);
        const available = !booked.has(label) && !(isToday && t <= nowMins);
        // If a slot appears in multiple rules keep "available OR previous"
        if (!slotsMap.has(label) || slotsMap.get(label) === false) {
          slotsMap.set(label, available);
        }
      }
    }
    const slots = [...slotsMap.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([time, available]) => ({ time, available }));
    return { slots };
  });

/* --------------------------- createMyAppointment -------------------------- */

const CreateSchema = z.object({
  doctor_id: z.string().uuid(),
  branch_id: z.string().uuid().optional().nullable(),
  specialty_id: z.string().uuid().optional().nullable(),
  appointment_date: z.string().date(),
  appointment_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  patient_name: z.string().trim().min(2).max(120),
  patient_phone: z.string().trim().min(6).max(32),
  patient_email: z.string().email().max(160).optional().nullable(),
  whatsapp_opt_in: z.boolean().optional(),
});

export const createMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Find linked patient (optional)
    const patientRes = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();

    // Double-check the slot is still free
    const clashRes = await supabase
      .from("appointments")
      .select("id")
      .eq("doctor_id", data.doctor_id)
      .eq("appointment_date", data.appointment_date)
      .eq("appointment_time", data.appointment_time)
      .in("status", ["new", "confirmed"])
      .maybeSingle();
    if (clashRes.error && clashRes.error.code !== "PGRST116") {
      throw new Error(clashRes.error.message);
    }
    if (clashRes.data) {
      throw new Error("هذا الموعد لم يعد متاحًا. يرجى اختيار وقت آخر.");
    }

    const insertRes = await supabase
      .from("appointments")
      .insert({
        doctor_id: data.doctor_id,
        branch_id: data.branch_id ?? null,
        specialty_id: data.specialty_id ?? null,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        patient_name: data.patient_name,
        patient_phone: data.patient_phone,
        patient_email: data.patient_email ?? null,
        whatsapp_opt_in: data.whatsapp_opt_in ?? false,
        patient_id: patientRes.data?.id ?? null,
        status: "new",
      })
      .select("id, appointment_date, appointment_time, status")
      .single();
    if (insertRes.error) throw new Error(insertRes.error.message);
    return insertRes.data;
  });
