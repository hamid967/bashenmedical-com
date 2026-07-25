/**
 * Multi-tenant — list organizations visible to the current user.
 * super_admin sees all; other members see only orgs they belong to.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string | null;
}

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrganizationRow[]> => {
    const { data, error } = await context.supabase
      .from("organizations")
      .select("id, name_ar, name_en, slug")
      .order("name_ar", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((o) => ({
      id: o.id,
      name: o.name_ar || o.name_en,
      slug: o.slug ?? null,
    }));
  });
