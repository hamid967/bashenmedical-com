/**
 * Prescriptions + active medications + AI reminder assistant that considers upcoming appointments.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPatientAccess } from "@/lib/patient/authz.server";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "new",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;
function normalizeAppointmentStatus(value: unknown): AppointmentStatus {
  return APPOINTMENT_STATUSES.includes(value as AppointmentStatus)
    ? (value as AppointmentStatus)
    : "new";
}

export type PrescriptionItem = {
  id: string;
  medication: string;
  dosage: string | null;
  instructions: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  refills_remaining: number | null;
  notes: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  source: "prescription" | "medication";
  frequency?: string | null;
  route?: string | null;
};

export type UpcomingAppointment = {
  id: string;
  date: string;
  time: string | null;
  doctor_name: string | null;
  specialty: string | null;
  status: AppointmentStatus;
  reason: string | null;
};

export type PrescriptionsPayload = {
  active: PrescriptionItem[];
  past: PrescriptionItem[];
  upcoming: UpcomingAppointment[];
  patient: { id: string; full_name_ar: string | null } | null;
};

export const getMyPrescriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PrescriptionsPayload> => {
    await assertPatientAccess(context.supabase, context.userId, "prescriptions");
    const { supabase, userId } = context;

    const patientRes = await supabase
      .from("patients")
      .select("id, full_name_ar")
      .eq("profile_id", userId)
      .maybeSingle();

    const patient = patientRes.data
      ? {
          id: patientRes.data.id as string,
          full_name_ar: (patientRes.data.full_name_ar as string | null) ?? null,
        }
      : null;

    if (!patient) return { active: [], past: [], upcoming: [], patient: null };

    const [rxRes, medsRes, aptsRes] = await Promise.all([
      supabase
        .from("prescriptions")
        .select(
          "id, medication, dosage, instructions, status, start_date, end_date, refills_remaining, notes, doctor_id, doctors:doctor_id(name_ar)",
        )
        .eq("patient_id", patient.id)
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from("patient_medications")
        .select(
          "id, medication_name, dosage, frequency, route, start_date, end_date, status, prescribed_by_name, notes",
        )
        .eq("patient_id", patient.id)
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from("appointments")
        .select(
          "id, appointment_date, appointment_time, status, reason, doctor_id, doctors:doctor_id(name_ar, specialties:specialty_id(name_ar))",
        )
        .eq("patient_id", patient.id)
        .gte("appointment_date", new Date().toISOString().slice(0, 10))
        .in("status", ["new", "confirmed"])
        .order("appointment_date", { ascending: true })
        .limit(20),
    ]);

    const items: PrescriptionItem[] = [];
    for (const r of rxRes.data ?? []) {
      items.push({
        id: `rx-${r.id}`,
        medication: (r.medication as string) ?? "",
        dosage: (r.dosage as string | null) ?? null,
        instructions: (r.instructions as string | null) ?? null,
        status: (r.status as string | null) ?? null,
        start_date: (r.start_date as string | null) ?? null,
        end_date: (r.end_date as string | null) ?? null,
        refills_remaining: (r.refills_remaining as number | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        doctor_id: (r.doctor_id as string | null) ?? null,
        doctor_name:
          ((r as { doctors?: { name_ar?: string | null } | null }).doctors?.name_ar as
            string | null) ?? null,
        source: "prescription",
      });
    }
    for (const m of medsRes.data ?? []) {
      items.push({
        id: `med-${m.id}`,
        medication: (m.medication_name as string) ?? "",
        dosage: (m.dosage as string | null) ?? null,
        instructions: null,
        status: (m.status as string | null) ?? null,
        start_date: (m.start_date as string | null) ?? null,
        end_date: (m.end_date as string | null) ?? null,
        refills_remaining: null,
        notes: (m.notes as string | null) ?? null,
        doctor_id: null,
        doctor_name: (m.prescribed_by_name as string | null) ?? null,
        source: "medication",
        frequency: (m.frequency as string | null) ?? null,
        route: (m.route as string | null) ?? null,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const active: PrescriptionItem[] = [];
    const past: PrescriptionItem[] = [];
    for (const it of items) {
      const isActive =
        (it.status ?? "").toLowerCase() === "active" ||
        ((!it.end_date || it.end_date >= today) &&
          (it.status ?? "active").toLowerCase() !== "cancelled" &&
          (it.status ?? "active").toLowerCase() !== "stopped" &&
          (it.status ?? "active").toLowerCase() !== "completed");
      if (isActive) active.push(it);
      else past.push(it);
    }

    const upcoming: UpcomingAppointment[] = (aptsRes.data ?? []).map((a) => {
      const doc = (
        a as {
          doctors?: {
            name_ar?: string | null;
            specialties?: { name_ar?: string | null } | null;
          } | null;
        }
      ).doctors;
      return {
        id: a.id as string,
        date: a.appointment_date as string,
        time: (a.appointment_time as string | null) ?? null,
        doctor_name: (doc?.name_ar as string | null) ?? null,
        specialty: (doc?.specialties?.name_ar as string | null) ?? null,
        status: normalizeAppointmentStatus(a.status),
        reason: (a.reason as string | null) ?? null,
      };
    });

    return { active, past, upcoming, patient };
  });

/* --------------------------- AI reminder plan --------------------------- */

