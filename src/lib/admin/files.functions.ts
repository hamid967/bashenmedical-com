/**
 * Admin — Files (Media Library).
 *
 * List/upload/delete files in bucket `site-media`, indexed via
 * `public.media_library`. Access is admin-scoped through `assertHasRole`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  return (
    base
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "file"
  );
}
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}
function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

export const listAdminFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        q: z.string().max(200).optional(),
        kind: z.enum(["all", "image", "other"]).optional().default("all"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    const { data: rows, error } = await context.supabase
      .from("media_library")
      .select(
        "id, storage_path, file_name, mime_type, size_bytes, width, height, alt_text, uploaded_by, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<any>;

    // Compute KPIs on the unfiltered set
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const kpis = {
      total: list.length,
      images: list.filter((r) => isImage(r.mime_type)).length,
      other: list.filter((r) => !isImage(r.mime_type)).length,
      total_bytes: list.reduce((acc, r) => acc + Number(r.size_bytes ?? 0), 0),
      uploaded_today: list.filter((r) => r.created_at >= todayIso).length,
    };

    // Apply filters
    const qLower = data.q?.trim().toLowerCase();
    const filtered = list.filter((r) => {
      if (data.kind === "image" && !isImage(r.mime_type)) return false;
      if (data.kind === "other" && isImage(r.mime_type)) return false;
      if (
        qLower &&
        !(
          r.file_name?.toLowerCase().includes(qLower) ||
          r.alt_text?.toLowerCase().includes(qLower) ||
          r.storage_path?.toLowerCase().includes(qLower)
        )
      )
        return false;
      return true;
    });

    return {
      kpis,
      rows: filtered.map((r) => ({
        ...r,
        url: `/api/public/media/${r.storage_path}`,
        is_image: isImage(r.mime_type),
      })),
    };
  });

export const getAdminFile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    const { data: row, error } = await context.supabase
      .from("media_library")
      .select(
        "id, storage_path, file_name, mime_type, size_bytes, width, height, alt_text, uploaded_by, created_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الملف غير موجود.");

    let uploader: { id: string; name: string | null; email: string | null } | null = null;
    if (row.uploaded_by) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", row.uploaded_by)
        .maybeSingle();
      if (prof)
        uploader = {
          id: prof.id,
          name: (prof as any).full_name ?? null,
          email: (prof as any).email ?? null,
        };
    }

    return {
      file: {
        ...row,
        url: `/api/public/media/${row.storage_path}`,
        is_image: isImage(row.mime_type),
      },
      uploader,
    };
  });

export const uploadAdminFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        file_name: z.string().min(1).max(200),
        mime_type: z.string().min(1).max(100),
        data_base64: z.string().min(1),
        alt_text: z.string().max(200).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    if (!ALLOWED_MIME.has(data.mime_type)) {
      throw new Error("نوع الملف غير مدعوم. المسموح: PNG/JPG/WEBP/GIF/SVG/PDF.");
    }
    const bytes = Buffer.from(data.data_base64, "base64");
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error("حجم الملف يتجاوز الحد الأقصى (10MB).");
    }

    const key = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${sanitizeName(
      data.file_name,
    )}.${extFromMime(data.mime_type)}`;

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
      .select("id")
      .single();
    if (error) {
      await supabaseAdmin.storage
        .from("site-media")
        .remove([key])
        .catch(() => {});
      throw new Error(error.message);
    }
    return { id: row.id, url: `/api/public/media/${key}` };
  });

export const deleteAdminFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    const { data: row, error: getErr } = await context.supabase
      .from("media_library")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!row) throw new Error("الملف غير موجود.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage
      .from("site-media")
      .remove([row.storage_path])
      .catch(() => {});

    const { error } = await context.supabase.from("media_library").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
