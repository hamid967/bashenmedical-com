/**
 * Dependent relationship verification workflow.
 *
 * Guardians submit a request with supporting documents. Staff (admin /
 * super_admin / reception) mark it under_review / approved / rejected.
 * A DB trigger keeps `dependents.verification_status` in sync.
 *
 * Docs live in the private `dependent-verification-docs` bucket at
 *   <guardian_uid>/<request_id>/<uuid>.<ext>
 * Downloads use short-lived signed URLs (5 min).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "dependent-verification-docs";
const MAX_DOCS = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL = 300;

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["application/pdf", "pdf"],
]);

const RelationshipEnum = z.enum(["child", "spouse", "parent", "sibling", "other"]);

export type VerificationStatus =
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "cancelled";

export type VerificationDocument = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  download_url: string | null;
};

export type VerificationRequest = {
  id: string;
  dependent_id: string;
  status: VerificationStatus;
  relationship_claimed: string;
  national_id_last4: string | null;
  guardian_notes: string | null;
  decision_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  documents: VerificationDocument[];
};

/* -------------------- submitDependentVerification -------------------- */
export const submitDependentVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        dependent_id: z.string().uuid(),
        relationship_claimed: RelationshipEnum,
        national_id_last4: z
          .string()
          .trim()
          .regex(/^\d{4}$/)
          .optional()
          .nullable(),
        guardian_notes: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Refuse if there's already an open request for this dependent.
    const { data: open } = await supabase
      .from("dependent_verification_requests")
      .select("id")
      .eq("dependent_id", data.dependent_id)
      .eq("guardian_user_id", userId)
      .in("status", ["submitted", "under_review"])
      .maybeSingle();
    if (open?.id) {
      throw new Error("لديك طلب توثيق قيد المعالجة لهذا التابع.");
    }
    const { data: row, error } = await supabase
      .from("dependent_verification_requests")
      .insert({
        dependent_id: data.dependent_id,
        guardian_user_id: userId,
        relationship_claimed: data.relationship_claimed,
        national_id_last4: data.national_id_last4 ?? null,
        guardian_notes: data.guardian_notes ?? null,
        status: "submitted",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/* -------------------- requestVerificationUploadUrl -------------------- */
export const requestVerificationUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        content_type: z.string().trim().min(3).max(120),
        size_bytes: z.number().int().min(1).max(MAX_BYTES),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const ext = ALLOWED.get(data.content_type.toLowerCase());
    if (!ext) throw new Error("نوع الملف غير مسموح (JPG/PNG/WEBP/HEIC/PDF).");

    const { data: req, error } = await supabase
      .from("dependent_verification_requests")
      .select("id, status")
      .eq("id", data.request_id)
      .eq("guardian_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("الطلب غير موجود.");
    if (!["submitted", "under_review"].includes(req.status)) {
      throw new Error("لا يمكن إضافة مرفقات لطلب مكتمل.");
    }

    const { count } = await supabase
      .from("dependent_verification_documents")
      .select("id", { count: "exact", head: true })
      .eq("request_id", data.request_id);
    if ((count ?? 0) >= MAX_DOCS) {
      throw new Error(`تم بلوغ الحدّ الأقصى للمرفقات (${MAX_DOCS}).`);
    }

    const objectId = crypto.randomUUID();
    const storagePath = `${userId}/${data.request_id}/${objectId}.${ext}`;
    const { data: signed, error: sErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (sErr || !signed) throw new Error(sErr?.message ?? "تعذّر إصدار رابط الرفع.");
    return {
      storage_path: storagePath,
      upload_url: signed.signedUrl,
      token: signed.token,
    };
  });

/* -------------------- registerVerificationDocument -------------------- */
export const registerVerificationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) =>
    z
      .object({
        request_id: z.string().uuid(),
        storage_path: z.string().min(1).max(500),
        file_name: z.string().trim().min(1).max(180),
        content_type: z.string().trim().min(3).max(120),
        size_bytes: z.number().int().min(1).max(MAX_BYTES),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (!ALLOWED.has(data.content_type.toLowerCase())) {
      throw new Error("نوع الملف غير مسموح.");
    }
    if (!data.storage_path.startsWith(`${userId}/${data.request_id}/`)) {
      throw new Error("مسار الملف غير صالح.");
    }
    // Confirm the object exists in storage.
    const parent = data.storage_path.split("/").slice(0, -1).join("/");
    const name = data.storage_path.split("/").pop()!;
    const { data: listed, error: lErr } = await supabase.storage
      .from(BUCKET)
      .list(parent, { search: name, limit: 1 });
    if (lErr) throw new Error(lErr.message);
    const obj = (listed ?? []).find((o: any) => o.name === name);
    if (!obj) throw new Error("لم يتم رفع الملف بعد.");
    const actualSize = (obj.metadata?.size as number | undefined) ?? 0;
    if (actualSize <= 0 || actualSize > MAX_BYTES) {
      await supabase.storage.from(BUCKET).remove([data.storage_path]);
      throw new Error("حجم الملف يتجاوز الحدّ المسموح (10 ميغابايت).");
    }
    const { data: row, error } = await supabase
      .from("dependent_verification_documents")
      .insert({
        request_id: data.request_id,
        guardian_user_id: userId,
        storage_path: data.storage_path,
        file_name: data.file_name.slice(0, 180),
        content_type: data.content_type.toLowerCase(),
        size_bytes: actualSize,
      })
      .select("id, created_at")
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([data.storage_path]).catch(() => {});
      throw new Error(error.message);
    }
    return { id: row.id as string, created_at: row.created_at as string };
  });

