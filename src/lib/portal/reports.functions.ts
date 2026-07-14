/**
 * Unified medical reports for the patient portal.
 * Reads from public.medical_reports as the current user (RLS-gated).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const REPORT_TYPES = [
  "lab",
  "radiology",
  "visit_summary",
  "discharge",
  "certificate",
  "referral",
  "other",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type MyMedicalReport = {
  id: string;
  report_type: ReportType;
  title_ar: string | null;
  title_en: string | null;
  summary: string | null;
  file_path: string | null;
  status: string;
  published_at: string | null;
  is_demo: boolean;
  doctor_name_ar: string | null;
};

export const listMyMedicalReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyMedicalReport[]> => {
    const { supabase, userId } = context;

    const patientRes = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    const patientId = patientRes.data?.id;
    if (!patientId) return [];

    const { data, error } = await supabase
      .from("medical_reports")
      .select(
        "id, report_type, title_ar, title_en, summary, file_path, status, published_at, is_demo, doctors:doctor_id(name_ar)",
      )
      .eq("patient_id", patientId)
      .eq("status", "published")
      .is("revoked_at", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      report_type: r.report_type,
      title_ar: r.title_ar,
      title_en: r.title_en,
      summary: r.summary,
      file_path: r.file_path,
      status: r.status,
      published_at: r.published_at,
      is_demo: !!r.is_demo,
      doctor_name_ar: r.doctors?.name_ar ?? null,
    }));
  });

const FileInput = z.object({ id: z.string().uuid() });

export const getMyMedicalReportFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => FileInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Verify current user owns the report via patients.profile_id — RLS also enforces this,
    // but we re-check to return a clear error before requesting the signed URL.
    const patientRes = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    const patientId = patientRes.data?.id;
    if (!patientId) throw new Error("لا يوجد ملف مريض مرتبط.");

    const reportRes = await supabase
      .from("medical_reports")
      .select("file_path, status, revoked_at, patient_id")
      .eq("id", data.id)
      .maybeSingle();
    const r = reportRes.data;
    if (!r || r.patient_id !== patientId) throw new Error("التقرير غير موجود.");
    if (r.status !== "published" || r.revoked_at) throw new Error("التقرير غير متاح للتنزيل.");
    if (!r.file_path) throw new Error("لا يوجد ملف مرفق بهذا التقرير.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("medical-reports")
      .createSignedUrl(r.file_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, expiresIn: 300 };
  });
