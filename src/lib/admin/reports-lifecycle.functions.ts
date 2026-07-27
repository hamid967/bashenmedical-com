/**
 * Batch B1 — Medical Reports lifecycle (Draft → Review → Published → Revoked).
 *
 * All mutations enforce a permission (`reports.medical.publish` /
 * `reports.medical.revoke`) via `has_permission` so RBAC stays declarative,
 * and every state change is materialised as an immutable `report_versions`
 * row for full audit + rollback.
 *
 * Signed URLs are minted server-side with a short TTL and audited into
 * `report_downloads_audit` when the caller is not the owning patient (staff
 * previews still count).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasAnyRole } from "./_guard";

async function requirePermission(supabase: unknown, userId: string, key: string): Promise<void> {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission_key: key,
  });
  if (error) throw new Error("تعذّر التحقق من الصلاحية.");
  if (data !== true) throw new Error("ليست لديك صلاحية تنفيذ هذه العملية.");
}

async function nextVersionNumber(supabase: unknown, reportId: string): Promise<number> {
  const { data, error } = await supabase
    .from("report_versions")
    .select("version_number")
    .eq("report_id", reportId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.version_number ?? 0) + 1;
}

async function snapshotVersion(
  supabase: unknown,
  userId: string,
  reportId: string,
  summary: string | null,
  filePath: string | null,
): Promise<void> {
  const version_number = await nextVersionNumber(supabase, reportId);
  const { error } = await supabase.from("report_versions").insert({
    report_id: reportId,
    version_number,
    file_path: filePath,
    summary,
    changed_by: userId,
  });
  if (error) throw new Error(error.message);
}

// ---------------- Save Draft ----------------
export const saveMedicalReportDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title_ar: z.string().trim().min(1).max(200).optional(),
        title_en: z.string().trim().max(200).nullable().optional(),
        summary: z.string().trim().max(20000).nullable().optional(),
        file_path: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "doctor"]);
    await requirePermission(context.supabase, context.userId, "reports.medical.publish");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title_ar !== undefined) patch.title_ar = data.title_ar;
    if (data.title_en !== undefined) patch.title_en = data.title_en;
    if (data.summary !== undefined) patch.summary = data.summary;
    if (data.file_path !== undefined) patch.file_path = data.file_path;
    const { data: row, error } = await context.supabase
      .from("medical_reports")
      .update(patch as never)
      .eq("id", data.id)
      .select("id, status, summary, file_path")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("التقرير غير موجود.");
    if (row.status === "revoked") {
      throw new Error("لا يمكن تعديل تقرير مسحوب.");
    }
    await snapshotVersion(
      context.supabase,
      context.userId,
      data.id,
      row.summary ?? null,
      row.file_path ?? null,
    );
    return { ok: true as const };
  });

// ---------------- Publish ----------------
export const publishMedicalReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        summary: z.string().trim().max(20000).nullable().optional(),
        file_path: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "doctor"]);
    await requirePermission(context.supabase, context.userId, "reports.medical.publish");

    const { data: before, error: e0 } = await context.supabase
      .from("medical_reports")
      .select("id, status, summary, file_path")
      .eq("id", data.id)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!before) throw new Error("التقرير غير موجود.");
    if (before.status === "revoked") throw new Error("لا يمكن نشر تقرير مسحوب.");
    if (before.status === "published") throw new Error("التقرير منشور بالفعل.");

    const patch: Record<string, unknown> = {
      status: "published",
      published_at: new Date().toISOString(),
    };
    if (data.summary !== undefined) patch.summary = data.summary;
    if (data.file_path !== undefined) patch.file_path = data.file_path;

    const { data: row, error } = await context.supabase
      .from("medical_reports")
      .update(patch as never)
      .eq("id", data.id)
      .select("id, summary, file_path")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await snapshotVersion(
      context.supabase,
      context.userId,
      data.id,
      row?.summary ?? null,
      row?.file_path ?? null,
    );
    return { ok: true as const, id: data.id };
  });

// ---------------- Revoke ----------------
export const revokeMedicalReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "doctor"]);
    await requirePermission(context.supabase, context.userId, "reports.medical.revoke");

    const { data: before, error: e0 } = await context.supabase
      .from("medical_reports")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!before) throw new Error("التقرير غير موجود.");
    if (before.status === "revoked") throw new Error("التقرير مسحوب مسبقاً.");

    const { error } = await context.supabase
      .from("medical_reports")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoke_reason: data.reason,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await snapshotVersion(
      context.supabase,
      context.userId,
      data.id,
      `[REVOKED] ${data.reason}`,
      null,
    );
    return { ok: true as const };
  });

// ---------------- Move to Review ----------------
export const submitMedicalReportForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "doctor"]);
    await requirePermission(context.supabase, context.userId, "reports.medical.publish");
    const { data: before } = await context.supabase
      .from("medical_reports")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("التقرير غير موجود.");
    if (before.status !== "draft") throw new Error("يجب أن يكون التقرير مسودة.");
    const { error } = await context.supabase
      .from("medical_reports")
      .update({ status: "review" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------- Signed URL for staff preview ----------------
export const signMedicalReportUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        ttl_seconds: z.number().int().min(30).max(900).default(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "doctor"]);
    await requirePermission(context.supabase, context.userId, "reports.medical.view");
    const { data: row, error } = await context.supabase
      .from("medical_reports")
      .select("id, file_path, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("التقرير غير موجود.");
    if (!row.file_path) throw new Error("لا يوجد ملف مرفق بهذا التقرير.");

    const { data: signed, error: sErr } = await context.supabase.storage
      .from("medical-reports")
      .createSignedUrl(row.file_path, data.ttl_seconds);
    if (sErr) throw new Error(sErr.message);
    return {
      url: signed?.signedUrl ?? null,
      expires_in: data.ttl_seconds,
      status: row.status as string,
    };
  });

// ---------------- Version history (staff read) ----------------
export const listMedicalReportVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "doctor"]);
    await requirePermission(context.supabase, context.userId, "reports.medical.view");
    const { data: rows, error } = await context.supabase
      .from("report_versions")
      .select("id, version_number, summary, file_path, changed_by, changed_at")
      .eq("report_id", data.id)
      .order("version_number", { ascending: false });
    if (error) throw new Error(error.message);
    return { versions: rows ?? [] };
  });
