/**
 * Command Center — aggregated read-only KPIs for the admin dashboard shell.
 * Combines the existing `dashboard_kpis` RPC with a few direct counts.
 * Any KPI without real backing data yet is returned with `mock: true`
 * so the UI can label it visibly.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CommandCenterKpis = {
  today_patients: number;
  active_doctors: number;
  appointments_today: number;
  revenue_today_sar: number;
  emergency_cases: number;
  surgeries_today: number;
  occupancy_pct: number;
  avg_wait_minutes: number;
  online_bookings_today: number;
  satisfaction_pct: number;
  insurance_claims_open: number;
  ai_predictions: number;
  daily_flow: Array<{ day: string; total: number; confirmed: number }>;
  mock_flags: {
    revenue: boolean;
    emergency: boolean;
    surgeries: boolean;
    wait: boolean;
    satisfaction: boolean;
    insurance: boolean;
    ai: boolean;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (name: string, args?: Record<string, unknown>) => any;

export const getCommandCenterKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<CommandCenterKpis> => {
    const rpc = (context.supabase as unknown as { rpc: Rpc }).rpc;

    const [kpisRes, dailyRes] = await Promise.all([
      rpc.call(context.supabase, "dashboard_kpis", { _branch_id: null }),
      rpc.call(context.supabase, "dashboard_appointments_daily", {
        _branch_id: null,
        _days: 7,
      }),
    ]);

    const k = (kpisRes?.data ?? {}) as Record<string, number>;
    const daily = ((dailyRes?.data ?? []) as Array<{
      day: string;
      total: number;
      confirmed: number;
    }>).slice(-7);

    return {
      today_patients: Number(k.today_unique_patients ?? 0),
      active_doctors: Number(k.active_doctors ?? 0),
      appointments_today: Number(k.today_total ?? 0),
      revenue_today_sar: 0,
      emergency_cases: 0,
      surgeries_today: 0,
      occupancy_pct: Number(k.occupancy_pct ?? 0),
      avg_wait_minutes: 0,
      online_bookings_today: Number(k.today_new ?? 0),
      satisfaction_pct: 0,
      insurance_claims_open: 0,
      ai_predictions: 0,
      daily_flow: daily,
      mock_flags: {
        revenue: true,
        emergency: true,
        surgeries: true,
        wait: true,
        satisfaction: true,
        insurance: true,
        ai: true,
      },
    };
  });
