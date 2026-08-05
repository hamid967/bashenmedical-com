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
  slug: string;
  name_ar: string;
  name_en: string;
  icon: string | null;
  description_ar: string | null;
  description_en: string | null;
};

export type BranchDoctor = {
  id: string;
  slug: string | null;
  name_ar: string;
  name_en: string | null;
  title_ar: string | null;
  title_en: string | null;
  photo_url: string | null;
  years_experience: number | null;
  avg_rating: number | null;
  specialty_id: string | null;
  specialty_name_ar: string | null;
  specialty_slug: string | null;
};

export type BranchDetail = {
  branch: PublicBranch;
  centers: ExcellenceCenter[];
  specialties: BranchSpecialty[];
  doctors: BranchDoctor[];
};

/** Hide seed/E2E rows from public branch showcases. */
function isPublicFacingDoctor(row: {
  name_ar?: string | null;
  name_en?: string | null;
  slug?: string | null;
}): boolean {
  const blob = `${row.name_ar ?? ""} ${row.name_en ?? ""} ${row.slug ?? ""}`;
  if (/\b(DEMO|E2E)\b/i.test(blob)) return false;
  if (/^Doctor [AB] \d+/i.test(row.name_en ?? "") || /^Doctor [AB] \d+/i.test(row.name_ar ?? ""))
    return false;
  if ((row.slug ?? "").toLowerCase() === "e2e-doctor") return false;
  return true;
}

function serverClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const listPublicBranches = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicBranch[]> => {
    const { data, error } = await serverClient().rpc("list_public_branches");
    if (error) throw new Error(error.message);
    // Keep E2E seed branches out of public listings.
    return ((data ?? []) as PublicBranch[]).filter(
      (b) => b.slug !== "e2e-branch" && !/\bE2E\b/i.test(`${b.name_ar} ${b.name_en}`),
    );
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
        .select(
          "id, slug, name_ar, name_en, title_ar, title_en, photo_url, years_experience, avg_rating, specialty_id, specialties:specialty_id(id, slug, name_ar, name_en, icon, description_ar, description_en)",
        )
        .eq("branch_id", branch.id)
        .eq("is_active", true)
        .order("name_ar"),
    ]);
    if (e2) throw new Error(e2.message);
    if (e3) throw new Error(e3.message);

    type DocRow = {
      id: string;
      slug: string | null;
      name_ar: string;
      name_en: string | null;
      title_ar: string | null;
      title_en: string | null;
      photo_url: string | null;
      years_experience: number | null;
      avg_rating: number | null;
      specialty_id: string | null;
      specialties: BranchSpecialty | null;
    };

    const publicDoctors = ((doctors ?? []) as DocRow[]).filter(isPublicFacingDoctor);

    const specMap = new Map<string, BranchSpecialty>();
    for (const row of publicDoctors) {
      const s = row.specialties;
      if (s?.id) {
        specMap.set(s.id, {
          id: s.id,
          slug: s.slug,
          name_ar: s.name_ar,
          name_en: s.name_en,
          icon: s.icon ?? null,
          description_ar: s.description_ar ?? null,
          description_en: s.description_en ?? null,
        });
      }
    }

    const branchDoctors: BranchDoctor[] = publicDoctors.map((d) => ({
      id: d.id,
      slug: d.slug,
      name_ar: d.name_ar,
      name_en: d.name_en,
      title_ar: d.title_ar,
      title_en: d.title_en,
      photo_url: d.photo_url,
      years_experience: d.years_experience,
      avg_rating: d.avg_rating,
      specialty_id: d.specialty_id,
      specialty_name_ar: d.specialties?.name_ar ?? null,
      specialty_slug: d.specialties?.slug ?? null,
    }));

    return {
      branch,
      centers: (centers ?? []) as ExcellenceCenter[],
      specialties: Array.from(specMap.values()).sort((a, b) =>
        a.name_ar.localeCompare(b.name_ar, "ar"),
      ),
      doctors: branchDoctors,
    };
  });
