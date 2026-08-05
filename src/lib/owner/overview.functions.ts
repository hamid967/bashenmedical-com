/**
 * Owner — Control Hub overview KPIs for Site Builder.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertContentAccess } from "./_access";

export type OwnerOverviewKpis = {
  services_total: number;
  services_active: number;
  services_portal: number;
  pages_total: number;
  pages_published: number;
  specialties_total: number;
  specialties_active: number;
  excellence_total: number;
  excellence_active: number;
  media_total: number;
};

export const getOwnerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertContentAccess(context.supabase, context.userId);
    const sb = context.supabase;

    const [services, pages, specialties, excellence, media] = await Promise.all([
      sb.from("service_catalog").select("id, is_active, show_in_portal"),
      sb.from("custom_pages").select("id, status"),
      sb.from("specialties").select("id, is_active"),
      sb.from("excellence_centers").select("id, is_active"),
      sb.from("media_library").select("id", { count: "exact", head: true }),
    ]);

    const err =
      services.error || pages.error || specialties.error || excellence.error || media.error;
    if (err) throw new Error(err.message);

    const svc = services.data ?? [];
    const pgs = pages.data ?? [];
    const specs = specialties.data ?? [];
    const exc = excellence.data ?? [];

    const kpis: OwnerOverviewKpis = {
      services_total: svc.length,
      services_active: svc.filter((s) => s.is_active).length,
      services_portal: svc.filter((s) => s.show_in_portal && s.is_active).length,
      pages_total: pgs.length,
      pages_published: pgs.filter((p) => p.status === "published").length,
      specialties_total: specs.length,
      specialties_active: specs.filter((s) => s.is_active).length,
      excellence_total: exc.length,
      excellence_active: exc.filter((e) => e.is_active).length,
      media_total: media.count ?? 0,
    };

    return kpis;
  });
