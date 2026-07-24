/**
 * CMS server functions — CRUD, versioning, workflow, and preview tokens.
 * All handlers require an authenticated session; role gating is enforced
 * per operation via `_guard.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  assertCmsEditor,
  assertCmsPublisher,
  getCmsRole,
} from "./_guard";
import { computeCompleteness, CMS_KINDS, type CmsKind } from "./schemas";

const KIND_VALUES = Object.keys(CMS_KINDS) as [CmsKind, ...CmsKind[]];
const KindSchema = z.enum(KIND_VALUES);
const StatusSchema = z.enum([
  "draft", "in_review", "approved", "scheduled", "published", "archived",
]);

/* ----------------------- audit helper ----------------------- */
async function audit(
  supabase: any,
  actorId: string,
  action: string,
  entryId: string | null,
  versionId: string | null,
  before: any,
  after: any,
  metadata?: any,
) {
  await supabase.from("cms_audit").insert({
    entry_id: entryId,
    version_id: versionId,
    actor_id: actorId,
    action,
    before_snapshot: before ?? null,
    after_snapshot: after ?? null,
    metadata: metadata ?? null,
  });
}

/* ============== queries ============== */

export const getCmsRoleInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getCmsRole(context);
    return { role, userId: context.userId };
  });

export const getCmsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCmsEditor(context);
    const { data, error } = await context.supabase
      .from("cms_entries")
      .select("id, kind, status, title, updated_at, scheduled_at, locale_completeness");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    const by = (s: string) => rows.filter((r) => r.status === s).length;
    return {
      totals: {
        draft: by("draft"),
        in_review: by("in_review"),
        approved: by("approved"),
        scheduled: by("scheduled"),
        published: by("published"),
        archived: by("archived"),
      },
      recent: rows
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
        .slice(0, 20),
    };
  });

export const listCmsEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      kind: KindSchema,
      status: StatusSchema.optional(),
      q: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    let q = context.supabase
      .from("cms_entries")
      .select("id, kind, entity_id, slug, title, status, scheduled_at, published_at, locale_completeness, updated_at")
      .eq("kind", data.kind)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCmsEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    const { data: entry, error } = await context.supabase
      .from("cms_entries")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!entry) throw new Error("Entry not found");

    const { data: versions } = await context.supabase
      .from("cms_versions")
      .select("id, version_no, payload_ar, payload_en, seo, og_image_url, note, author_id, created_at")
      .eq("entry_id", data.id)
      .order("version_no", { ascending: false })
      .limit(50);

    const currentId = (entry as any).current_version_id;
    const current = (versions ?? []).find((v: any) => v.id === currentId) ?? (versions ?? [])[0] ?? null;
    return { entry, current, versions: versions ?? [] };
  });

/* ============== create / save ============== */

const PayloadSchema = z.record(z.any());
const SeoSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  canonical: z.string().max(500).optional(),
  og_title: z.string().max(200).optional(),
  og_description: z.string().max(500).optional(),
}).partial();

const CreateSchema = z.object({
  kind: KindSchema,
  title: z.string().min(1).max(200),
  slug: z.string().max(200).optional(),
  entity_id: z.string().uuid().optional(),
});

export const createCmsEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    const { data: entry, error } = await context.supabase
      .from("cms_entries")
      .insert({
        kind: data.kind,
        title: data.title,
        slug: data.slug ?? null,
        entity_id: data.entity_id ?? null,
        status: "draft",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    // create v1
    const { data: v1, error: verr } = await context.supabase
      .from("cms_versions")
      .insert({
        entry_id: entry.id,
        version_no: 1,
        payload_ar: {},
        payload_en: {},
        seo: {},
        author_id: context.userId,
        note: "initial",
      })
      .select("*")
      .single();
    if (verr) throw new Error(verr.message);
    await context.supabase
      .from("cms_entries")
      .update({ current_version_id: v1.id })
      .eq("id", entry.id);
    await audit(context.supabase, context.userId, "create", entry.id, v1.id, null, entry);
    return { id: entry.id };
  });

const SaveSchema = z.object({
  entry_id: z.string().uuid(),
  payload_ar: PayloadSchema,
  payload_en: PayloadSchema,
  seo: SeoSchema.optional(),
  og_image_url: z.string().max(1024).nullable().optional(),
  note: z.string().max(500).optional(),
});

