/**
 * Owner — Excellence Centers CRUD for Site Builder.
 * Read/create/update: super_admin OR content_manager.
 * Delete: super_admin only (+ MFA).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertContentAccess, assertOwnerOnly } from "./_access";

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const excellenceInput = z.object({
  slug: slugSchema,
  name_ar: z.string().trim().min(1).max(160),
  name_en: z.string().trim().min(1).max(160),
  short_ar: z.string().max(400).nullish().or(z.literal("")),
  short_en: z.string().max(400).nullish().or(z.literal("")),
  description_ar: z.string().max(8000).nullish().or(z.literal("")),
  description_en: z.string().max(8000).nullish().or(z.literal("")),
  icon: z.string().trim().max(60).nullish().or(z.literal("")),
  hero_image_url: z.string().trim().url().max(500).nullish().or(z.literal("")),
  specialty_id: z.string().uuid().nullish().or(z.literal("")),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

export const listOwnerExcellence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("excellence_centers")
      .select(
        "id, slug, name_ar, name_en, short_ar, short_en, icon, hero_image_url, specialty_id, sort_order, is_active, updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("name_ar", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOwnerExcellence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("excellence_centers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("مركز التميز غير موجود.");
    return row;
  });

export const createOwnerExcellence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => excellenceInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { error, data: row } = await context.supabase
      .from("excellence_centers")
      .insert({
        slug: data.slug,
        name_ar: data.name_ar,
        name_en: data.name_en,
        short_ar: data.short_ar || null,
        short_en: data.short_en || null,
        description_ar: data.description_ar || null,
        description_en: data.description_en || null,
        icon: data.icon || null,
        hero_image_url: data.hero_image_url || null,
        specialty_id: data.specialty_id || null,
        sort_order: data.sort_order,
        is_active: data.is_active,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOwnerExcellence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).merge(excellenceInput).parse(d))
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("excellence_centers")
      .update({
        slug: rest.slug,
        name_ar: rest.name_ar,
        name_en: rest.name_en,
        short_ar: rest.short_ar || null,
        short_en: rest.short_en || null,
        description_ar: rest.description_ar || null,
        description_en: rest.description_en || null,
        icon: rest.icon || null,
        hero_image_url: rest.hero_image_url || null,
        specialty_id: rest.specialty_id || null,
        sort_order: rest.sort_order,
        is_active: rest.is_active,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOwnerExcellence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { error } = await context.supabase.from("excellence_centers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleOwnerExcellence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("excellence_centers")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
