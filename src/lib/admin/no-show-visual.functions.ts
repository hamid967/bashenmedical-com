/**
 * Admin-only visual analytics for no-show / booking funnel.
 * Returns:
 *  - Heatmap: day-of-week (0=Sun..6=Sat) × hour (0..23) with no-show rate + volume.
 *  - Funnel: booked → confirmed → completed vs no_show / cancelled.
 *  - Sparklines: per-doctor daily no-show rate over the window.
 *  - Anomalies: doctors whose recent window rate deviates strongly from baseline.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: a }, { data: s }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (!a && !s) throw new Error("Forbidden");
}

export type HeatCell = {
  dow: number; // 0..6 (Sun..Sat)
  hour: number; // 0..23
  total: number;
  no_show: number;
  no_show_rate: number; // % of decided
};

export type FunnelStage = { key: string; label_ar: string; label_en: string; count: number };

export type DoctorSparkline = {
  doctor_id: string;
  doctor_name_ar: string | null;
  total: number;
  no_show_rate: number;
  series: number[]; // no-show rate per day across window
};

export type Anomaly = {
  doctor_id: string;
  doctor_name_ar: string | null;
  recent_rate: number;
  baseline_rate: number;
  delta: number; // percentage points
  recent_total: number;
};

export type VisualAnalytics = {
  from: string;
  to: string;
  days: string[];
  heatmap: HeatCell[];
  funnel: FunnelStage[];
  doctors: DoctorSparkline[];
  anomalies: Anomaly[];
};

const inputSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
});

function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const getVisualAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof inputSchema>) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<VisualAnalytics> => {
    await assertAdmin(context);

    let q = context.supabase
      .from("appointments")
      .select("id, appointment_date, appointment_time, status, doctor_id, branch_id")
      .gte("appointment_date", data.from)
      .lte("appointment_date", data.to)
      .eq("is_demo", false);
    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);
    if (data.branchId) q = q.eq("branch_id", data.branchId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      appointment_date: string;
      appointment_time: string | null;
      status: string;
      doctor_id: string | null;
    }>;

    // Heatmap dow × hour
    const heatMap = new Map<string, { total: number; no_show: number; completed: number }>();
    for (const r of list) {
      if (!r.appointment_time) continue;
      const d = new Date(r.appointment_date + "T00:00:00Z");
      const dow = d.getUTCDay();
      const hour = parseInt(r.appointment_time.slice(0, 2), 10);
      if (Number.isNaN(hour)) continue;
      const key = `${dow}:${hour}`;
      if (!heatMap.has(key)) heatMap.set(key, { total: 0, no_show: 0, completed: 0 });
      const b = heatMap.get(key)!;
      b.total++;
      if (r.status === "no_show") b.no_show++;
      else if (r.status === "completed") b.completed++;
    }
    const heatmap: HeatCell[] = Array.from(heatMap.entries()).map(([k, v]) => {
      const [dowS, hourS] = k.split(":");
      const decided = v.completed + v.no_show;
      return {
        dow: parseInt(dowS, 10),
        hour: parseInt(hourS, 10),
        total: v.total,
        no_show: v.no_show,
        no_show_rate: decided ? Math.round((v.no_show / decided) * 1000) / 10 : 0,
      };
    });

    // Funnel
    let booked = 0, confirmed = 0, completed = 0, no_show = 0, cancelled = 0;
    for (const r of list) {
      booked++;
      if (r.status === "confirmed" || r.status === "completed" || r.status === "no_show") confirmed++;
      if (r.status === "completed") completed++;
      else if (r.status === "no_show") no_show++;
      else if (r.status === "cancelled") cancelled++;
    }
    const funnel: FunnelStage[] = [
      { key: "booked", label_ar: "محجوز", label_en: "Booked", count: booked },
      { key: "confirmed", label_ar: "مؤكد", label_en: "Confirmed", count: confirmed },
      { key: "completed", label_ar: "حضر واكتمل", label_en: "Completed", count: completed },
      { key: "no_show", label_ar: "لم يحضر", label_en: "No-show", count: no_show },
      { key: "cancelled", label_ar: "ملغي", label_en: "Cancelled", count: cancelled },
    ];

    // Doctor sparklines
    const days = enumerateDays(data.from, data.to);
    const dayIdx = new Map(days.map((d, i) => [d, i]));
    const doctorIds = Array.from(new Set(list.map((r) => r.doctor_id).filter(Boolean))) as string[];
    const doctorMap = new Map<string, string>();
    if (doctorIds.length) {
      const { data: docs } = await context.supabase
        .from("doctors")
        .select("id, name_ar")
        .in("id", doctorIds);
      for (const d of docs ?? []) doctorMap.set(d.id, d.name_ar);
    }
    const perDoctor = new Map<string, { total: number; no_show: number; series: Array<{ ns: number; dec: number }> }>();
    for (const id of doctorIds) {
      perDoctor.set(id, {
        total: 0, no_show: 0,
        series: days.map(() => ({ ns: 0, dec: 0 })),
      });
    }
    for (const r of list) {
      if (!r.doctor_id) continue;
      const b = perDoctor.get(r.doctor_id);
      const idx = dayIdx.get(r.appointment_date);
      if (!b || idx === undefined) continue;
      b.total++;
      if (r.status === "no_show") { b.no_show++; b.series[idx].ns++; b.series[idx].dec++; }
      else if (r.status === "completed") { b.series[idx].dec++; }
    }
    const doctors: DoctorSparkline[] = Array.from(perDoctor.entries())
      .map(([id, b]) => ({
        doctor_id: id,
        doctor_name_ar: doctorMap.get(id) ?? null,
        total: b.total,
        no_show_rate: b.total ? Math.round((b.no_show / b.total) * 1000) / 10 : 0,
        series: b.series.map((s) => (s.dec ? Math.round((s.ns / s.dec) * 100) : 0)),
      }))
      .filter((d) => d.total >= 3)
      .sort((a, b) => b.no_show_rate - a.no_show_rate)
      .slice(0, 25);

    // Anomalies: last 25% window vs earlier 75%
    const splitIdx = Math.floor(days.length * 0.75);
    const anomalies: Anomaly[] = [];
    for (const [id, b] of perDoctor.entries()) {
      let rNs = 0, rDec = 0, bNs = 0, bDec = 0;
      b.series.forEach((s, i) => {
        if (i >= splitIdx) { rNs += s.ns; rDec += s.dec; }
        else { bNs += s.ns; bDec += s.dec; }
      });
      if (rDec < 3 || bDec < 3) continue;
      const recent = Math.round((rNs / rDec) * 1000) / 10;
      const baseline = Math.round((bNs / bDec) * 1000) / 10;
      const delta = Math.round((recent - baseline) * 10) / 10;
      if (delta >= 15) {
        anomalies.push({
          doctor_id: id,
          doctor_name_ar: doctorMap.get(id) ?? null,
          recent_rate: recent,
          baseline_rate: baseline,
          delta,
          recent_total: rDec,
        });
      }
    }
    anomalies.sort((a, b) => b.delta - a.delta);

    return { from: data.from, to: data.to, days, heatmap, funnel, doctors, anomalies };
  });