export const saveCmsVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    const { data: entry, error: eerr } = await context.supabase
      .from("cms_entries")
      .select("id, kind, status")
      .eq("id", data.entry_id)
      .maybeSingle();
    if (eerr) throw new Error(eerr.message);
    if (!entry) throw new Error("Entry not found");
    if (entry.status === "archived") throw new Error("لا يمكن تعديل عنصر مؤرشف");

    // Next version_no
    const { data: last } = await context.supabase
      .from("cms_versions")
      .select("version_no")
      .eq("entry_id", data.entry_id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo = ((last?.version_no as number) ?? 0) + 1;

    const { data: newVer, error: verr } = await context.supabase
      .from("cms_versions")
      .insert({
        entry_id: data.entry_id,
        version_no: nextNo,
        payload_ar: data.payload_ar,
        payload_en: data.payload_en,
        seo: data.seo ?? {},
        og_image_url: data.og_image_url ?? null,
        author_id: context.userId,
        note: data.note ?? null,
      })
      .select("*")
      .single();
    if (verr) throw new Error(verr.message);

    const completeness = {
      ar: computeCompleteness(entry.kind as CmsKind, data.payload_ar),
      en: computeCompleteness(entry.kind as CmsKind, data.payload_en),
    };
    // Preserve status if not draft; saving a version does not change workflow state.
    await context.supabase
      .from("cms_entries")
      .update({
        current_version_id: newVer.id,
        locale_completeness: completeness,
        updated_by: context.userId,
      })
      .eq("id", data.entry_id);

    await audit(
      context.supabase, context.userId, "save",
      data.entry_id, newVer.id, null,
      { version_no: nextNo, completeness },
    );
    return { version_id: newVer.id, version_no: nextNo, completeness };
  });

/* ============== workflow actions ============== */

const IdOnly = z.object({ entry_id: z.string().uuid() });
const IdWithComment = IdOnly.extend({ comment: z.string().max(1000).optional() });

async function loadEntry(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("cms_entries").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Entry not found");
  return data as any;
}

export const submitCmsForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdOnly.parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    const entry = await loadEntry(context.supabase, data.entry_id);
    if (!["draft", "in_review"].includes(entry.status)) {
      throw new Error("لا يمكن تقديم عنصر ليس مسودة.");
    }
    const ar = entry.locale_completeness?.ar ?? 0;
    if (ar < 100) throw new Error("العربية غير مكتملة — أكمل الحقول المطلوبة قبل التقديم.");
    const kindDef = CMS_KINDS[entry.kind as CmsKind];
    if (kindDef?.bilingual) {
      const en = entry.locale_completeness?.en ?? 0;
      if (en < 100) throw new Error("الإنجليزية غير مكتملة — هذا النوع يتطلب ترجمة كاملة قبل التقديم.");
    }

    await context.supabase.from("cms_entries")
      .update({ status: "in_review", updated_by: context.userId })
      .eq("id", data.entry_id);
    await audit(context.supabase, context.userId, "submit",
      data.entry_id, entry.current_version_id, { status: entry.status }, { status: "in_review" });
    return { ok: true };
  });

export const reviewCmsEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdWithComment.extend({
    decision: z.enum(["approved", "rejected", "changes_requested"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsPublisher(context);
    const entry = await loadEntry(context.supabase, data.entry_id);
    if (entry.status !== "in_review") throw new Error("العنصر ليس تحت المراجعة.");
    // Require a comment when rejecting or asking for changes so authors know why.
    if (data.decision !== "approved") {
      const trimmed = (data.comment ?? "").trim();
      if (trimmed.length < 3) {
        throw new Error("يجب إضافة سبب/ملاحظة عند الرفض أو طلب تعديلات.");
      }
    }
    await context.supabase.from("cms_reviews").insert({
      version_id: entry.current_version_id,
      reviewer_id: context.userId,
      decision: data.decision,
      comment: data.comment ?? null,
    });
    const nextStatus =
      data.decision === "approved" ? "approved"
      : data.decision === "rejected" ? "archived"
      : "draft";
    await context.supabase.from("cms_entries")
      .update({
        status: nextStatus,
        archived_at: nextStatus === "archived" ? new Date().toISOString() : null,
        updated_by: context.userId,
      })
      .eq("id", data.entry_id);
    await audit(context.supabase, context.userId, `review_${data.decision}`,
      data.entry_id, entry.current_version_id,
      { status: "in_review" }, { status: nextStatus, comment: data.comment ?? null });
    return { ok: true, status: nextStatus };
  });


export const publishCmsEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdOnly.parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsPublisher(context);
    const entry = await loadEntry(context.supabase, data.entry_id);
    if (!["approved", "scheduled", "draft"].includes(entry.status)) {
      throw new Error("لا يمكن نشر عنصر بهذه الحالة.");
    }
    const now = new Date().toISOString();
    await context.supabase.from("cms_entries")
      .update({
        status: "published",
        published_at: now,
        scheduled_at: null,
        updated_by: context.userId,
      })
      .eq("id", data.entry_id);
    await audit(context.supabase, context.userId, "publish",
      data.entry_id, entry.current_version_id,
      { status: entry.status }, { status: "published", published_at: now });
    return { ok: true };
  });

