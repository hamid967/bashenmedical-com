import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "super_admin";

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as Role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("ليست لديك الصلاحية لإدارة كتالوج الخدمات.");
  }
}

const slugRe = /^[a-z0-9_]+$/;

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(slugRe, "المعرّف يجب أن يحتوي حروف إنجليزية صغيرة وأرقام و _ فقط"),
  name_ar: z.string().min(1).max(120),
  name_en: z.string().min(1).max(120),
  display_order: z.number().int().min(0).max(9999).default(100),
  is_active: z.boolean().default(true),
});

export const listServiceCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("service_catalog")
      .select("id, slug, name_ar, name_en, display_order, is_active, updated_at")
      .order("display_order", { ascending: true })
      .order("name_ar", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertServiceCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const payload = {
      slug: data.slug,
      name_ar: data.name_ar,
      name_en: data.name_en,
      display_order: data.display_order,
      is_active: data.is_active,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("service_catalog")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("service_catalog")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id as string };
  });

export const toggleServiceActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("service_catalog")
      .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderServiceCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        items: z
          .array(
            z.object({ id: z.string().uuid(), display_order: z.number().int().min(0).max(9999) }),
          )
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const now = new Date().toISOString();
    for (const it of data.items) {
      const { error } = await context.supabase
        .from("service_catalog")
        .update({ display_order: it.display_order, updated_at: now })
        .eq("id", it.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.items.length };
  });
