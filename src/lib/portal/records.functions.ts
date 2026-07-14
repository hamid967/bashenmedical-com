/**
 * Medical records timeline + signed file URLs + AI summary.
 * Patient-facing (uses requireSupabaseAuth + RLS scoped to the current user).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TimelineKind =
  | "visit"
  | "diagnosis"
  | "surgery"
  | "immunization"
  | "medication"
  | "allergy"
  | "lab"
  | "radiology"
  | "prescription"
  | "attachment";

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  date: string; // ISO date
  title: string;
  subtitle?: string | null;
  body?: string | null;
  meta?: Record<string, string | number | null>;
  file?: { bucket: string; path: string; mime?: string | null } | null;
  status?: string | null;
};

/* ------------------------- getMyMedicalRecords ------------------------- */

export const getMyMedicalRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const patientRes = await supabase
      .from("patients")
      .select("id, mrn, full_name_ar, full_name_en, date_of_birth, blood_type, gender")
      .eq("profile_id", userId)
      .maybeSingle();

    const patient = patientRes.data;
    if (!patient) {
      return { patient: null, items: [] as TimelineItem[] };
    }

    const [
      visitsRes,
      diagRes,
      surgRes,
      immRes,
      medsRes,
      allergyRes,
      labsRes,
      radRes,
      rxRes,
      attRes,
    ] = await Promise.all([
      supabase
        .from("patient_visits")
        .select("id, visit_date, chief_complaint, assessment, plan, doctor_id, doctors:doctor_id(name_ar)")
        .eq("patient_id", patient.id)
        .order("visit_date", { ascending: false })
        .limit(50),
      supabase
        .from("patient_medical_history")
        .select("id, condition, category, status, onset_date, resolution_date, notes")
        .eq("patient_id", patient.id)
        .order("onset_date", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("patient_surgeries")
        .select("id, procedure_name, surgery_date, hospital, surgeon_name, outcome, complications")
        .eq("patient_id", patient.id)
        .order("surgery_date", { ascending: false })
        .limit(50),
      supabase
        .from("patient_immunizations")
        .select("id, vaccine_name, dose_number, administered_on, next_due_on, provider_name, lot_number, notes")
        .eq("patient_id", patient.id)
        .order("administered_on", { ascending: false })
        .limit(100),
      supabase
        .from("patient_medications")
        .select("id, medication_name, dosage, frequency, start_date, end_date, status, prescribed_by_name, notes")
        .eq("patient_id", patient.id)
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase
        .from("patient_allergies")
        .select("id, allergen, reaction, severity, noted_on, notes")
        .eq("patient_id", patient.id)
        .order("noted_on", { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from("lab_reports")
        .select("id, title, test_type, summary, status, report_date, file_path, released_at")
        .eq("patient_id", patient.id)
        .not("released_at", "is", null)
        .order("report_date", { ascending: false })
        .limit(50),
      supabase
        .from("radiology_reports")
        .select("id, modality, body_part, findings, report_date, file_path, status, released_at")
        .eq("patient_id", patient.id)
        .not("released_at", "is", null)
        .order("report_date", { ascending: false })
        .limit(50),
      supabase
        .from("prescriptions")
        .select("id, medication, dosage, instructions, start_date, end_date, notes, status")
        .eq("patient_id", patient.id)
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from("patient_attachments")
        .select("id, title, category, file_path, mime_type, notes, created_at")
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const items: TimelineItem[] = [];

    for (const v of visitsRes.data ?? []) {
      const doc = (v as any).doctors?.name_ar as string | undefined;
      items.push({
        id: `visit-${v.id}`,
        kind: "visit",
        date: v.visit_date as string,
        title: v.chief_complaint || "زيارة عيادة",
        subtitle: doc ? `الطبيب: ${doc}` : null,
        body: v.assessment || v.plan || null,
      });
    }
    for (const d of diagRes.data ?? []) {
      items.push({
        id: `diag-${d.id}`,
        kind: "diagnosis",
        date: (d.onset_date as string) ?? new Date().toISOString().slice(0, 10),
        title: d.condition,
        subtitle: `${d.category ?? "—"} • ${d.status ?? ""}`,
        body: d.notes,
        status: d.status,
      });
    }
    for (const s of surgRes.data ?? []) {
      items.push({
        id: `surg-${s.id}`,
        kind: "surgery",
        date: s.surgery_date as string,
        title: s.procedure_name,
        subtitle: [s.hospital, s.surgeon_name].filter(Boolean).join(" • ") || null,
        body: s.complications || s.outcome,
      });
    }
    for (const i of immRes.data ?? []) {
      items.push({
        id: `imm-${i.id}`,
        kind: "immunization",
        date: i.administered_on as string,
        title: i.vaccine_name,
        subtitle: [
          i.dose_number ? `الجرعة ${i.dose_number}` : null,
          i.provider_name,
        ].filter(Boolean).join(" • ") || null,
        body: i.notes,
        meta: {
          next_due_on: (i.next_due_on as string | null) ?? null,
          lot_number: i.lot_number ?? null,
        },
      });
    }
    for (const m of medsRes.data ?? []) {
      items.push({
        id: `med-${m.id}`,
        kind: "medication",
        date: (m.start_date as string) ?? new Date().toISOString().slice(0, 10),
        title: m.medication_name,
        subtitle: [m.dosage, m.frequency].filter(Boolean).join(" • ") || null,
        body: m.notes,
        status: m.status,
      });
    }
    for (const a of allergyRes.data ?? []) {
      items.push({
        id: `allergy-${a.id}`,
        kind: "allergy",
        date: (a.noted_on as string) ?? new Date().toISOString().slice(0, 10),
        title: `حساسية: ${a.allergen}`,
        subtitle: a.reaction,
        body: a.notes,
        status: a.severity,
      });
    }
    for (const l of labsRes.data ?? []) {
      items.push({
        id: `lab-${l.id}`,
        kind: "lab",
        date: (l.report_date as string) ?? new Date().toISOString().slice(0, 10),
        title: l.title || "تقرير مختبر",
        subtitle: l.test_type,
        body: l.summary,
        status: l.status,
        file: l.file_path ? { bucket: "lab-reports", path: l.file_path } : null,
      });
    }
    for (const r of radRes.data ?? []) {
      items.push({
        id: `rad-${r.id}`,
        kind: "radiology",
        date: (r.report_date as string) ?? new Date().toISOString().slice(0, 10),
        title: [r.modality, r.body_part].filter(Boolean).join(" — ") || "تقرير أشعة",
        subtitle: r.modality,
        body: r.findings,
        status: r.status,
        file: r.file_path ? { bucket: "radiology-reports", path: r.file_path } : null,
      });
    }
    for (const p of rxRes.data ?? []) {
      items.push({
        id: `rx-${p.id}`,
        kind: "prescription",
        date: (p.start_date as string) ?? new Date().toISOString().slice(0, 10),
        title: p.medication,
        subtitle: [p.dosage, p.instructions].filter(Boolean).join(" • ") || null,
        body: p.notes,
      });
    }
    for (const t of attRes.data ?? []) {
      items.push({
        id: `att-${t.id}`,
        kind: "attachment",
        date: ((t.created_at as string) ?? "").slice(0, 10),
        title: t.title || "مرفق",
        subtitle: t.category,
        body: t.notes,
        file: t.file_path
          ? { bucket: "patient-files", path: t.file_path, mime: t.mime_type }
          : null,
      });
    }

    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    return { patient, items };
  });

/* -------------------------- getRecordFileUrl -------------------------- */

const FileSchema = z.object({
  bucket: z.enum(["lab-reports", "radiology-reports", "patient-files"]),
  path: z.string().min(1).max(1024),
});

export const getRecordFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => FileSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Verify patient owns this file: search all record tables for that file_path
    const patientRes = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    const patientId = patientRes.data?.id;
    if (!patientId) throw new Error("لا يوجد ملف مريض مرتبط.");

    let owns = false;
    if (data.bucket === "lab-reports") {
      const q = await supabase
        .from("lab_reports").select("id").eq("patient_id", patientId).eq("file_path", data.path)
        .not("released_at", "is", null).limit(1);
      owns = (q.data ?? []).length > 0;
    } else if (data.bucket === "radiology-reports") {
      const q = await supabase
        .from("radiology_reports").select("id").eq("patient_id", patientId).eq("file_path", data.path)
        .not("released_at", "is", null).limit(1);
      owns = (q.data ?? []).length > 0;
    } else {
      const q = await supabase
        .from("patient_attachments").select("id").eq("patient_id", patientId).eq("file_path", data.path).limit(1);
      owns = (q.data ?? []).length > 0;
    }
    if (!owns) throw new Error("لا تملك صلاحية الوصول لهذا الملف.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(data.bucket)
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, expiresIn: 300 };
  });

/* -------------------------- getRecordsAiSummary ------------------------ */

export type RecordsAiSummary = {
  headline: string;
  highlights: string[];
  followUps: { title: string; detail: string; priority: "high" | "medium" | "low" }[];
  generatedAt: string;
  model: string;
};

export const getRecordsAiSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecordsAiSummary> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("مفتاح الذكاء الاصطناعي غير مهيأ.");
    const { supabase, userId } = context;

    const patientRes = await supabase
      .from("patients")
      .select("id, date_of_birth, blood_type, gender")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!patientRes.data) throw new Error("لا يوجد ملف مريض مرتبط.");
    const pid = patientRes.data.id;

    const [diagRes, allergyRes, medsRes, immRes, labsRes] = await Promise.all([
      supabase.from("patient_medical_history").select("condition, status, category, onset_date").eq("patient_id", pid).limit(50),
      supabase.from("patient_allergies").select("allergen, reaction, severity").eq("patient_id", pid).limit(20),
      supabase.from("patient_medications").select("medication_name, dosage, frequency, status").eq("patient_id", pid).eq("status", "active").limit(50),
      supabase.from("patient_immunizations").select("vaccine_name, administered_on, next_due_on").eq("patient_id", pid).order("administered_on", { ascending: false }).limit(20),
      supabase.from("lab_reports").select("title, test_type, summary, report_date").eq("patient_id", pid).not("released_at", "is", null).order("report_date", { ascending: false }).limit(10),
    ]);

    const facts = {
      patient: {
        dob: patientRes.data.date_of_birth,
        blood_type: patientRes.data.blood_type,
        gender: patientRes.data.gender,
      },
      diagnoses: diagRes.data ?? [],
      allergies: allergyRes.data ?? [],
      activeMedications: medsRes.data ?? [],
      immunizations: immRes.data ?? [],
      recentLabs: labsRes.data ?? [],
    };

    const model = "google/gemini-2.5-flash";
    const system =
      "أنت مساعد طبي يقدم ملخصًا مبسطًا للمريض عن سجله الطبي. اكتب بالعربية بلهجة واضحة ومحترمة، بدون توصيات دوائية محددة، مع تنبيه لطيف بالمراجعة الدورية عند اللزوم. لا تخترع بيانات غير موجودة.";
    const user = `بيانات المريض (JSON):\n${JSON.stringify(facts, null, 2)}\n\nأعد النتيجة بصيغة JSON وفق المخطط فقط.`;

    const schema = {
      type: "object",
      properties: {
        headline: { type: "string" },
        highlights: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
        followUps: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["title", "detail", "priority"],
            additionalProperties: false,
          },
        },
      },
      required: ["headline", "highlights", "followUps"],
      additionalProperties: false,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: { name: "emit_summary", description: "ملخص المريض", parameters: schema },
        }],
        tool_choice: { type: "function", function: { name: "emit_summary" } },
      }),
    });

    if (res.status === 429) throw new Error("تم تجاوز الحد. حاول لاحقاً.");
    if (res.status === 402) throw new Error("انتهت أرصدة الذكاء الاصطناعي.");
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`فشل الذكاء الاصطناعي: ${res.status} ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: {
        message?: {
          tool_calls?: { function?: { arguments?: string } }[];
          content?: string;
        };
      }[];
    };
    const raw =
      json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
      json.choices?.[0]?.message?.content ??
      "";
    let parsed: Partial<RecordsAiSummary> = {};
    try { parsed = JSON.parse(raw); } catch { /* ignore */ }

    return {
      headline: parsed.headline ?? "ملخص السجل الطبي",
      highlights: parsed.highlights ?? [],
      followUps: parsed.followUps ?? [],
      generatedAt: new Date().toISOString(),
      model,
    };
  });