export const scheduleCmsEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdOnly.extend({
    publish_at: z.string().datetime(),
    unpublish_at: z.string().datetime().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsPublisher(context);
    const entry = await loadEntry(context.supabase, data.entry_id);
    if (!["approved", "draft", "in_review"].includes(entry.status)) {
      throw new Error("العنصر ليس جاهزًا للجدولة.");
    }
    await context.supabase.from("cms_schedule").insert({
      version_id: entry.current_version_id,
      entry_id: data.entry_id,
      publish_at: data.publish_at,
      unpublish_at: data.unpublish_at ?? null,
      created_by: context.userId,
    });
    await context.supabase.from("cms_entries")
      .update({ status: "scheduled", scheduled_at: data.publish_at, updated_by: context.userId })
      .eq("id", data.entry_id);
    await audit(context.supabase, context.userId, "schedule",
      data.entry_id, entry.current_version_id,
      { status: entry.status }, { status: "scheduled", publish_at: data.publish_at });
    return { ok: true };
  });

export const archiveCmsEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdOnly.parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsPublisher(context);
    const entry = await loadEntry(context.supabase, data.entry_id);
    const now = new Date().toISOString();
    await context.supabase.from("cms_entries")
      .update({ status: "archived", archived_at: now, updated_by: context.userId })
      .eq("id", data.entry_id);
    await audit(context.supabase, context.userId, "archive",
      data.entry_id, entry.current_version_id,
      { status: entry.status }, { status: "archived" });
    return { ok: true };
  });

export const rollbackCmsVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdOnly.extend({
    version_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsPublisher(context);
    const entry = await loadEntry(context.supabase, data.entry_id);
    const { data: target, error: verr } = await context.supabase
      .from("cms_versions")
      .select("*")
      .eq("id", data.version_id)
      .eq("entry_id", data.entry_id)
      .maybeSingle();
    if (verr) throw new Error(verr.message);
    if (!target) throw new Error("النسخة المستهدفة غير موجودة");

    // Create a fresh version with the target payload; do not mutate history.
    const { data: last } = await context.supabase
      .from("cms_versions")
      .select("version_no")
      .eq("entry_id", data.entry_id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo = ((last?.version_no as number) ?? 0) + 1;
    const { data: newVer, error: nerr } = await context.supabase
      .from("cms_versions")
      .insert({
        entry_id: data.entry_id,
        version_no: nextNo,
        payload_ar: target.payload_ar,
        payload_en: target.payload_en,
        seo: target.seo,
        og_image_url: target.og_image_url,
        author_id: context.userId,
        note: `rollback to v${target.version_no}`,
      })
      .select("*")
      .single();
    if (nerr) throw new Error(nerr.message);

    const completeness = {
      ar: computeCompleteness(entry.kind as CmsKind, target.payload_ar as any),
      en: computeCompleteness(entry.kind as CmsKind, target.payload_en as any),
    };
    const now = new Date().toISOString();
    await context.supabase.from("cms_entries")
      .update({
        current_version_id: newVer.id,
        status: "published",
        published_at: now,
        locale_completeness: completeness,
        updated_by: context.userId,
      })
      .eq("id", data.entry_id);

    await audit(context.supabase, context.userId, "rollback",
      data.entry_id, newVer.id,
      { current_version_id: entry.current_version_id, status: entry.status },
      { current_version_id: newVer.id, status: "published", from_version: target.version_no });
    return { ok: true, version_no: nextNo };
  });

/* ============== preview tokens ============== */

export const createCmsPreviewToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => IdOnly.parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    const entry = await loadEntry(context.supabase, data.entry_id);
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    const { error } = await context.supabase.from("cms_preview_tokens").insert({
      token,
      version_id: entry.current_version_id,
      entry_id: data.entry_id,
      created_by: context.userId,
      expires_at: expires,
    });
    if (error) throw new Error(error.message);
    return { token, expires_at: expires };
  });

export const getCmsPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ token: z.string().min(16).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    const { data: row, error } = await context.supabase
      .from("cms_preview_tokens")
      .select("token, version_id, entry_id, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("رمز المعاينة غير صالح");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("انتهت صلاحية رمز المعاينة");
    }
    const { data: ver } = await context.supabase
      .from("cms_versions").select("*").eq("id", row.version_id).maybeSingle();
    return { version: ver };
  });

/* ============== review queue + audit tail ============== */

export const listCmsReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCmsPublisher(context);
    const { data, error } = await context.supabase
      .from("cms_entries")
      .select("id, kind, title, updated_at, locale_completeness")
      .eq("status", "in_review")
      .order("updated_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCmsAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      entry_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    let q = context.supabase
      .from("cms_audit")
      .select("id, entry_id, version_id, actor_id, action, before_snapshot, after_snapshot, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.entry_id) q = q.eq("entry_id", data.entry_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ============== version diff ============== */

export const getCmsVersion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      entry_id: z.string().uuid(),
      version_id: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCmsEditor(context);
    const { data: v, error } = await context.supabase
      .from("cms_versions")
      .select("id, version_no, payload_ar, payload_en, seo, og_image_url, note, author_id, created_at")
      .eq("id", data.version_id)
      .eq("entry_id", data.entry_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!v) throw new Error("النسخة غير موجودة");
    return v;
  });

