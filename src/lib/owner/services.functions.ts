/**
 * Owner — Services (service_catalog) CRUD for Site Builder.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertOwner(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw new Error("تعذّر التحقق من الصلاحية.");
  if (!data) throw new Error("هذه الصفحة مخصصة لمالك الموقع فقط.");
}

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const svcInput = z.object({
  slug: slugSchema,
  name_ar: z.string().trim().min(1).max(160),
  name_en: z.string().trim().min(1).max(160),
  description_ar: z.string().max(2000).default(""),
  description_en: z.string().max(2000).default(""),
  icon: z.string().trim().max(60).nullish().or(z.literal("")),
  price_from: z.number().nonnegative().nullish(),
  duration_min: z.number().int().min(0).max(1440).nullish(),
  image_url: z.string().trim().url().max(500).nullish().or(z.literal("")),
  display_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
});

export const listOwnerServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("service_catalog")
      .select("id, slug, name_ar, name_en, description_ar, icon, price_from, duration_min, image_url, display_order, is_active, updated_at")
      .order("display_order", { ascending: true })
      .order("name_ar", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOwnerService = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("service_catalog")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الخدمة غير موجودة.");
    return row;
  });

export const createOwnerService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => svcInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { error, data: row } = await context.supabase
      .from("service_catalog")
      .insert({
        ...data,
        icon: data.icon || null,
        image_url: data.image_url || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateOwnerService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid() }).merge(svcInput).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("service_catalog")
      .update({
        ...rest,
        icon: rest.icon || null,
        image_url: rest.image_url || null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOwnerService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("service_catalog")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderOwnerServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      order: z.array(z.object({ id: z.string().uuid(), display_order: z.number().int() })).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    for (const { id, display_order } of data.order) {
      await context.supabase.from("service_catalog").update({ display_order }).eq("id", id);
    }
    return { ok: true };
  });

export const toggleOwnerService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("service_catalog")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
