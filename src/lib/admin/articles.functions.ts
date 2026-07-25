/**
 * Admin — Articles module.
 *
 * Read + write surface over `public.health_articles` for the /admin/articles
 * console: list with KPIs, drill-down with full content, and update
 * (publish/unpublish, edit body). All handlers are `admin`-guarded.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "published", "draft"]).default("all"),
  categoryId: z.string().uuid().optional(),
});

export type ArticleRow = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  cover_image_url: string | null;
  reading_minutes: number;
  is_published: boolean;
  published_at: string | null;
  updated_at: string;
  category_id: string | null;
  category_name_ar: string | null;
};

export type ArticleKpis = {
  total: number;
  published: number;
  draft: number;
  categories_used: number;
  avg_reading_minutes: number;
};

export const listAdminArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    let q = sb
      .from("health_articles")
      .select(
        "id, slug, title_ar, title_en, cover_image_url, reading_minutes, is_published, published_at, updated_at, category_id, health_categories(name_ar)",
      )
      .order("updated_at", { ascending: false });

    if (data.status === "published") q = q.eq("is_published", true);
    if (data.status === "draft") q = q.eq("is_published", false);
    if (data.categoryId) q = q.eq("category_id", data.categoryId);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`title_ar.ilike.${like},title_en.ilike.${like},slug.ilike.${like}`);
    }

    const [{ data: rows, error }, kpisRes, catsRes] = await Promise.all([
      q.limit(200),
      sb.from("health_articles").select("id, is_published, reading_minutes, category_id"),
      sb
        .from("health_categories")
        .select("id, name_ar, is_active")
        .order("sort_order", { ascending: true }),
    ]);

    if (error) throw new Error(error.message);
    if (kpisRes.error) throw new Error(kpisRes.error.message);
    if (catsRes.error) throw new Error(catsRes.error.message);

    const enriched: ArticleRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      slug: r.slug,
      title_ar: r.title_ar,
      title_en: r.title_en,
      cover_image_url: r.cover_image_url,
      reading_minutes: r.reading_minutes,
      is_published: r.is_published,
      published_at: r.published_at,
      updated_at: r.updated_at,
      category_id: r.category_id,
      category_name_ar: r.health_categories?.name_ar ?? null,
    }));

    const all = (kpisRes.data ?? []) as Array<{
      is_published: boolean;
      reading_minutes: number;
      category_id: string | null;
    }>;
    const totalRM = all.reduce((s, a) => s + (a.reading_minutes ?? 0), 0);
    const kpis: ArticleKpis = {
      total: all.length,
      published: all.filter((a) => a.is_published).length,
      draft: all.filter((a) => !a.is_published).length,
      categories_used: new Set(all.map((a) => a.category_id).filter(Boolean)).size,
      avg_reading_minutes: all.length ? Math.round(totalRM / all.length) : 0,
    };

    return {
      rows: enriched,
      kpis,
      categories: (catsRes.data ?? []) as Array<{
        id: string;
        name_ar: string;
        is_active: boolean;
      }>,
    };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminArticle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    const { data: article, error } = await sb
      .from("health_articles")
      .select("*, health_categories(id, name_ar, name_en, slug)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!article) throw new Error("المقال غير موجود");
    return { article };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  title_ar: z.string().trim().min(3).max(300),
  title_en: z.string().trim().max(300).nullable().optional(),
  excerpt_ar: z.string().trim().min(3).max(1000),
  excerpt_en: z.string().trim().max(1000).nullable().optional(),
  content_ar: z.string().trim().min(3).max(50000),
  content_en: z.string().trim().max(50000).nullable().optional(),
  cover_image_url: z.string().url().max(1024).nullable().optional(),
  author_name: z.string().trim().max(200).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  reading_minutes: z.number().int().min(1).max(240),
  is_published: z.boolean(),
});

export const updateAdminArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    // Fetch current published state to only stamp published_at on transitions.
    const { data: current, error: cErr } = await sb
      .from("health_articles")
      .select("is_published, published_at")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!current) throw new Error("المقال غير موجود");

    const patch: {
      title_ar: string;
      title_en: string | null;
      excerpt_ar: string;
      excerpt_en: string | null;
      content_ar: string;
      content_en: string | null;
      cover_image_url: string | null;
      author_name: string | null;
      category_id: string | null;
      reading_minutes: number;
      is_published: boolean;
      published_at?: string;
    } = {
      title_ar: data.title_ar,
      title_en: data.title_en ?? null,
      excerpt_ar: data.excerpt_ar,
      excerpt_en: data.excerpt_en ?? null,
      content_ar: data.content_ar,
      content_en: data.content_en ?? null,
      cover_image_url: data.cover_image_url ?? null,
      author_name: data.author_name ?? null,
      category_id: data.category_id ?? null,
      reading_minutes: data.reading_minutes,
      is_published: data.is_published,
    };
    if (data.is_published && !current.is_published) {
      patch.published_at = new Date().toISOString();
    }

    const { error } = await sb.from("health_articles").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
