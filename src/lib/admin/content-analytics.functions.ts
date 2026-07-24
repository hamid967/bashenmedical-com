/**
 * Phase 6 — Admin analytics for the patient content engine.
 * Aggregates impressions and clicks by item, audience segment, language,
 * branch, and time range. Editors, admins, and super_admins only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "@/lib/admin/_guard";

const Input = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  branchId: z.string().uuid().optional().nullable(),
  language: z.enum(["ar", "en"]).optional(),
  itemId: z.string().uuid().optional(),
  type: z.string().max(64).optional(),
});

async function assertEditor(ctx: { supabase: unknown; userId: string }) {
  const roles = ["content_manager", "admin", "super_admin"] as const;
  for (const r of roles) {
    try {
      await assertHasRole(ctx.supabase as never, ctx.userId, r);
      return;
    } catch {
      /* try next */
    }
  }
  throw new Error("ليست لديك الصلاحية لعرض تحليلات المحتوى.");
}

export interface ContentAnalyticsRow {
  key: string;
  label: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface ContentAnalyticsResult {
  totals: { impressions: number; clicks: number; ctr: number };
  daily: Array<{ date: string; impressions: number; clicks: number }>;
  byItem: ContentAnalyticsRow[];
  byBranch: ContentAnalyticsRow[];
  byLanguage: ContentAnalyticsRow[];
  bySegment: ContentAnalyticsRow[];
  byType: ContentAnalyticsRow[];
  window: { from: string; to: string };
  sampled: boolean;
}

const ROW_CAP = 20000;

export const getContentAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => Input.parse(input ?? {}))
  .handler(async ({ context, data }): Promise<ContentAnalyticsResult> => {
    await assertEditor(context);
    const to = data.to ?? new Date().toISOString();
    const from =
      data.from ??
      new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const sel = (s: string): string => s;

    // Base queries with optional filters (applied via joined item metadata after fetch).
    let impQ = context.supabase
      .from("content_impressions")
      .select(sel("item_id,user_id,shown_at"))
      .gte("shown_at", from)
      .lte("shown_at", to)
      .order("shown_at", { ascending: false })
      .limit(ROW_CAP);
    let clkQ = context.supabase
      .from("content_clicks")
      .select(sel("item_id,user_id,clicked_at"))
      .gte("clicked_at", from)
      .lte("clicked_at", to)
      .order("clicked_at", { ascending: false })
      .limit(ROW_CAP);
    if (data.itemId) {
      impQ = impQ.eq("item_id", data.itemId);
      clkQ = clkQ.eq("item_id", data.itemId);
    }

    const [impRes, clkRes] = await Promise.all([impQ, clkQ]);
    if (impRes.error) throw new Error(impRes.error.message);
    if (clkRes.error) throw new Error(clkRes.error.message);

    type ImpRow = { item_id: string; user_id: string | null; shown_at: string };
    type ClkRow = { item_id: string; user_id: string | null; clicked_at: string };
    const impressions = (impRes.data ?? []) as unknown as ImpRow[];
    const clicks = (clkRes.data ?? []) as unknown as ClkRow[];

    // Referenced ids
    const itemIds = Array.from(
      new Set([
        ...impressions.map((r) => r.item_id),
        ...clicks.map((r) => r.item_id),
      ]),
    );
    const userIds = Array.from(
      new Set(
        [
          ...impressions.map((r) => r.user_id),
          ...clicks.map((r) => r.user_id),
        ].filter((v): v is string => !!v),
      ),
    );

    const [itemsRes, profilesRes] = await Promise.all([
      itemIds.length
        ? context.supabase
            .from("content_items")
            .select(
              sel(
                "id,title_ar,title_en,type,branch_id,audience,is_promotional",
              ),
            )
            .in("id", itemIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? context.supabase
            .from("profiles")
            .select(sel("id,preferred_language,default_branch_id"))
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    type ItemMeta = {
      id: string;
      title_ar: string;
      title_en: string;
      type: string;
      branch_id: string | null;
      audience: Record<string, unknown> | null;
      is_promotional: boolean;
    };
    type ProfileMeta = {
      id: string;
      preferred_language: string | null;
      default_branch_id: string | null;
    };
    const items = new Map<string, ItemMeta>();
    for (const row of ((itemsRes.data ?? []) as unknown as ItemMeta[])) {
      items.set(row.id, row);
    }
    const profiles = new Map<string, ProfileMeta>();
    for (const row of ((profilesRes.data ?? []) as unknown as ProfileMeta[])) {
      profiles.set(row.id, row);
    }

    const branchIds = Array.from(
      new Set(
        Array.from(items.values())
          .map((i) => i.branch_id)
          .filter((v): v is string => !!v),
      ),
    );
    const branchesRes = branchIds.length
      ? await context.supabase
          .from("branches")
          .select(sel("id,name_ar,name_en"))
          .in("id", branchIds)
      : { data: [], error: null };
    const branches = new Map<string, { name_ar: string; name_en: string }>();
    for (const b of ((branchesRes.data ?? []) as unknown as Array<{
      id: string;
      name_ar: string;
      name_en: string;
    }>)) {
      branches.set(b.id, { name_ar: b.name_ar, name_en: b.name_en });
    }

    // Apply post-filters (branch/language/type) — we count only rows whose
    // associated item/user metadata matches the filter.
    const keepImp = (r: ImpRow): boolean => rowMatches(r.item_id, r.user_id);
    const keepClk = (r: ClkRow): boolean => rowMatches(r.item_id, r.user_id);
    function rowMatches(itemId: string, userId: string | null): boolean {
      const item = items.get(itemId);
      if (!item) return false;
      if (data.branchId && item.branch_id !== data.branchId) return false;
      if (data.type && item.type !== data.type) return false;
      if (data.language) {
        const p = userId ? profiles.get(userId) : null;
        const lang = p?.preferred_language ?? "ar";
        if (lang !== data.language) return false;
      }
      return true;
    }

    const impF = impressions.filter(keepImp);
    const clkF = clicks.filter(keepClk);

    // Totals
    const totals = {
      impressions: impF.length,
      clicks: clkF.length,
      ctr: impF.length ? clkF.length / impF.length : 0,
    };

    // Daily buckets
    const daily = new Map<string, { impressions: number; clicks: number }>();
    const dayKey = (iso: string) => iso.slice(0, 10);
    for (const r of impF) {
      const k = dayKey(r.shown_at);
      const b = daily.get(k) ?? { impressions: 0, clicks: 0 };
      b.impressions += 1;
      daily.set(k, b);
    }
    for (const r of clkF) {
      const k = dayKey(r.clicked_at);
      const b = daily.get(k) ?? { impressions: 0, clicks: 0 };
      b.clicks += 1;
      daily.set(k, b);
    }
    const dailySorted = Array.from(daily.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // Grouping helper
    function group(
      impArr: Array<{ key: string; label: string }>,
      clkArr: Array<{ key: string; label: string }>,
    ): ContentAnalyticsRow[] {
      const m = new Map<
        string,
        { label: string; impressions: number; clicks: number }
      >();
      for (const r of impArr) {
        const e = m.get(r.key) ?? {
          label: r.label,
          impressions: 0,
          clicks: 0,
        };
        e.impressions += 1;
        m.set(r.key, e);
      }
      for (const r of clkArr) {
        const e = m.get(r.key) ?? {
          label: r.label,
          impressions: 0,
          clicks: 0,
        };
        e.clicks += 1;
        m.set(r.key, e);
      }
      return Array.from(m.entries())
        .map(([key, v]) => ({
          key,
          label: v.label,
          impressions: v.impressions,
          clicks: v.clicks,
          ctr: v.impressions ? v.clicks / v.impressions : 0,
        }))
        .sort((a, b) => b.impressions - a.impressions);
    }

    // By item
    const impByItem = impF.map((r) => {
      const it = items.get(r.item_id);
      return { key: r.item_id, label: it?.title_ar || it?.title_en || r.item_id };
    });
    const clkByItem = clkF.map((r) => {
      const it = items.get(r.item_id);
      return { key: r.item_id, label: it?.title_ar || it?.title_en || r.item_id };
    });
    const byItem = group(impByItem, clkByItem);

    // By branch
    const branchKey = (itemId: string) => {
      const it = items.get(itemId);
      const bid = it?.branch_id ?? "__none__";
      const label = it?.branch_id
        ? branches.get(it.branch_id)?.name_ar ?? it.branch_id
        : "بدون فرع";
      return { key: bid, label };
    };
    const byBranch = group(
      impF.map((r) => branchKey(r.item_id)),
      clkF.map((r) => branchKey(r.item_id)),
    );

    // By language (from viewer's preferred_language)
    const langKey = (userId: string | null) => {
      const p = userId ? profiles.get(userId) : null;
      const lang = p?.preferred_language ?? "ar";
      return {
        key: lang,
        label: lang === "en" ? "الإنجليزية" : lang === "ar" ? "العربية" : lang,
      };
    };
    const byLanguage = group(
      impF.map((r) => langKey(r.user_id)),
      clkF.map((r) => langKey(r.user_id)),
    );

    // By audience segment (from item.audience.segment / .languages / promo flag)
    const segKey = (itemId: string) => {
      const it = items.get(itemId);
      const a = (it?.audience ?? {}) as {
        segment?: string;
        languages?: string[];
      };
      if (a.segment) return { key: `seg:${a.segment}`, label: `شريحة: ${a.segment}` };
      if (it?.is_promotional) return { key: "promo", label: "ترويجي" };
      if (Array.isArray(a.languages) && a.languages.length)
        return {
          key: `lang:${a.languages.join(",")}`,
          label: `لغات: ${a.languages.join("، ")}`,
        };
      return { key: "general", label: "عام" };
    };
    const bySegment = group(
      impF.map((r) => segKey(r.item_id)),
      clkF.map((r) => segKey(r.item_id)),
    );

    // By content type
    const typeLabels: Record<string, string> = {
      announcement: "إعلان",
      offer: "عرض",
      screening: "فحص",
      new_service: "خدمة جديدة",
      reminder: "تذكير",
      doctor_spotlight: "طبيب مميز",
      nearest_slot: "أقرب موعد",
      suggested_service: "خدمة مقترحة",
    };
    const typeKey = (itemId: string) => {
      const t = items.get(itemId)?.type ?? "unknown";
      return { key: t, label: typeLabels[t] ?? t };
    };
    const byType = group(
      impF.map((r) => typeKey(r.item_id)),
      clkF.map((r) => typeKey(r.item_id)),
    );

    return {
      totals,
      daily: dailySorted,
      byItem: byItem.slice(0, 50),
      byBranch,
      byLanguage,
      bySegment: bySegment.slice(0, 20),
      byType,
      window: { from, to },
      sampled:
        impressions.length >= ROW_CAP || clicks.length >= ROW_CAP,
    };
  });
