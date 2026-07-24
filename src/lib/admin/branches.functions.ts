/**
 * Admin — Branches module.
 *
 * Read-only surface over `public.branches` for the /admin/branches
 * console: list with per-branch KPIs (doctors, today's appointments,
 * excellence-center links) and single-branch drill-down. All handlers
 * are `admin`-guarded.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
});

export type BranchRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  city_ar: string | null;
  city_en: string | null;
  phone: string | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string;
  doctors_count: number;
  today_appts: number;
  excellence_centers_count: number;
};

export type BranchKpis = {
  total: number;
  active: number;
  inactive: number;
  doctors_assigned: number;
  today_appts: number;
};

export const listAdminBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    let q = sb
      .from("branches")
      .select(
        "id, slug, name_ar, name_en, city_ar, city_en, phone, is_active, sort_order, updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("name_ar", { ascending: true });

    if (data.status === "active") q = q.eq("is_active", true);
    if (data.status === "inactive") q = q.eq("is_active", false);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(
        `name_ar.ilike.${like},name_en.ilike.${like},city_ar.ilike.${like},city_en.ilike.${like},slug.ilike.${like}`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const branches = rows ?? [];
    const ids = branches.map((b) => b.id);

    // Per-branch aggregates. All parallel; empty when no branches.
    const today = new Date().toISOString().slice(0, 10);
    const [doctorsRes, apptsRes, ecRes, kpisTotalsRes] = await Promise.all([
      ids.length
        ? sb.from("doctors").select("branch_id").in("branch_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? sb
            .from("appointments")
            .select("branch_id")
            .in("branch_id", ids)
            .eq("appointment_date", today)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? sb
            .from("branch_excellence_centers")
            .select("branch_id")
            .in("branch_id", ids)
        : Promise.resolve({ data: [], error: null }),
      sb.from("branches").select("id, is_active"),
    ]);

    const err =
      doctorsRes.error || apptsRes.error || ecRes.error || kpisTotalsRes.error;
    if (err) throw new Error(err.message);

    const tally = (arr: Array<{ branch_id: string | null }> | null) => {
      const m = new Map<string, number>();
      (arr ?? []).forEach((r) => {
        if (!r.branch_id) return;
        m.set(r.branch_id, (m.get(r.branch_id) ?? 0) + 1);
      });
      return m;
    };
    const docs = tally(doctorsRes.data as any);
    const appts = tally(apptsRes.data as any);
    const ecs = tally(ecRes.data as any);

    const enriched: BranchRow[] = branches.map((b) => ({
      ...b,
      doctors_count: docs.get(b.id) ?? 0,
      today_appts: appts.get(b.id) ?? 0,
      excellence_centers_count: ecs.get(b.id) ?? 0,
    }));

    // Global KPIs computed from the full branches set (unfiltered) so the
    // header numbers stay stable while the user filters the table below.
    const allBranches = (kpisTotalsRes.data ?? []) as Array<{
      id: string;
      is_active: boolean;
    }>;
    const kpis: BranchKpis = {
      total: allBranches.length,
      active: allBranches.filter((b) => b.is_active).length,
      inactive: allBranches.filter((b) => !b.is_active).length,
      doctors_assigned: (doctorsRes.data ?? []).length,
      today_appts: (apptsRes.data ?? []).length,
    };

    return { rows: enriched, kpis };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminBranch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    const { data: branch, error } = await sb
      .from("branches")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!branch) throw new Error("الفرع غير موجود");

    const today = new Date().toISOString().slice(0, 10);
    const [doctorsRes, ecRes, todayApptsRes, upcomingApptsRes] =
      await Promise.all([
        sb
          .from("doctors")
          .select("id, full_name_ar, full_name_en, specialty, is_active")
          .eq("branch_id", data.id)
          .order("full_name_ar", { ascending: true })
          .limit(50),
        sb
          .from("branch_excellence_centers")
          .select("excellence_center_id, excellence_centers(id, name_ar, name_en, slug)")
          .eq("branch_id", data.id),
        sb
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", data.id)
          .eq("appointment_date", today),
        sb
          .from("appointments")
          .select("id, appointment_date, appointment_time, status, patient_name")
          .eq("branch_id", data.id)
          .gte("appointment_date", today)
          .order("appointment_date", { ascending: true })
          .order("appointment_time", { ascending: true })
          .limit(20),
      ]);

    const err =
      doctorsRes.error ||
      ecRes.error ||
      todayApptsRes.error ||
      upcomingApptsRes.error;
    if (err) throw new Error(err.message);

    return {
      branch,
      doctors: doctorsRes.data ?? [],
      excellence_centers: (ecRes.data ?? []).map((r: any) => r.excellence_centers).filter(Boolean),
      today_appts: todayApptsRes.count ?? 0,
      upcoming_appts: upcomingApptsRes.data ?? [],
    };
  });