/* -------------------- deleteVerificationDocument -------------------- */
export const deleteVerificationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("dependent_verification_documents")
      .select("id, request_id, storage_path, guardian_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.guardian_user_id !== userId) {
      throw new Error("المرفق غير موجود.");
    }
    // Only allow deletion when parent request is still open.
    const { data: req } = await supabase
      .from("dependent_verification_requests")
      .select("status")
      .eq("id", row.request_id)
      .maybeSingle();
    if (!req || !["submitted", "under_review"].includes(req.status)) {
      throw new Error("لا يمكن حذف مرفق بعد اكتمال المراجعة.");
    }
    const { error: dErr } = await supabase
      .from("dependent_verification_documents")
      .delete()
      .eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    await supabase.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
    return { ok: true as const };
  });

/* -------------------- cancelVerificationRequest -------------------- */
export const cancelVerificationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("dependent_verification_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("guardian_user_id", userId)
      .in("status", ["submitted", "under_review"]);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* -------------------- listDependentVerificationRequests -------------------- */
export const listDependentVerificationRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ dependent_id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<VerificationRequest[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("dependent_verification_requests")
      .select(
        "id, dependent_id, status, relationship_claimed, national_id_last4, guardian_notes, decision_notes, reviewed_at, created_at, updated_at",
      )
      .eq("dependent_id", data.dependent_id)
      .eq("guardian_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];

    const ids = rows.map((r: any) => r.id);
    const { data: docs, error: dErr } = await supabase
      .from("dependent_verification_documents")
      .select("id, request_id, storage_path, file_name, content_type, size_bytes, created_at")
      .in("request_id", ids)
      .order("created_at", { ascending: false });
    if (dErr) throw new Error(dErr.message);

    const paths = (docs ?? []).map((d: any) => d.storage_path);
    const urlByPath = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      }
    }
    const byReq = new Map<string, VerificationDocument[]>();
    for (const d of docs ?? []) {
      const arr = byReq.get(d.request_id) ?? [];
      arr.push({
        id: d.id,
        file_name: d.file_name,
        content_type: d.content_type,
        size_bytes: d.size_bytes,
        created_at: d.created_at,
        download_url: urlByPath.get(d.storage_path) ?? null,
      });
      byReq.set(d.request_id, arr);
    }
    return rows.map((r: any) => ({
      id: r.id,
      dependent_id: r.dependent_id,
      status: r.status,
      relationship_claimed: r.relationship_claimed,
      national_id_last4: r.national_id_last4,
      guardian_notes: r.guardian_notes,
      decision_notes: r.decision_notes,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      documents: byReq.get(r.id) ?? [],
    }));
  });

export const VERIFICATION_LIMITS = {
  maxDocs: MAX_DOCS,
  maxBytes: MAX_BYTES,
  allowedContentTypes: Array.from(ALLOWED.keys()),
  allowedAcceptAttr:
    "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf",
} as const;
