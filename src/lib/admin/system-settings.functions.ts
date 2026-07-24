/**
 * Admin — System Settings module.
 *
 * Read-only surface over `public.system_settings` for the
 * /admin/settings console. Handlers are `admin`-guarded.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
});

export type SystemSettingRow = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
  category: string;
};

const deriveCategory = (key: string): string => {
  const idx = key.indexOf(".");
  return idx > 0 ? key.slice(0, idx) : "عام";
};

export const listSystemSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    let q = sb
      .from("system_settings")
      .select("key, value, description, updated_at, updated_by")
      .order("key", { ascending: true });

    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`key.ilike.${like},description.ilike.${like}`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const enriched: SystemSettingRow[] = (rows ?? []).map((r) => ({
      key: r.key,
      value: r.value,
      description: r.description,
      updated_at: r.updated_at,
      updated_by: r.updated_by,
      category: deriveCategory(r.key),
    }));

    const filtered = data.category
      ? enriched.filter((r) => r.category === data.category)
      : enriched;

    const categories = Array.from(
      new Set(enriched.map((r) => r.category)),
    ).sort();

    return { rows: filtered, categories, total: filtered.length };
  });

const detailSchema = z.object({ key: z.string().min(1).max(200) });

export const getSystemSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    const { data: row, error } = await sb
      .from("system_settings")
      .select("key, value, description, updated_at, updated_by")
      .eq("key", data.key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الإعداد غير موجود");

    let updatedByName: string | null = null;
    if (row.updated_by) {
      const { data: profile } = await sb
        .from("profiles")
        .select("full_name, phone")
        .eq("id", row.updated_by)
        .maybeSingle();
      updatedByName = profile?.full_name || profile?.phone || null;
    }

    return {
      ...row,
      category: deriveCategory(row.key),
      updated_by_name: updatedByName,
    };
  });
