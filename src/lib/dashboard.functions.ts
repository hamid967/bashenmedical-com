/**
 * Dashboard server functions — read-only aggregates for the admin dashboard.
 * All calls go through SECURITY DEFINER Postgres functions that assert the
 * caller has admin/super_admin/reception role; the middleware here just
 * attaches the bearer token.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BranchInput = z.object({ branchId: z.string().uuid().nullable().optional() }).default({});

const BranchDaysInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    days: z.number().int().min(1).max(365).optional(),
  })
  .default({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (name: string, args?: Record<string, unknown>) => any;

export const listBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("branches" as never)
      .select("id, slug, name_ar, name_en, city_ar, is_active")
      .eq("is_active", true)
      .order("name_ar");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      slug: string;
      name_ar: string;
      name_en: string;
      city_ar: string | null;
      is_active: boolean;
    }>;
  });

export type DashboardKpis = {
  today_total: number;
  today_confirmed: number;
  today_new: number;
  today_cancelled: number;
  today_no_show: number;
  today_completed: number;
  today_unique_patients: number;
  pharmacy_today_new: number;
  active_doctors: number;
  notifications_unread: number;
  week_total: number;
  week_capacity: number;
  occupancy_pct: number;
};

export const getDashboardKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BranchInput.parse(input))
  .handler(async ({ data, context }) => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: res, error } = await rpc.call(context.supabase, "dashboard_kpis", {
      _branch_id: data.branchId ?? null,
    });
    if (error) throw new Error(error.message);
    return (res ?? {}) as DashboardKpis;
  });

export const getDashboardDaily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BranchDaysInput.parse(input))
  .handler(async ({ data, context }) => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: res, error } = await rpc.call(context.supabase, "dashboard_appointments_daily", {
      _branch_id: data.branchId ?? null,
      _days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    return (res ?? []) as Array<{
      day: string;
      total: number;
      confirmed: number;
      cancelled: number;
      no_show: number;
    }>;
  });

export const getDashboardStatusBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BranchDaysInput.parse(input))
  .handler(async ({ data, context }) => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: res, error } = await rpc.call(context.supabase, "dashboard_status_breakdown", {
      _branch_id: data.branchId ?? null,
      _days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    return (res ?? []) as Array<{ status: string; count: number }>;
  });

export const getDashboardBySpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BranchDaysInput.parse(input))
  .handler(async ({ data, context }) => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: res, error } = await rpc.call(context.supabase, "dashboard_by_specialty", {
      _branch_id: data.branchId ?? null,
      _days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    return (res ?? []) as Array<{
      specialty_id: string | null;
      name_ar: string | null;
      name_en: string | null;
      count: number;
    }>;
  });

export const getDashboardPeakHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BranchDaysInput.parse(input))
  .handler(async ({ data, context }) => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: res, error } = await rpc.call(context.supabase, "dashboard_peak_hours", {
      _branch_id: data.branchId ?? null,
      _days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    return (res ?? []) as Array<{ hour: number; count: number }>;
  });

export const getDashboardUpcoming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BranchInput.parse(input))
  .handler(async ({ data, context }) => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: res, error } = await rpc.call(context.supabase, "dashboard_upcoming", {
      _branch_id: data.branchId ?? null,
      _limit: 25,
    });
    if (error) throw new Error(error.message);
    return (res ?? []) as Array<{
      id: string;
      patient_name: string;
      patient_phone: string;
      appointment_date: string;
      appointment_time: string;
      status: string;
      doctor_name_ar: string | null;
      specialty_name_ar: string | null;
    }>;
  });

export const getDashboardRecentActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => BranchInput.parse(input))
  .handler(async ({ data, context }) => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;
    const { data: res, error } = await rpc.call(context.supabase, "dashboard_recent_activity", {
      _branch_id: data.branchId ?? null,
      _limit: 15,
    });
    if (error) throw new Error(error.message);
    return (res ?? []) as Array<{
      id: string;
      appointment_id: string;
      changed_at: string;
      old_status: string | null;
      new_status: string | null;
      reason: string | null;
      patient_name: string;
    }>;
  });
