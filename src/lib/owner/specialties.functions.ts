/**
 * Owner — Specialties CRUD for Site Builder.
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

const specialtyInput = z.object({
  slug: slugSchema,
  name_ar: z.string().trim().min(1).max(160),
  name_en: z.string().trim().min(1).max(160),
  description_ar: z.string().max(4000).nullish().or(z.literal("")),
  description_en: z.string().max(4000).nullish().or(z.literal("")),
  icon: z.string().trim().max(60).nullish().or(z.literal("")),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

export const listOwnerSpecialties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("specialties")
      .select(
        "id, slug, name_ar, name_en, description_ar, description_en, icon, sort_order, is_active, created_at",
      )
      .order("sort_order", { ascending: true })
      .order("name_ar", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOwnerSpecialty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("specialties")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("التخصص غير موجود.");
    return row;
  });

export const createOwnerSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => specialtyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { error, data: row } = await context.supabase
      .from("specialties")
      .insert({
        slug: data.slug,
        name_ar: data.name_ar,
        name_en: data.name_en,
        description_ar: data.description_ar || null,
        description_en: data.description_en || null,
        icon: data.icon || null,
        sort_order: data.sort_order,
        is_active: data.is_active,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOwnerSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).merge(specialtyInput).parse(d))
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("specialties")
      .update({
        slug: rest.slug,
        name_ar: rest.name_ar,
        name_en: rest.name_en,
        description_ar: rest.description_ar || null,
        description_en: rest.description_en || null,
        icon: rest.icon || null,
        sort_order: rest.sort_order,
        is_active: rest.is_active,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOwnerSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { error } = await context.supabase.from("specialties").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleOwnerSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("specialties")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderOwnerSpecialties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        order: z
          .array(z.object({ id: z.string().uuid(), sort_order: z.number().int() }))
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertContentAccess(context.supabase, context.userId);
    for (const { id, sort_order } of data.order) {
      await context.supabase.from("specialties").update({ sort_order }).eq("id", id);
    }
    return { ok: true };
  });
