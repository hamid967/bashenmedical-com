import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicBranch = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  city_ar: string | null;
  city_en: string | null;
  phone: string | null;
  emergency_phone: string | null;
  address_ar: string | null;
  address_en: string | null;
  lat: number | null;
  lng: number | null;
  hero_image_url: string | null;
  description_ar: string | null;
  description_en: string | null;
  working_hours: Record<string, string> | null;
  map_embed_url: string | null;
  sort_order: number;
};

export type ExcellenceCenter = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  short_ar: string | null;
  short_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  hero_image_url: string | null;
  icon: string | null;
  specialty_id: string | null;
  sort_order: number;
};

export type BranchSpecialty = {
  id: string;
  name_ar: string;
  name_en: string;
};

export type BranchDetail = {
  branch: PublicBranch;
  centers: ExcellenceCenter[];
  specialties: BranchSpecialty[];
};

function serverClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const listPublicBranches = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicBranch[]> => {
    const { data, error } = await serverClient().rpc("list_public_branches");
    if (error) throw new Error(error.message);
    return (data ?? []) as PublicBranch[];
  },
);

export const getBranchDetail = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => {
    if (!input?.slug || typeof input.slug !== "string") throw new Error("slug required");
    return { slug: input.slug.trim().toLowerCase() };
  })
  .handler(async ({ data }): Promise<BranchDetail | null> => {
    const supabase = serverClient();
    const { data: branches, error: e1 } = await supabase.rpc("list_public_branches");
    if (e1) throw new Error(e1.message);
    const branch = (branches ?? []).find((b) => b.slug === data.slug) as PublicBranch | undefined;
    if (!branch) return null;

    const [{ data: centers, error: e2 }, { data: doctors, error: e3 }] = await Promise.all([
      supabase.rpc("list_public_excellence_centers", { _branch_id: branch.id }),
      supabase
        .from("doctors")
        .select("specialty_id, specialties:specialty_id(id, name_ar, name_en)")
        .eq("branch_id", branch.id)
        .eq("is_active", true),
    ]);
    if (e2) throw new Error(e2.message);
    if (e3) throw new Error(e3.message);

    const specMap = new Map<string, BranchSpecialty>();
    for (const row of (doctors ?? []) as Array<{ specialties: BranchSpecialty | null }>) {
      const s = row.specialties;
      if (s?.id) specMap.set(s.id, s);
    }

    return {
      branch,
      centers: (centers ?? []) as ExcellenceCenter[],
      specialties: Array.from(specMap.values()).sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")),
    };
  });