export type ReminderSlot = {
  medication: string;
  dosage: string | null;
  time: string; // HH:mm 24h
  label: string; // e.g. "الفطور", "قبل النوم"
  note?: string | null;
};

export type ReminderPlan = {
  headline: string;
  overview: string;
  slots: ReminderSlot[];
  appointmentReminders: {
    appointment_id: string;
    when: string; // e.g. "غداً 9:00"
    action: string;
    priority: "high" | "medium" | "low";
  }[];
  warnings: string[];
  generatedAt: string;
  model: string;
};

const PlanInput = z.object({
  preferredWakeHour: z.number().int().min(4).max(11).optional(),
  preferredSleepHour: z.number().int().min(20).max(26).optional(),
});

export const generateMedicationReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => PlanInput.parse(i ?? {}))
  .handler(async ({ context, data }): Promise<ReminderPlan> => {
    await assertPatientAccess(context.supabase, context.userId, "prescriptions");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("مفتاح الذكاء الاصطناعي غير مهيأ.");
    const { supabase, userId } = context;

    const patientRes = await supabase
      .from("patients")
      .select("id, full_name_ar")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!patientRes.data) throw new Error("لا يوجد ملف مريض مرتبط.");
    const pid = patientRes.data.id;

    const today = new Date().toISOString().slice(0, 10);
    const [medsRes, allergyRes, aptsRes, prefsRes] = await Promise.all([
      supabase
        .from("patient_medications")
        .select("medication_name, dosage, frequency, route, notes, status, start_date, end_date")
        .eq("patient_id", pid)
        .limit(60),
      supabase
        .from("patient_allergies")
        .select("allergen, reaction, severity")
        .eq("patient_id", pid)
        .limit(20),
      supabase
        .from("appointments")
        .select(
          "id, appointment_date, appointment_time, reason, status, doctors:doctor_id(name_ar, specialties:specialty_id(name_ar))",
        )
        .eq("patient_id", pid)
        .gte("appointment_date", today)
        .in("status", ["new", "confirmed"])
        .order("appointment_date", { ascending: true })
        .limit(10),
      supabase
        .from("reminder_preferences")
        .select("wake_hour, sleep_hour")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const prefsRow = prefsRes.data;

    const activeMeds = (medsRes.data ?? []).filter((m) => {
      const status = ((m.status as string | null) ?? "").toLowerCase();
      if (status === "stopped" || status === "cancelled" || status === "completed") return false;
      const end = m.end_date as string | null;
      return !end || end >= today;
    });

    const facts = {
      patient: patientRes.data.full_name_ar,
      preferences: {
        wakeHour: data.preferredWakeHour ?? prefsRow?.wake_hour ?? 7,
        sleepHour: data.preferredSleepHour ?? prefsRow?.sleep_hour ?? 23,
      },
      activeMedications: activeMeds,
      allergies: allergyRes.data ?? [],
      upcomingAppointments: aptsRes.data ?? [],
      today,
    };

    const model = "google/gemini-2.5-flash";
    const system =
      "أنت مساعد صحي يقترح جدول تذكيرات دوائية آمنًا ومنطقيًا للمريض. اكتب بالعربية بلهجة واضحة. لا تصف جرعات جديدة ولا تغيّر الجرعات المسجلة؛ فقط وزّع الجرعات على أوقات مناسبة اعتمادًا على التكرار المذكور (مثل مرة يومياً، مرتين، كل 8 ساعات). أضف ملاحظات مثل مع/بدون طعام إذا ورد. اربط تذكيرات المواعيد القادمة بشكل مختصر (اليوم/الساعة/الإجراء). لا تخترع أدوية أو مواعيد غير موجودة.";
    const user = `بيانات المريض (JSON):\n${JSON.stringify(facts, null, 2)}\n\nأعد النتيجة بصيغة JSON وفق المخطط فقط. استخدم توقيت 24 ساعة بصيغة HH:MM. لكل دواء أعد تذكيرات كافية لتغطية تكراره اليومي.`;

    const schema = {
      type: "object",
      properties: {
        headline: { type: "string" },
        overview: { type: "string" },
        slots: {
          type: "array",
          minItems: 0,
          maxItems: 40,
          items: {
            type: "object",
            properties: {
              medication: { type: "string" },
              dosage: { type: ["string", "null"] },
              time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
              label: { type: "string" },
              note: { type: ["string", "null"] },
            },
            required: ["medication", "dosage", "time", "label"],
            additionalProperties: false,
          },
        },
        appointmentReminders: {
          type: "array",
          minItems: 0,
          maxItems: 10,
          items: {
            type: "object",
            properties: {
              appointment_id: { type: "string" },
              when: { type: "string" },
              action: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["appointment_id", "when", "action", "priority"],
            additionalProperties: false,
          },
        },
        warnings: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 5 },
      },
      required: ["headline", "overview", "slots", "appointmentReminders", "warnings"],
      additionalProperties: false,
    };

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [
          {
            type: "function",
            function: { name: "emit_plan", description: "خطة التذكيرات", parameters: schema },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_plan" } },
      }),
    });

    if (r.status === 429) throw new Error("تم تجاوز الحد. حاول لاحقاً.");
    if (r.status === 402) throw new Error("انتهت أرصدة الذكاء الاصطناعي.");
    if (!r.ok) throw new Error(`فشل الذكاء الاصطناعي: ${r.status}`);
    const j = (await r.json()) as {
      choices?: {
        message?: { tool_calls?: { function?: { arguments?: string } }[]; content?: string };
      }[];
    };
    const raw =
      j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      j.choices?.[0]?.message?.content ??
      "";
    let parsed: Partial<ReminderPlan> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    const plan: ReminderPlan = {
      headline: parsed.headline ?? "خطة التذكيرات اليومية",
      overview: parsed.overview ?? "",
      slots: parsed.slots ?? [],
      appointmentReminders: parsed.appointmentReminders ?? [],
      warnings: parsed.warnings ?? [],
      generatedAt: new Date().toISOString(),
      model,
    };

    // Persist each slot in the notifications log so the user can see history & status
    if (plan.slots.length > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rows = plan.slots.slice(0, 40).map((s) => ({
          audience: "user",
          user_id: userId,
          kind: "medication_reminder",
          title: s.medication,
          body: [s.dosage, s.label, s.note].filter(Boolean).join(" • "),
          channel: "in_app" as const,
          send_status: "sent" as const,
          sent_at: plan.generatedAt,
          metadata: {
            source: "ai-plan",
            time: s.time,
            label: s.label,
            model: plan.model,
            headline: plan.headline,
          },
        }));
        await supabaseAdmin.from("notifications").insert(rows);
      } catch {
        // logging is best-effort; the plan itself is still returned
      }
    }

    return plan;
  });

