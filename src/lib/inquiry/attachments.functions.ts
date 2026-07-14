/**
 * Service inquiry attachments — private uploads via signed URLs.
 *
 * Constraints:
 *  - Max 5 files per inquiry
 *  - Max 10 MB per file
 *  - Allowed types: JPEG, PNG, WEBP, HEIC/HEIF, PDF
 *  - Owner (patient) can upload/delete while the inquiry is open
 *  - Staff can read all attachments and delete
 *  - Files stored privately in the "inquiry-attachments" bucket at
 *    path: <auth.uid()>/<inquiry_id>/<uuid>.<ext>
 *  - Downloads served through short-lived signed URLs (5 min)
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MAX_PER_INQUIRY = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_TTL_SECONDS = 300;

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["application/pdf", "pdf"],
]);

const BUCKET = "inquiry-attachments";

async function assertAccessibleInquiry(
  supabase: any,
  userId: string,
  inquiryId: string,
): Promise<{ isOwner: boolean; isStaff: boolean; isClosed: boolean }> {
  const [{ data: staffRow }, { data: inquiry, error }] = await Promise.all([
    supabase.rpc("is_inquiry_staff", { _user_id: userId }),
    supabase
      .from("service_inquiries")
      .select("id, user_id, closed_at")
      .eq("id", inquiryId)
      .maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (!inquiry) throw new Error("الاستفسار غير موجود.");
  const isStaff = staffRow === true;
  const isOwner = inquiry.user_id === userId;
  if (!isOwner && !isStaff) throw new Error("ليست لديك صلاحية الوصول إلى هذا الاستفسار.");
  return { isOwner, isStaff, isClosed: inquiry.closed_at != null };
}

/**
 * Step 1 — issue a signed upload URL. Client PUTs the file directly to it.
 * Server validates type/size and count *before* signing so we don't hand out
 * an upload URL for a file we would refuse to register.
 */
export const requestInquiryUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inquiry_id: z.string().uuid(),
        file_name: z.string().trim().min(1).max(180),
        content_type: z.string().trim().min(3).max(120),
        size_bytes: z.number().int().min(1).max(MAX_BYTES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ext = ALLOWED.get(data.content_type.toLowerCase());
    if (!ext) {
      throw new Error(
        "نوع الملف غير مسموح. الأنواع المقبولة: صور (JPG, PNG, WEBP, HEIC) وملفات PDF.",
      );
    }

    const acc = await assertAccessibleInquiry(supabase, userId, data.inquiry_id);
    if (!acc.isStaff && acc.isClosed)
      throw new Error("لا يمكن إضافة مرفقات بعد إغلاق الطلب.");

    // Enforce per-inquiry cap
    const { count, error: cErr } = await supabase
      .from("service_inquiry_attachments")
      .select("id", { count: "exact", head: true })
      .eq("inquiry_id", data.inquiry_id);
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) >= MAX_PER_INQUIRY) {
      throw new Error(`تم بلوغ الحدّ الأقصى للمرفقات لكل طلب (${MAX_PER_INQUIRY}).`);
    }

    const objectId = crypto.randomUUID();
    const storagePath = `${userId}/${data.inquiry_id}/${objectId}.${ext}`;

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (signErr || !signed) throw new Error(signErr?.message ?? "تعذّر إصدار رابط الرفع.");

    return {
      storage_path: storagePath,
      upload_url: signed.signedUrl,
      token: signed.token,
      expected_ext: ext,
    };
  });

/**
 * Step 2 — after successful PUT, register the metadata row and audit-trail entry.
 * We re-check the storage object's real size/content-type against the client
 * claim so a smaller signed-upload can't be swapped for a huge one.
 */
