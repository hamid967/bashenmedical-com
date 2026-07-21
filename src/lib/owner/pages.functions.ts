/**
 * Owner — Custom Pages CRUD (Site Builder).
 * Read/create/update: super_admin OR content_manager (editor).
 * Delete: super_admin only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertContentAccess, assertOwnerOnly } from "./_access";

const assertOwner = assertContentAccess;

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: أحرف صغيرة وأرقام وشرطات فقط");

const pageInput = z.object({
  slug: slugSchema,
  title_ar: z.string().trim().min(1).max(200),
  title_en: z.string().trim().max(200).default(""),
  content_ar: z.string().max(200_000).default(""),
  content_en: z.string().max(200_000).default(""),
  seo_title: z.string().trim().max(200).nullish(),
  seo_description: z.string().trim().max(500).nullish(),
  og_image: z.string().trim().max(500).refine(
    (v) => v === "" || /^https?:\/\//i.test(v) || v.startsWith("/"),
    "رابط الصورة يجب أن يبدأ بـ http(s):// أو /",
  ).nullish().or(z.literal("")),
  status: z.enum(["draft", "published"]).default("draft"),
  show_in_nav: z.boolean().default(false),
  nav_order: z.number().int().min(0).max(999).default(0),
});

export const listOwnerPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("custom_pages")
      .select("id, slug, title_ar, title_en, status, show_in_nav, nav_order, updated_at, published_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOwnerPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("custom_pages")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الصفحة غير موجودة.");
    return row;
  });

export const createOwnerPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => pageInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const payload: any = {
      ...data,
      og_image: data.og_image || null,
      created_by: context.userId,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };
    const { data: row, error } = await context.supabase
      .from("custom_pages")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOwnerPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(pageInput).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { id, ...rest } = data;

    // Fetch current status to decide published_at
    const { data: current } = await context.supabase
      .from("custom_pages")
      .select("status, published_at")
      .eq("id", id)
      .maybeSingle();

    const published_at =
      rest.status === "published" && current?.status !== "published"
        ? new Date().toISOString()
        : current?.published_at ?? null;

    const { error } = await context.supabase
      .from("custom_pages")
      .update({
        ...rest,
        og_image: rest.og_image || null,
        published_at,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOwnerPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("custom_pages")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: fetch a published page by slug (no auth). */
export const getPublicPageBySlug = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ slug: slugSchema }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: row, error } = await supabase
      .from("custom_pages")
      .select("slug, title_ar, title_en, content_ar, content_en, seo_title, seo_description, og_image, published_at")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
