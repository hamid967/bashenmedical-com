/**
 * Phase 6 — Patient content & recommendation engine.
 * Server functions used by the patient dashboard to fetch a personalized,
 * targeted feed of announcements/offers/screening/etc. and to log
 * impressions/clicks.
 *
 * Recommendation inputs are limited to authored / general prefs (preferred
 * branch, language, previously booked specialty, availability). We never
 * infer a medical condition from records.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ContentItemType =
  | "announcement"
  | "offer"
  | "screening"
  | "new_service"
  | "reminder"
  | "doctor_spotlight"
  | "nearest_slot"
  | "suggested_service";

export interface ContentFeedItem {
  id: string;
  type: ContentItemType;
  title: string;
  body: string | null;
  excerpt: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
  is_promotional: boolean;
  priority: number;
  branch_id: string | null;
  specialty_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

interface RawRow {
  id: string;
  type: ContentItemType;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  excerpt_ar: string | null;
  excerpt_en: string | null;
  image_url: string | null;
  cta_label_ar: string | null;
  cta_label_en: string | null;
  cta_href: string | null;
  is_promotional: boolean;
  priority: number;
  branch_id: string | null;
  specialty_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  audience: Record<string, unknown> | null;
}

const FeedInput = z
  .object({
    surface: z.string().max(64).optional(),
    limit: z.number().int().min(1).max(30).optional(),
  })
  .optional();

/** Fetch the current patient's personalized feed. */
export const getPatientContentFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => FeedInput.parse(input) ?? {})
  .handler(async ({ context, data }): Promise<ContentFeedItem[]> => {
    const { supabase, userId } = context;
    const limit = data?.limit ?? 12;
    const surface = data?.surface ?? "dashboard_bento";

    // Personalization inputs
    const [profileRes, apptRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("preferred_language, default_branch_id")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("appointments")
        .select("specialty_id")
        .eq("patient_id", userId)
        .not("specialty_id", "is", null)
        .limit(20),
    ]);

    const lang =
      (profileRes.data?.preferred_language as "ar" | "en" | undefined) ?? "ar";
    const preferredBranch = profileRes.data?.default_branch_id ?? null;
    const bookedSpecialties = Array.from(
      new Set(
        (apptRes.data ?? [])
          .map((r: { specialty_id: string | null }) => r.specialty_id)
          .filter((v): v is string => !!v),
      ),
    );

    // RLS already limits to published, in-window, non-disabled rows.
    // We further filter by surface and rank by priority.
    const sel = (s: string): string => s;
    const q = supabase
      .from("content_items")
      .select(
        sel(
          "id,type,title_ar,title_en,body_ar,body_en,excerpt_ar,excerpt_en," +
            "image_url,cta_label_ar,cta_label_en,cta_href,is_promotional,priority," +
            "branch_id,specialty_id,starts_at,ends_at,audience,surface",
        ),
      )
      .eq("surface", surface)
      .order("priority", { ascending: false })
      .order("starts_at", { ascending: false })
      .limit(limit * 3); // over-fetch, then filter in JS

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const filtered = ((rows ?? []) as unknown as (RawRow & { surface: string })[])
      .filter((row) => matchesAudience(row, { lang, preferredBranch, bookedSpecialties }))
      .slice(0, limit);

    return filtered.map<ContentFeedItem>((row) => ({
      id: row.id,
      type: row.type,
      title: lang === "en" ? row.title_en || row.title_ar : row.title_ar || row.title_en,
      body:
        lang === "en"
          ? row.body_en ?? row.body_ar
          : row.body_ar ?? row.body_en,
      excerpt:
        lang === "en"
          ? row.excerpt_en ?? row.excerpt_ar
          : row.excerpt_ar ?? row.excerpt_en,
      image_url: row.image_url,
      cta_label:
        lang === "en"
          ? row.cta_label_en ?? row.cta_label_ar
          : row.cta_label_ar ?? row.cta_label_en,
      cta_href: row.cta_href,
      is_promotional: row.is_promotional,
      priority: row.priority,
      branch_id: row.branch_id,
      specialty_id: row.specialty_id,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
    }));
  });

function matchesAudience(
  row: RawRow,
  ctx: { lang: "ar" | "en"; preferredBranch: string | null; bookedSpecialties: string[] },
): boolean {
  const a = (row.audience ?? {}) as {
    languages?: string[];
    preferredBranch?: string[];
    hasBookedSpecialty?: string[];
  };
  if (Array.isArray(a.languages) && a.languages.length > 0) {
    if (!a.languages.includes(ctx.lang)) return false;
  }
  if (Array.isArray(a.preferredBranch) && a.preferredBranch.length > 0) {
    if (!ctx.preferredBranch || !a.preferredBranch.includes(ctx.preferredBranch)) {
      return false;
    }
  }
  if (Array.isArray(a.hasBookedSpecialty) && a.hasBookedSpecialty.length > 0) {
    if (!ctx.bookedSpecialties.some((s) => a.hasBookedSpecialty!.includes(s))) {
      return false;
    }
  }
  // Branch/specialty affinity: if row is scoped to a branch, prefer only when
  // the patient's preferred branch matches or is null.
  if (row.branch_id && ctx.preferredBranch && row.branch_id !== ctx.preferredBranch) {
    return false;
  }
  return true;
}

/* -------------------------- Tracking ---------------------------------- */

const TrackInput = z.object({
  itemId: z.string().uuid(),
  surface: z.string().max(64).optional(),
  href: z.string().max(2048).optional(),
});

export const logContentImpression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => TrackInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await supabase.from("content_impressions").insert({
      item_id: data.itemId,
      user_id: userId,
      surface: data.surface ?? null,
    });
    return { ok: true };
  });

export const logContentClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => TrackInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await supabase.from("content_clicks").insert({
      item_id: data.itemId,
      user_id: userId,
      surface: data.surface ?? null,
      href_at_click: data.href ?? null,
    });
    return { ok: true };
  });
