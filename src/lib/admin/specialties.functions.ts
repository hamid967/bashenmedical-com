/**
 * Admin — Specialties module.
 *
 * Read-only surface over `public.specialties` for the /admin/specialties
 * console: list with per-specialty KPIs (doctors, today's appointments)
 * and single-specialty drill-down. All handlers are `admin`-guarded.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
});

export type SpecialtyRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  doctors_count: number;
  today_appts: number;
};

export type SpecialtyKpis = {
  total: number;
  active: number;
  inactive: number;
  doctors_linked: number;
  today_appts: number;
};

export const listAdminSpecialties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    let q = sb
      .from("specialties")
      .select("id, slug, name_ar, name_en, icon, is_active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name_ar", { ascending: true });

    if (data.status === "active") q = q.eq("is_active", true);
    if (data.status === "inactive") q = q.eq("is_active", false);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`name_ar.ilike.${like},name_en.ilike.${like},slug.ilike.${like}`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const specialties = rows ?? [];
    const ids = specialties.map((s) => s.id);

    const today = new Date().toISOString().slice(0, 10);
    const [doctorsRes, apptsRes, kpisTotalsRes] = await Promise.all([
      ids.length
        ? sb.from("doctors").select("specialty_id").in("specialty_id", ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? sb
            .from("appointments")
            .select("specialty_id")
            .in("specialty_id", ids)
            .eq("appointment_date", today)
        : Promise.resolve({ data: [], error: null }),
      sb.from("specialties").select("id, is_active"),
    ]);

    const err = doctorsRes.error || apptsRes.error || kpisTotalsRes.error;
    if (err) throw new Error(err.message);

    const tally = (arr: Array<{ specialty_id: string | null }> | null) => {
      const m = new Map<string, number>();
      (arr ?? []).forEach((r) => {
        if (!r.specialty_id) return;
        m.set(r.specialty_id, (m.get(r.specialty_id) ?? 0) + 1);
      });
      return m;
    };
    const docs = tally(doctorsRes.data as unknown);
    const appts = tally(apptsRes.data as unknown);

    const enriched: SpecialtyRow[] = specialties.map((s) => ({
      ...s,
      doctors_count: docs.get(s.id) ?? 0,
      today_appts: appts.get(s.id) ?? 0,
    }));

    const all = (kpisTotalsRes.data ?? []) as Array<{
      id: string;
      is_active: boolean;
    }>;
    const kpis: SpecialtyKpis = {
      total: all.length,
      active: all.filter((s) => s.is_active).length,
      inactive: all.filter((s) => !s.is_active).length,
      doctors_linked: (doctorsRes.data ?? []).length,
      today_appts: (apptsRes.data ?? []).length,
    };

    return { rows: enriched, kpis };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminSpecialty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    const { data: specialty, error } = await sb
      .from("specialties")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!specialty) throw new Error("التخصص غير موجود");

    const today = new Date().toISOString().slice(0, 10);
    const [doctorsRes, todayApptsRes, upcomingApptsRes] = await Promise.all([
      sb
        .from("doctors")
        .select("id, name_ar, name_en, is_active, branch_id")
        .eq("specialty_id", data.id)
        .order("name_ar", { ascending: true })
        .limit(100),
      sb
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("specialty_id", data.id)
        .eq("appointment_date", today),
      sb
        .from("appointments")
        .select("id, appointment_date, appointment_time, status, patient_name")
        .eq("specialty_id", data.id)
        .gte("appointment_date", today)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true })
        .limit(20),
    ]);

    const err = doctorsRes.error || todayApptsRes.error || upcomingApptsRes.error;
    if (err) throw new Error(err.message);

    return {
      specialty,
      doctors: doctorsRes.data ?? [],
      today_appts: todayApptsRes.count ?? 0,
      upcoming_appts: upcomingApptsRes.data ?? [],
    };
  });
