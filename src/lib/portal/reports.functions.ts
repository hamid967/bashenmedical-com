/**
 * Unified medical reports for the patient portal.
 * Reads from public.medical_reports as the current user (RLS-gated).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPatientAccess } from "@/lib/patient/authz.server";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/download-error";
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
    await assertPatientAccess(context.supabase, context.userId, "reports");
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
  .validator((i: unknown) => FileInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertPatientAccess(context.supabase, context.userId, "reports");
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const logAttempt = async (
      status: "success" | "failure",
      reason?: string,
      extra?: Record<string, unknown>,
    ) => {
      try {
        await supabaseAdmin.from("audit_logs").insert({
          actor_id: userId,
          actor_role: "patient",
          action: "medical_report.download",
          entity_type: "medical_report",
          entity_id: data.id,
          metadata: {
            version: "current",
            ttl_seconds: 60,
            status,
            reason: reason ?? null,
            ...extra,
          },
        });
      } catch {
        /* audit logging is best-effort */
      }
    };

    try {
      const patientRes = await supabase
        .from("patients")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle();
      const patientId = patientRes.data?.id;
      if (!patientId) throw new Error("لا يوجد ملف مريض مرتبط.");

      const reportRes = await supabase
        .from("medical_reports")
        .select("file_path, status, revoked_at, patient_id, report_type, title_ar")
        .eq("id", data.id)
        .maybeSingle();
      const r = reportRes.data as any;
      if (!r || r.patient_id !== patientId) throw new Error("التقرير غير موجود.");
      if (r.status !== "published" || r.revoked_at) throw new Error("التقرير غير متاح للتنزيل.");
      if (!r.file_path) throw new Error("لا يوجد ملف مرفق بهذا التقرير.");

      const downloadName = buildDownloadName(r.title_ar, r.report_type, r.file_path);
      const { data: signed, error } = await supabaseAdmin.storage
        .from("medical-reports")
        .createSignedUrl(r.file_path, SIGNED_URL_TTL_SECONDS, { download: downloadName });
      if (error) throw new Error(error.message);

      await logAttempt("success");
      return { url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS };
    } catch (err: any) {
      await logAttempt("failure", err?.message ?? "unknown");
      throw err;
    }
  });

function buildDownloadName(title: string | null, type: string, path: string): string {
  const ext = (path.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const base =
    (title ?? type ?? "report")
      .replace(/[\\/:*?"<>|\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "report";
  return `${base}.${ext}`;
}

export type MyMedicalReportDetail = MyMedicalReport & {
  created_at: string;
  updated_at: string;
  appointment_id: string | null;
  appointment_date: string | null;
  branch_name_ar: string | null;
  versions: Array<{
    version_number: number;
    changed_at: string;
    summary: string | null;
    has_file: boolean;
  }>;
};

export const getMyMedicalReportDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => FileInput.parse(i))
  .handler(async ({ context, data }): Promise<MyMedicalReportDetail> => {
    await assertPatientAccess(context.supabase, context.userId, "reports");
    const { supabase, userId } = context;

    const patientRes = await supabase
      .from("patients")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    const patientId = patientRes.data?.id;
    if (!patientId) throw new Error("لا يوجد ملف مريض مرتبط.");

    const { data: r, error } = await supabase
      .from("medical_reports")
      .select(
        "id, report_type, title_ar, title_en, summary, file_path, status, published_at, is_demo, created_at, updated_at, appointment_id, patient_id, doctors:doctor_id(name_ar), appointments:appointment_id(appointment_date, branches:branch_id(name_ar))",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!r || (r as any).patient_id !== patientId) throw new Error("التقرير غير موجود.");
    if ((r as any).status !== "published") throw new Error("التقرير غير متاح.");

    // Versions are staff-only via RLS; read with admin after ownership check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: versions } = await supabaseAdmin
      .from("report_versions")
      .select("version_number, changed_at, summary, file_path")
      .eq("report_id", data.id)
      .order("version_number", { ascending: false });

    return {
      id: (r as any).id,
      report_type: (r as any).report_type,
      title_ar: (r as any).title_ar,
      title_en: (r as any).title_en,
      summary: (r as any).summary,
      file_path: (r as any).file_path,
      status: (r as any).status,
      published_at: (r as any).published_at,
      is_demo: !!(r as any).is_demo,
      doctor_name_ar: (r as any).doctors?.name_ar ?? null,
      created_at: (r as any).created_at,
      updated_at: (r as any).updated_at,
      appointment_id: (r as any).appointment_id,
      appointment_date: (r as any).appointments?.appointment_date ?? null,
      branch_name_ar: (r as any).appointments?.branches?.name_ar ?? null,
      versions: (versions ?? []).map((v: any) => ({
        version_number: v.version_number,
        changed_at: v.changed_at,
        summary: v.summary,
        has_file: !!v.file_path,
      })),
    };
  });

const VersionInput = z.object({
  report_id: z.string().uuid(),
  version_number: z.number().int().min(1),
});

export const getMyMedicalReportVersionFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => VersionInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertPatientAccess(context.supabase, context.userId, "reports");
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const logAttempt = async (status: "success" | "failure", reason?: string) => {
      try {
        await supabaseAdmin.from("audit_logs").insert({
          actor_id: userId,
          actor_role: "patient",
          action: "medical_report.download",
          entity_type: "medical_report",
          entity_id: data.report_id,
          metadata: {
            version: data.version_number,
            ttl_seconds: 60,
            status,
            reason: reason ?? null,
          },
        });
      } catch {
        /* best-effort */
      }
    };

    try {
      const patientRes = await supabase
        .from("patients")
        .select("id")
        .eq("profile_id", userId)
        .maybeSingle();
      const patientId = patientRes.data?.id;
      if (!patientId) throw new Error("لا يوجد ملف مريض مرتبط.");

      const reportRes = await supabase
        .from("medical_reports")
        .select("patient_id, status, revoked_at")
        .eq("id", data.report_id)
        .maybeSingle();
      const rr = reportRes.data as any;
      if (!rr || rr.patient_id !== patientId) throw new Error("التقرير غير موجود.");
      if (rr.status !== "published" || rr.revoked_at) throw new Error("التقرير غير متاح.");

      const { data: v } = await supabaseAdmin
        .from("report_versions")
        .select("file_path")
        .eq("report_id", data.report_id)
        .eq("version_number", data.version_number)
        .maybeSingle();
      if (!v?.file_path) throw new Error("لا يوجد ملف لهذه النسخة.");

      const { data: meta } = await supabaseAdmin
        .from("medical_reports")
        .select("title_ar, report_type")
        .eq("id", data.report_id)
        .maybeSingle();
      const baseName = buildDownloadName(
        (meta as any)?.title_ar ?? null,
        (meta as any)?.report_type ?? "report",
        v.file_path,
      );
      const dotIdx = baseName.lastIndexOf(".");
      const downloadName =
        dotIdx > 0
          ? `${baseName.slice(0, dotIdx)}-v${data.version_number}${baseName.slice(dotIdx)}`
          : `${baseName}-v${data.version_number}`;

      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from("medical-reports")
        .createSignedUrl(v.file_path, SIGNED_URL_TTL_SECONDS, { download: downloadName });
      if (sErr) throw new Error(sErr.message);

      await logAttempt("success");
      return { url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS };
    } catch (err: any) {
      await logAttempt("failure", err?.message ?? "unknown");
      throw err;
    }
  });

