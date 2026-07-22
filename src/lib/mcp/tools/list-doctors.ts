import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

/**
 * List doctors with rich, SQL-level filters.
 *
 * "Smart default branch": MCP tools are stateless — there is no browser or
 * session context. The signed-in user's default branch (if any) comes from
 * their `profiles.default_branch_id` when present; otherwise the caller may
 * pass `default_branch_slug` as an explicit fallback. Explicit `branch_slug`
 * always wins over both.
 */
export default defineTool({
  name: "list_doctors",
  title: "List doctors",
  description:
    "List active doctors at Baeshen Medical Complex with rich filters (specialty, branch, language, gender, name search, booking-enabled). When no branch is supplied, falls back to the signed-in user's default branch, or to `default_branch_slug` if provided.",
  inputSchema: {
    branch_slug: z.string().trim().optional().describe("Branch slug filter (exact)."),
    specialty_slug: z.string().trim().optional().describe("Specialty slug filter (exact)."),
    default_branch_slug: z
      .string()
      .trim()
      .optional()
      .describe(
        "Fallback branch slug used only when `branch_slug` is not given and the user has no stored default branch.",
      ),
    language: z
      .string()
      .trim()
      .optional()
      .describe("Filter by a language the doctor speaks (e.g. `ar`, `en`)."),
    gender: z.enum(["male", "female"]).optional().describe("Filter by doctor gender."),
    search: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe("Case-insensitive name search across Arabic/English names."),
    booking_enabled: z
      .boolean()
      .optional()
      .describe("If true, return only doctors with online booking enabled."),
    sort: z
      .enum(["sort_order", "rating", "experience", "name"])
      .optional()
      .describe("Sort key (default: sort_order)."),
    limit: z.number().int().min(1).max(50).optional().describe("Max rows (default 20)."),
    offset: z.number().int().min(0).optional().describe("Row offset for pagination."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx: ToolContext) => {
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: ctx.isAuthenticated()
          ? { headers: { Authorization: `Bearer ${ctx.getToken()}` } }
          : undefined,
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    // Resolve effective branch: explicit > user profile default > caller fallback.
    let effectiveBranchSlug = input.branch_slug ?? null;
    let branchSource: "explicit" | "profile_default" | "fallback" | "none" = input.branch_slug
      ? "explicit"
      : "none";

    const userId = ctx.isAuthenticated() ? ctx.getUserId() : undefined;
    if (!effectiveBranchSlug && userId) {
      // Best-effort: profiles may not carry a default_branch_id — ignore errors.
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_branch_id")
        .eq("id", userId)
        .maybeSingle<{ default_branch_id: string | null }>();
      if (profile?.default_branch_id) {
        const { data: br } = await supabase
          .from("branches")
          .select("slug")
          .eq("id", profile.default_branch_id)
          .maybeSingle<{ slug: string }>();
        if (br?.slug) {
          effectiveBranchSlug = br.slug;
          branchSource = "profile_default";
        }
      }
    }
    if (!effectiveBranchSlug && input.default_branch_slug) {
      effectiveBranchSlug = input.default_branch_slug;
      branchSource = "fallback";
    }

    // Resolve slug filters to IDs so we can filter in SQL, not in JS.
    let branchId: string | null = null;
    if (effectiveBranchSlug) {
      const { data: br } = await supabase
        .from("branches")
        .select("id")
        .eq("slug", effectiveBranchSlug)
        .maybeSingle<{ id: string }>();
      if (!br) {
        return {
          content: [{ type: "text", text: `Branch not found: ${effectiveBranchSlug}` }],
          isError: true,
        };
      }
      branchId = br.id;
    }

    let specialtyId: string | null = null;
    if (input.specialty_slug) {
      const { data: sp } = await supabase
        .from("specialties")
        .select("id")
        .eq("slug", input.specialty_slug)
        .maybeSingle<{ id: string }>();
      if (!sp) {
        return {
          content: [{ type: "text", text: `Specialty not found: ${input.specialty_slug}` }],
          isError: true,
        };
      }
      specialtyId = sp.id;
    }

    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    let query = supabase
      .from("doctors")
      .select(
        "id, slug, name_ar, name_en, title_ar, title_en, gender, languages, years_experience, booking_enabled, avg_rating, ratings_count, specialties:specialty_id(slug, name_ar, name_en), branches:branch_id(slug, name_ar, name_en)",
        { count: "exact" },
      )
      .eq("is_active", true);

    if (branchId) query = query.eq("branch_id", branchId);
    if (specialtyId) query = query.eq("specialty_id", specialtyId);
    if (input.gender) query = query.eq("gender", input.gender);
    if (input.booking_enabled !== undefined)
      query = query.eq("booking_enabled", input.booking_enabled);
    if (input.language) query = query.contains("languages", [input.language]);
    if (input.search) {
      const s = `%${input.search}%`;
      query = query.or(`name_ar.ilike.${s},name_en.ilike.${s}`);
    }

    switch (input.sort) {
      case "rating":
        query = query.order("avg_rating", { ascending: false, nullsFirst: false });
        break;
      case "experience":
        query = query.order("years_experience", { ascending: false, nullsFirst: false });
        break;
      case "name":
        query = query.order("name_ar", { ascending: true });
        break;
      default:
        query = query.order("sort_order", { ascending: true });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }

    const payload = {
      filters: {
        branch_slug: effectiveBranchSlug,
        branch_source: branchSource,
        specialty_slug: input.specialty_slug ?? null,
        language: input.language ?? null,
        gender: input.gender ?? null,
        search: input.search ?? null,
        booking_enabled: input.booking_enabled ?? null,
        sort: input.sort ?? "sort_order",
      },
      total: count ?? null,
      offset,
      limit,
      doctors: data ?? [],
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
