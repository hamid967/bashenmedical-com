import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Create a short-lived signed URL for a patient attachment.
 * Uses the caller's supabase client (RLS-scoped) so unauthorized users can't
 * generate URLs for files they can't access — storage policies additionally guard.
 */
export const getAttachmentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { path: string; expiresIn?: number }) =>
    z
      .object({
        path: z.string().min(1).max(500),
        expiresIn: z.number().int().min(30).max(3600).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("patient-files")
      .createSignedUrl(data.path, data.expiresIn ?? 300);
    if (error || !signed?.signedUrl) {
      throw new Error("تعذّر إنشاء رابط تنزيل الملف.");
    }
    return { url: signed.signedUrl };
  });

/**
 * Generate a new MRN for a branch using the SECURITY DEFINER SQL function.
 * Returns a formatted patient file number (e.g. MAJ-0000123).
 */
export const generateMrn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { branchId: string }) =>
    z.object({ branchId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: mrn, error } = await context.supabase.rpc("generate_mrn", {
      _branch_id: data.branchId,
    });
    if (error) throw new Error(error.message);
    return { mrn: mrn as unknown as string };
  });