/* --------------------------- Reminder log --------------------------- */

export type ReminderLogEntry = {
  id: string;
  medication: string;
  detail: string | null;
  time: string | null;
  label: string | null;
  channel: string;
  send_status: string;
  sent_at: string | null;
  created_at: string;
  read_at: string | null;
  last_error: string | null;
};

export const getMedicationReminderLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReminderLogEntry[]> => {
    await assertPatientAccess(context.supabase, context.userId, "prescriptions");
    const { supabase, userId } = context;
    const res = await supabase
      .from("notifications")
      .select(
        "id, title, body, channel, send_status, sent_at, created_at, read_at, last_error, metadata",
      )
      .eq("audience", "user")
      .eq("user_id", userId)
      .eq("kind", "medication_reminder")
      .order("created_at", { ascending: false })
      .limit(200);
    if (res.error) return [];
    return (res.data ?? []).map((r) => {
      const meta = (r.metadata as { time?: string; label?: string } | null) ?? null;
      return {
        id: r.id as string,
        medication: (r.title as string) ?? "",
        detail: (r.body as string | null) ?? null,
        time: meta?.time ?? null,
        label: meta?.label ?? null,
        channel: (r.channel as string) ?? "in_app",
        send_status: (r.send_status as string) ?? "pending",
        sent_at: (r.sent_at as string | null) ?? null,
        created_at: (r.created_at as string) ?? new Date().toISOString(),
        read_at: (r.read_at as string | null) ?? null,
        last_error: (r.last_error as string | null) ?? null,
      };
    });
  });