export type MyReportDownloadEntry = {
  id: string;
  created_at: string;
  report_id: string | null;
  report_title_ar: string | null;
  report_type: ReportType | null;
  version: string | number;
  status: "success" | "failure" | "unknown";
  reason: string | null;
};

const DownloadsInput = z.object({
  limit: z.number().int().min(1).max(200).default(100).optional(),
  status: z.enum(["all", "success", "failure"]).default("all").optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().max(120).optional(),
});

export const listMyReportDownloads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => DownloadsInput.parse(i ?? {}))
  .handler(async ({ context, data }): Promise<MyReportDownloadEntry[]> => {
    await assertPatientAccess(context.supabase, context.userId, "reports");
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("audit_logs")
      .select("id, created_at, entity_id, metadata")
      .eq("actor_id", userId)
      .eq("action", "medical_report.download")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.entity_id).filter(Boolean)));
    let titles = new Map<string, { title_ar: string | null; report_type: ReportType | null }>();
    if (ids.length) {
      const { data: reps } = await supabaseAdmin
        .from("medical_reports")
        .select("id, title_ar, report_type")
        .in("id", ids);
      titles = new Map(
        (reps ?? []).map((r: any) => [r.id, { title_ar: r.title_ar, report_type: r.report_type }]),
      );
    }

    const needle = data.q?.trim().toLowerCase() ?? "";
    return (rows ?? [])
      .map((r: any): MyReportDownloadEntry => {
        const m = (r.metadata ?? {}) as Record<string, unknown>;
        const t = r.entity_id ? titles.get(r.entity_id) : undefined;
        const status =
          (m.status as string) === "success" || (m.status as string) === "failure"
            ? (m.status as "success" | "failure")
            : "unknown";
        return {
          id: r.id,
          created_at: r.created_at,
          report_id: r.entity_id ?? null,
          report_title_ar: t?.title_ar ?? null,
          report_type: t?.report_type ?? null,
          version: (m.version as string | number) ?? "current",
          status,
          reason: (m.reason as string) ?? null,
        };
      })
      .filter((e) => {
        if (data.status && data.status !== "all" && e.status !== data.status) return false;
        if (!needle) return true;
        return (
          (e.report_title_ar ?? "").toLowerCase().includes(needle) ||
          (e.report_type ?? "").toLowerCase().includes(needle) ||
          (e.reason ?? "").toLowerCase().includes(needle)
        );
      });
  });
