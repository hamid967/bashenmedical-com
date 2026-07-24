/**
 * Phase 6 — Admin/editor server functions for the content engine.
 * Every handler asserts the caller carries `content_manager`, `admin`, or
 * `super_admin`. Writes append to `content_item_versions` for audit.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "@/lib/admin/_guard";

const ContentTypeEnum = z.enum([
  "announcement",
  "offer",
  "screening",
  "new_service",
  "reminder",
  "doctor_spotlight",
  "nearest_slot",
  "suggested_service",
]);
const StatusEnum = z.enum([
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "archived",
]);

// Basic diagnostic/medical-claim guard: reject wording that reads like a
// medical inference. Not exhaustive; supplements editorial review.
const BANNED_CLAIM_PATTERNS = [
  /\btشخيص\b/,
  /\bعلاج مضمون\b/,
  /guarant(ee|eed) cure/i,
  /diagnose you/i,
];

function ensureNoClaims(text: string | null | undefined) {
  if (!text) return;
  for (const p of BANNED_CLAIM_PATTERNS) {
    if (p.test(text)) {
      throw new Error("المحتوى يحتوي عبارات تشخيصية غير مسموح بها.");
    }
  }
}

async function assertEditor(ctx: { supabase: unknown; userId: string }) {
  // Try each role until one passes; assertHasRole throws otherwise.
  const tryRoles = ["content_manager", "admin", "super_admin"] as const;
  for (const r of tryRoles) {
    try {
      await assertHasRole(
        ctx.supabase as never,
        ctx.userId,
        r as "content_manager" | "admin" | "super_admin",
      );
      return;
    } catch {
      /* try next */
    }
  }
  throw new Error("ليست لديك الصلاحية لإدارة المحتوى.");
}

/* ------------------------------ Listing -------------------------------- */

const ListInput = z
  .object({
    type: ContentTypeEnum.optional(),
    status: StatusEnum.optional(),
    branchId: z.string().uuid().optional().nullable(),
    q: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .optional();

export const listContentItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ListInput.parse(input) ?? {})
  .handler(async ({ context, data }) => {
    await assertEditor(context);
    let q = context.supabase
      .from("content_items")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(data?.limit ?? 100);
    if (data?.type) q = q.eq("type", data.type);
    if (data?.status) q = q.eq("status", data.status);
    if (data?.branchId) q = q.eq("branch_id", data.branchId);
    if (data?.q) q = q.or(`title_ar.ilike.%${data.q}%,title_en.ilike.%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const getContentItem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertEditor(context);
    const { data: row, error } = await context.supabase
      .from("content_items")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

/* ------------------------------ Upsert --------------------------------- */

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  type: ContentTypeEnum,
  status: StatusEnum.optional(),
  title_ar: z.string().trim().min(2).max(200),
  title_en: z.string().trim().min(2).max(200),
  body_ar: z.string().trim().max(4000).optional().nullable(),
  body_en: z.string().trim().max(4000).optional().nullable(),
  excerpt_ar: z.string().trim().max(400).optional().nullable(),
  excerpt_en: z.string().trim().max(400).optional().nullable(),
  image_url: z.string().url().max(1024).optional().nullable(),
  cta_label_ar: z.string().trim().max(60).optional().nullable(),
  cta_label_en: z.string().trim().max(60).optional().nullable(),
  cta_href: z.string().max(1024).optional().nullable(),
  starts_at: z.string().datetime().optional().nullable(),
  ends_at: z.string().datetime().optional().nullable(),
  priority: z.number().int().min(0).max(1000).optional(),
  branch_id: z.string().uuid().optional().nullable(),
  specialty_id: z.string().uuid().optional().nullable(),
  audience: z.record(z.string(), z.unknown()).optional(),
  is_promotional: z.boolean().optional(),
  surface: z.string().max(64).optional(),
});

export const upsertContentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertEditor(context);
    // Editorial guardrails
    ensureNoClaims(data.body_ar);
    ensureNoClaims(data.body_en);
    ensureNoClaims(data.title_ar);
    ensureNoClaims(data.title_en);
    if (
      data.is_promotional &&
      (data.type === "screening" || data.type === "reminder")
    ) {
      throw new Error("لا يمكن وسم حملات الفحص أو التذكيرات كمحتوى ترويجي.");
    }

    const payload = {
      ...data,
      created_by: context.userId,
    } as never;

    const query = data.id
      ? context.supabase
          .from("content_items")
          .update(payload)
          .eq("id", data.id)
          .select("*")
          .single()
      : context.supabase.from("content_items").insert(payload).select("*").single();

    const { data: row, error } = await query;
    if (error) throw new Error(error.message);

    await context.supabase.from("content_item_versions").insert({
      item_id: row.id,
      changed_by: context.userId,
      snapshot: row,
      reason: data.id ? "update" : "create",
    });
    return row;
  });

/* --------------------------- Status transitions ------------------------- */

const ALLOWED: Record<string, string[]> = {
  draft: ["review", "archived"],
  review: ["approved", "draft", "archived"],
  approved: ["scheduled", "published", "draft", "archived"],
  scheduled: ["published", "draft", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

export const transitionContentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), to: StatusEnum }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertEditor(context);
    const { data: current, error: e1 } = await context.supabase
      .from("content_items")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!current) throw new Error("لم يتم العثور على العنصر.");
    const allowed = ALLOWED[current.status] ?? [];
    if (!allowed.includes(data.to)) {
      throw new Error(`لا يمكن الانتقال من ${current.status} إلى ${data.to}.`);
    }
    const patch: Record<string, unknown> = { status: data.to };
    if (data.to === "approved") patch.approved_by = context.userId;
    const { data: row, error } = await context.supabase
      .from("content_items")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("content_item_versions").insert({
      item_id: row.id,
      changed_by: context.userId,
      snapshot: row,
      reason: `status:${data.to}`,
    });
    return row;
  });

/* ---------------------------- Kill switch ------------------------------- */

export const toggleContentDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), disabled: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertEditor(context);
    const { data: row, error } = await context.supabase
      .from("content_items")
      .update({ disabled_at: data.disabled ? new Date().toISOString() : null })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("content_item_versions").insert({
      item_id: row.id,
      changed_by: context.userId,
      snapshot: row,
      reason: data.disabled ? "disabled" : "re-enabled",
    });
    return row;
  });

/* ------------------------------ Stats ---------------------------------- */

export const getContentStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), days: z.number().int().min(1).max(90).optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertEditor(context);
    const since = new Date(Date.now() - (data.days ?? 30) * 24 * 3600 * 1000).toISOString();
    const [imp, clk] = await Promise.all([
      context.supabase
        .from("content_impressions")
        .select("id", { count: "exact", head: true })
        .eq("item_id", data.id)
        .gte("shown_at", since),
      context.supabase
        .from("content_clicks")
        .select("id", { count: "exact", head: true })
        .eq("item_id", data.id)
        .gte("clicked_at", since),
    ]);
    const impressions = imp.count ?? 0;
    const clicks = clk.count ?? 0;
    return {
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
    };
  });