/* --------------------------- Confirmations & adherence --------------------------- */

const ConfirmInput = z.object({ id: z.string().uuid(), taken: z.boolean().default(true) });

export const confirmMedicationReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => ConfirmInput.parse(i))
  .handler(async ({ context, data }): Promise<{ ok: true; taken_at: string | null }> => {
    await assertPatientAccess(context.supabase, context.userId, "prescriptions");
    const { supabase, userId } = context;
    const takenAt = data.taken ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: takenAt })
      .eq("id", data.id)
      .eq("user_id", userId)
      .eq("audience", "user")
      .eq("kind", "medication_reminder");
    if (error) throw new Error(error.message);
    return { ok: true, taken_at: takenAt };
  });

export type AdherenceDay = {
  date: string; // YYYY-MM-DD
  weekday: string; // Arabic short
  total: number;
  taken: number;
  pct: number; // 0..100
};

export type AdherenceStats = {
  days: AdherenceDay[];
  weekTotal: number;
  weekTaken: number;
  weekPct: number;
  streak: number; // consecutive recent days with pct>=80
  bestDay: AdherenceDay | null;
};

export const getAdherenceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdherenceStats> => {
    await assertPatientAccess(context.supabase, context.userId, "prescriptions");
    const { supabase, userId } = context;
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);

    const res = await supabase
      .from("notifications")
      .select("created_at, read_at")
      .eq("audience", "user")
      .eq("user_id", userId)
      .eq("kind", "medication_reminder")
      .gte("created_at", since.toISOString())
      .limit(1000);

    const rows = res.data ?? [];
    const weekdayAr = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const days: AdherenceDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, weekday: weekdayAr[d.getDay()], total: 0, taken: 0, pct: 0 });
    }
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const r of rows) {
      const key = ((r.created_at as string) ?? "").slice(0, 10);
      const bucket = byDate.get(key);
      if (!bucket) continue;
      bucket.total += 1;
      if (r.read_at) bucket.taken += 1;
    }
    let weekTotal = 0,
      weekTaken = 0;
    for (const d of days) {
      d.pct = d.total > 0 ? Math.round((d.taken / d.total) * 100) : 0;
      weekTotal += d.total;
      weekTaken += d.taken;
    }
    const weekPct = weekTotal > 0 ? Math.round((weekTaken / weekTotal) * 100) : 0;

    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (d.total === 0) continue;
      if (d.pct >= 80) streak += 1;
      else break;
    }
    const bestDay = days.reduce<AdherenceDay | null>(
      (acc, d) => (d.total > 0 && (!acc || d.pct > acc.pct) ? d : acc),
      null,
    );

    return { days, weekTotal, weekTaken, weekPct, streak, bestDay };
  });

/* --------------------------- Reminder preferences --------------------------- */

export type ReminderPreferences = {
  medication_lead_minutes: number;
  appointment_lead_minutes: number;
  wake_hour: number;
  sleep_hour: number;
  daily_repeat_days: number;
};

export const DEFAULT_REMINDER_PREFS: ReminderPreferences = {
  medication_lead_minutes: 10,
  appointment_lead_minutes: 120,
  wake_hour: 7,
  sleep_hour: 23,
  daily_repeat_days: 30,
};

export const getReminderPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReminderPreferences> => {
    await assertPatientAccess(context.supabase, context.userId, "prescriptions");
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("reminder_preferences")
      .select(
        "medication_lead_minutes, appointment_lead_minutes, wake_hour, sleep_hour, daily_repeat_days",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? DEFAULT_REMINDER_PREFS;
  });

const PrefsInput = z.object({
  medication_lead_minutes: z.number().int().min(0).max(240),
  appointment_lead_minutes: z.number().int().min(0).max(1440),
  wake_hour: z.number().int().min(4).max(11),
  sleep_hour: z.number().int().min(20).max(26),
  daily_repeat_days: z.number().int().min(7).max(90),
});

export const saveReminderPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => PrefsInput.parse(i))
  .handler(async ({ context, data }): Promise<ReminderPreferences> => {
    await assertPatientAccess(context.supabase, context.userId, "prescriptions");
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("reminder_preferences")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" })
      .select(
        "medication_lead_minutes, appointment_lead_minutes, wake_hour, sleep_hour, daily_repeat_days",
      )
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
