/**
 * Owner — Media Library (Site Builder).
 * Upload / list / delete images in bucket `site-media` and index rows in
 * `public.media_library`.
 *
 * Access:
 *  - list / upload: super_admin OR content_manager
 *  - delete: super_admin only
 *
 * Public embedding: images are served publicly via `/api/public/media/$path`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertContentAccess, assertOwnerOnly } from "./_access";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function sanitizeName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  return base.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "file";
}
function extFromMime(mime: string): string {
  return mime === "image/jpeg" ? "jpg"
    : mime === "image/png" ? "png"
    : mime === "image/webp" ? "webp"
    : mime === "image/gif" ? "gif"
    : mime === "image/svg+xml" ? "svg"
    : "bin";
}

export const listOwnerMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("media_library")
      .select("id, storage_path, file_name, mime_type, size_bytes, alt_text, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      ...r,
      url: `/api/public/media/${r.storage_path}`,
    }));
  });

export const uploadOwnerMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      file_name: z.string().min(1).max(200),
      mime_type: z.string().min(1).max(100),
      data_base64: z.string().min(1),
      alt_text: z.string().max(200).optional().default(""),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);

    if (!ALLOWED_MIME.has(data.mime_type)) {
      throw new Error("نوع الملف غير مدعوم. الصور المسموحة: PNG/JPG/WEBP/GIF/SVG.");
    }
    const bytes = Buffer.from(data.data_base64, "base64");
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error("حجم الملف يتجاوز الحد الأقصى (8MB).");
    }

    const key = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${sanitizeName(data.file_name)}.${extFromMime(data.mime_type)}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from("site-media")
      .upload(key, bytes, { contentType: data.mime_type, upsert: false });
    if (upErr) throw new Error(`تعذّر رفع الملف: ${upErr.message}`);

    const { data: row, error } = await context.supabase
      .from("media_library")
      .insert({
        storage_path: key,
        file_name: data.file_name.slice(0, 200),
        mime_type: data.mime_type,
        size_bytes: bytes.byteLength,
        alt_text: data.alt_text || null,
        uploaded_by: context.userId,
      })
      .select("id, storage_path, file_name, mime_type, size_bytes, alt_text, created_at")
      .single();
    if (error) {
      // Best-effort cleanup
      await supabaseAdmin.storage.from("site-media").remove([key]).catch(() => {});
      throw new Error(error.message);
    }

    return { ...row, url: `/api/public/media/${row.storage_path}` };
  });

export const deleteOwnerMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId);
    const { data: row, error: getErr } = await context.supabase
      .from("media_library")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!row) throw new Error("العنصر غير موجود.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("site-media").remove([row.storage_path]).catch(() => {});

    const { error } = await context.supabase.from("media_library").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