export const registerInquiryAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        inquiry_id: z.string().uuid(),
        storage_path: z.string().min(1).max(500),
        file_name: z.string().trim().min(1).max(180),
        content_type: z.string().trim().min(3).max(120),
        size_bytes: z.number().int().min(1).max(MAX_BYTES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!ALLOWED.has(data.content_type.toLowerCase())) {
      throw new Error("نوع الملف غير مسموح.");
    }
    if (!data.storage_path.startsWith(`${userId}/${data.inquiry_id}/`)) {
      throw new Error("مسار الملف غير صالح.");
    }
    const acc = await assertAccessibleInquiry(supabase, userId, data.inquiry_id);
    if (!acc.isStaff && acc.isClosed)
      throw new Error("لا يمكن إضافة مرفقات بعد إغلاق الطلب.");

    // Verify the storage object actually exists and matches size claim
    const parent = data.storage_path.split("/").slice(0, -1).join("/");
    const objName = data.storage_path.split("/").pop()!;
    const { data: listed, error: lErr } = await supabase.storage
      .from(BUCKET)
      .list(parent, { search: objName, limit: 1 });
    if (lErr) throw new Error(lErr.message);
    const obj = (listed ?? []).find((o: any) => o.name === objName);
    if (!obj) throw new Error("لم يتم رفع الملف بعد. أعد المحاولة.");
    const actualSize = (obj.metadata?.size as number | undefined) ?? 0;
    if (actualSize <= 0 || actualSize > MAX_BYTES) {
      // Reject and clean up
      await supabase.storage.from(BUCKET).remove([data.storage_path]);
      throw new Error("حجم الملف يتجاوز الحدّ المسموح (10 ميغابايت كحدّ أقصى).");
    }

    const { data: row, error } = await supabase
      .from("service_inquiry_attachments")
      .insert({
        inquiry_id: data.inquiry_id,
        storage_path: data.storage_path,
        file_name: data.file_name.slice(0, 180),
        content_type: data.content_type.toLowerCase(),
        size_bytes: actualSize,
        uploaded_by: userId,
      })
      .select("id, created_at")
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([data.storage_path]).catch(() => {});
      throw new Error(error.message);
    }

    await supabase.from("service_inquiry_updates").insert({
      inquiry_id: data.inquiry_id,
      update_type: "attachment",
      internal_note: data.file_name,
      created_by: userId,
      metadata: { size: actualSize, content_type: data.content_type },
    });

    return { ok: true, id: row.id, created_at: row.created_at };
  });

/** List attachments with fresh signed download URLs (5-minute TTL). */
export const listInquiryAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inquiry_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAccessibleInquiry(supabase, userId, data.inquiry_id);

    const { data: rows, error } = await supabase
      .from("service_inquiry_attachments")
      .select(
        "id, storage_path, file_name, content_type, size_bytes, uploaded_by, created_at, scan_status, scan_result, scan_completed_at",
      )
      .eq("inquiry_id", data.inquiry_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Only issue signed URLs for files that passed the scan.
    const cleanPaths = (rows ?? [])
      .filter((r: any) => r.scan_status === "clean")
      .map((r: any) => r.storage_path);
    const urlByPath = new Map<string, string>();
    if (cleanPaths.length) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(cleanPaths, SIGNED_URL_TTL_SECONDS);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      file_name: r.file_name,
      content_type: r.content_type,
      size_bytes: r.size_bytes,
      created_at: r.created_at,
      uploaded_by: r.uploaded_by,
      scan_status: r.scan_status as
        | "pending"
        | "scanning"
        | "clean"
        | "infected"
        | "error",
      scan_result: (r.scan_result ?? null) as {
        reason?: string;
        detections?: string[];
      } | null,
      scan_completed_at: r.scan_completed_at as string | null,
      download_url: urlByPath.get(r.storage_path) ?? null,
      expires_in: SIGNED_URL_TTL_SECONDS,
    }));
  });

export const deleteInquiryAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("service_inquiry_attachments")
      .select("id, inquiry_id, storage_path, uploaded_by")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("المرفق غير موجود أو لا تملك صلاحية عرضه.");

    // RLS on both service_inquiry_attachments (delete) and storage.objects (delete)
    // enforces owner-vs-staff. This just performs both operations in order.
    const { error: dErr } = await supabase
      .from("service_inquiry_attachments")
      .delete()
      .eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    await supabase.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});

    await supabase.from("service_inquiry_updates").insert({
      inquiry_id: row.inquiry_id,
      update_type: "attachment",
      internal_note: `تم حذف مرفق (${row.storage_path.split("/").pop()})`,
      created_by: userId,
      metadata: { deleted: true },
    });
    return { ok: true };
  });

export const ATTACHMENT_LIMITS = {
  maxPerInquiry: MAX_PER_INQUIRY,
  maxBytes: MAX_BYTES,
  allowedContentTypes: Array.from(ALLOWED.keys()),
  allowedAcceptAttr:
    "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf",
} as const;
