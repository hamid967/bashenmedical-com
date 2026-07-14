import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STATUSES = ["pending_review", "published", "rejected"] as const;
export type PatientStoryStatus = (typeof STATUSES)[number];

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

export const listPatientStoriesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { status?: PatientStoryStatus | "all" } | undefined) =>
    z
      .object({ status: z.enum([...STATUSES, "all"]).optional() })
      .optional()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("patient_stories")
      .select(
        "id, slug, title_ar, title_en, excerpt, hero_image_url, specialty, status, published_at, display_order, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setPatientStoryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; status: PatientStoryStatus }) =>
    z.object({ id: z.string().uuid(), status: z.enum(STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch: { status: PatientStoryStatus; published_at: string | null } = {
      status: data.status,
      published_at:
        data.status === "published" ? new Date().toISOString() : null,
    };
    const { error } = await context.supabase
      .from("patient_stories")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
