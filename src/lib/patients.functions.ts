import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  createPatientSignedUrl,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/storage/signed-url.server";

/**
 * Create a short-lived signed URL for a patient attachment.
 *
 * RBAC contract
 * -------------
 * The caller MUST pass a `patient_attachments.id`. The row is loaded under
 * the caller's RLS-scoped Supabase client, which enforces that:
 *   - patients can only reach their own attachments (patient_id -> profile_id)
 *   - staff can only reach attachments they're allowed to see per the
 *     patient_attachments RLS policies
 *
 * The `file_path` sent to storage is derived from that row, never from the
 * caller — so an attacker can't forge a path outside their access scope even
 * if they discover another patient's attachment id.
 */
const InputSchema = z.object({
  attachment_id: z.string().uuid(),
  expiresIn: z.number().int().min(30).max(3600).optional(),
});

export const getAttachmentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Under RLS: if the caller can't see this row, `.maybeSingle()` returns
    // null — indistinguishable from "does not exist". That is the intended
    // information-hiding behaviour.
    const { data: row, error } = await supabase
      .from("patient_attachments")
      .select("id, patient_id, file_path")
      .eq("id", data.attachment_id)
      .maybeSingle();
    if (error) throw new Error("تعذّر تنزيل الملف.");
    if (!row || !row.file_path) throw new Error("لا تملك صلاحية الوصول لهذا الملف.");

    const signed = await createPatientSignedUrl({
      client: supabase,
      bucket: "patient-files",
      path: row.file_path,
      ttlSeconds: data.expiresIn ?? SIGNED_URL_TTL_SECONDS,
      // The RLS-scoped SELECT above IS the authorization check.
      authorized: true,
      audit: async (event) => {
        if (!event.ok) return;
        const { logAppEvent } = await import("@/lib/audit-log.server");
        await logAppEvent(supabase, "patient_attachment_download", {
          attachment_id: row.id,
          patient_id: row.patient_id,
          actor_id: userId,
          bucket: "patient-files",
        });
        const { recordSensitiveAccess } = await import(
          "@/lib/audit/sensitive-access.server"
        );
        await recordSensitiveAccess({
          supabase,
          actorId: userId,
          action: "patient_attachment.download",
          entityType: "patient_attachment",
          entityId: row.id,
          permission: "portal.self",
          kind: "download",
          metadata: {
            patient_id: row.patient_id,
            bucket: "patient-files",
            expires_in: event.expiresIn,
          },
        });
      },
    });
    return { url: signed.url, expiresIn: signed.expiresIn, expiresAt: signed.expiresAt };
  });

/**
 * Generate a new MRN for a branch using the SECURITY DEFINER SQL function.
 * Returns a formatted patient file number (e.g. MAJ-0000123).
 */
export const generateMrn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { branchId: string }) => z.object({ branchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: mrn, error } = await context.supabase.rpc("generate_mrn", {
      _branch_id: data.branchId,
    });
    if (error) throw new Error(error.message);
    return { mrn: mrn as unknown as string };
  });
