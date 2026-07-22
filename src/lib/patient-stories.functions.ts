import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PatientStory = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  excerpt: string | null;
  body_md: string | null;
  hero_image_url: string | null;
  specialty: string | null;
  published_at: string | null;
};

function serverClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const listPatientStories = createServerFn({ method: "GET" }).handler(
  async (): Promise<PatientStory[]> => {
    const { data, error } = await serverClient()
      .from("patient_stories")
      .select(
        "id, slug, title_ar, title_en, excerpt, body_md, hero_image_url, specialty, published_at",
      )
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("display_order", { ascending: true })
      .order("published_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as PatientStory[];
  },
);

export const getPatientStory = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => {
    if (!input?.slug || typeof input.slug !== "string") throw new Error("slug required");
    return { slug: input.slug.trim().toLowerCase() };
  })
  .handler(async ({ data }): Promise<PatientStory | null> => {
    const { data: rows, error } = await serverClient()
      .from("patient_stories")
      .select(
        "id, slug, title_ar, title_en, excerpt, body_md, hero_image_url, specialty, published_at",
      )
      .eq("slug", data.slug)
      .eq("status", "published")
      .not("published_at", "is", null)
      .limit(1);
    if (error) throw new Error(error.message);
    return (rows?.[0] as PatientStory | undefined) ?? null;
  });
