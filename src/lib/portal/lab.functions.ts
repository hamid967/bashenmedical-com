/**
 * Patient laboratory results: fetch reports, signed file URLs, share with doctor.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LabReport = {
  id: string;
  title: string | null;
  test_type: string | null;
  summary: string | null;
  status: string | null;
  report_date: string | null;
  file_path: string | null;
  ordered_by: string | null;
  doctor_name: string | null;
  released_at: string | null;
};

export const getMyLabReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const patientRes = await supabase
      .from("patients")
      .select("id, full_name_ar")
      .eq("profile_id", userId)
      .maybeSingle();
    const patient = patientRes.data;
    if (!patient) return { reports: [] as LabReport[] };

    const labs = await supabase
      .from("lab_reports")
      .select("id, title, test_type, summary, status, report_date, file_path, ordered_by, released_at, doctors:ordered_by(name_ar)")
      .eq("patient_id", patient.id)
      .not("released_at", "is", null)
      .order("report_date", { ascending: false })
      .limit(200);

    const reports: LabReport[] = (labs.data ?? []).map((r) => ({
      id: r.id as string,
      title: (r.title as string | null) ?? null,
      test_type: (r.test_type as string | null) ?? null,
      summary: (r.summary as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      report_date: (r.report_date as string | null) ?? null,
      file_path: (r.file_path as string | null) ?? null,
      ordered_by: (r.ordered_by as string | null) ?? null,
      released_at: (r.released_at as string | null) ?? null,
      doctor_name: ((r as { doctors?: { name_ar?: string | null } | null }).doctors?.name_ar as string | null) ?? null,
    }));

    return { reports };
  });

const FileSchema = z.object({ path: z.string().min(1).max(1024) });

export const getLabFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => FileSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const patientRes = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    const patientId = patientRes.data?.id;
    if (!patientId) throw new Error("لا يوجد ملف مريض مرتبط.");

    const owns = await supabase
      .from("lab_reports")
      .select("id")
      .eq("patient_id", patientId)
      .eq("file_path", data.path)
      .not("released_at", "is", null)
      .limit(1);
    const reportId = owns.data?.[0]?.id as string | undefined;
    if (!reportId) throw new Error("لا تملك صلاحية الوصول لهذا الملف.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("lab-reports")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);

    const { logAppEvent } = await import("@/lib/audit-log.server");
    await logAppEvent(supabase, "lab_report_download", {
      report_id: reportId,
      patient_id: patientId,
      file_path: data.path,
      bucket: "lab-reports",
    });

    return { url: signed.signedUrl, expiresIn: 300 };
  });

const ShareSchema = z.object({
  report_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
});

export const shareLabWithDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => ShareSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const patientRes = await supabase
      .from("patients")
      .select("id, full_name_ar, mrn, branch_id")
      .eq("profile_id", userId)
      .maybeSingle();
    const patient = patientRes.data;
    if (!patient) throw new Error("لا يوجد ملف مريض مرتبط.");

    const labRes = await supabase
      .from("lab_reports")
      .select("id, title, test_type, report_date")
      .eq("patient_id", patient.id)
      .eq("id", data.report_id)
      .not("released_at", "is", null)
      .maybeSingle();
    if (!labRes.data) throw new Error("تقرير المختبر غير موجود.");

    const docRes = await supabase
      .from("doctors")
      .select("id, name_ar, branch_id")
      .eq("id", data.doctor_id)
      .maybeSingle();
    if (!docRes.data) throw new Error("الطبيب غير موجود.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notifications").insert({
      audience: "staff",
      kind: "lab_shared",
      title: `مشاركة نتيجة مختبر — د. ${docRes.data.name_ar}`,
      body:
        `المريض ${patient.full_name_ar ?? ""} (رقم ${patient.mrn ?? "-"}) شارك تقرير "${
          labRes.data.title ?? labRes.data.test_type ?? "مختبر"
        }" بتاريخ ${labRes.data.report_date ?? ""}` +
        (data.note ? ` — ملاحظة: ${data.note}` : ""),
      branch_id: docRes.data.branch_id ?? patient.branch_id ?? null,
      metadata: {
        lab_report_id: labRes.data.id,
        patient_id: patient.id,
        doctor_id: docRes.data.id,
        shared_by_profile: userId,
        note: data.note ?? null,
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getLabShareDoctors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const res = await supabase
      .from("doctors")
      .select("id, name_ar, name_en, title_ar, specialty_id, specialties:specialty_id(name_ar)")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(200);
    return {
      doctors: (res.data ?? []).map((d) => ({
        id: d.id as string,
        name_ar: (d.name_ar as string) ?? "",
        name_en: (d.name_en as string | null) ?? null,
        title_ar: (d.title_ar as string | null) ?? null,
        specialty:
          ((d as { specialties?: { name_ar?: string | null } | null }).specialties?.name_ar as string | null) ?? null,
      })),
    };
  });
