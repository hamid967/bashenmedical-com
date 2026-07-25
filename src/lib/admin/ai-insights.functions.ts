/**
 * Admin — G3 Analytics AI console fns.
 * Read no-show predictions, AI recommendations, and AI-classified complaints.
 * Mutations (decide on recommendation, override classification) require
 * `admin` or `super_admin` role via `_guard.assertHasRole`.
 *
 * Multi-tenant: all list fns accept an optional `organizationId` filter so
 * the admin console TenantSwitcher can scope AI Insights to a single org.
 * RLS already restricts rows to orgs the caller belongs to; this filter
 * narrows further within that visibility.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

export interface NoShowPredictionRow {
  appointment_id: string;
  risk: number;
  top_factors: { key: string; weight: number; note: string }[];
  recommendation: string | null;
  computed_at: string;
  appointment_date: string | null;
  appointment_time: string | null;
  branch_id: string | null;
  doctor_id: string | null;
  status: string | null;
}

export const listNoShowPredictions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: { minRisk?: number; limit?: number; organizationId?: string | null }) =>
    z
      .object({
        minRisk: z.number().min(0).max(1).default(0.5),
        limit: z.number().int().min(1).max(500).default(100),
        organizationId: z.string().uuid().nullable().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    let q = context.supabase
      .from("no_show_predictions")
      .select(
        "appointment_id, risk, top_factors, recommendation, computed_at, appointments!inner(appointment_date, appointment_time, branch_id, doctor_id, status)",
      )
      .gte("risk", data.minRisk);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q.order("risk", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      appointment_id: r.appointment_id,
      risk: Number(r.risk),
      top_factors: r.top_factors ?? [],
      recommendation: r.recommendation,
      computed_at: r.computed_at,
      appointment_date: r.appointments?.appointment_date ?? null,
      appointment_time: r.appointments?.appointment_time ?? null,
      branch_id: r.appointments?.branch_id ?? null,
      doctor_id: r.appointments?.doctor_id ?? null,
      status: r.appointments?.status ?? null,
    })) as NoShowPredictionRow[];
  });

export const listAiRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: {
      status?: "open" | "accepted" | "dismissed";
      limit?: number;
      organizationId?: string | null;
    }) =>
      z
        .object({
          status: z.enum(["open", "accepted", "dismissed"]).default("open"),
          limit: z.number().int().min(1).max(200).default(50),
          organizationId: z.string().uuid().nullable().optional(),
        })
        .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    let q = context.supabase.from("ai_recommendations").select("*").eq("status", data.status);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q
      .order("generated_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const decideAiRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; decision: "accepted" | "dismissed" }) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["accepted", "dismissed"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { error } = await context.supabase
      .from("ai_recommendations")
      .update({
        status: data.decision,
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listClassifiedComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: { limit?: number; organizationId?: string | null }) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        organizationId: z.string().uuid().nullable().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    let q = context.supabase
      .from("complaints")
      .select(
        "id, reference, type, status, department, ai_category, ai_severity, ai_suggested_owner, ai_classified_at, ai_model, created_at",
      )
      .not("ai_classified_at", "is", null);
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q
      .order("ai_classified_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const overrideComplaintClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: { id: string; ai_category?: string; ai_severity?: string; ai_suggested_owner?: string }) =>
      z
        .object({
          id: z.string().uuid(),
          ai_category: z.string().max(50).optional(),
          ai_severity: z.enum(["low", "medium", "high", "critical"]).optional(),
          ai_suggested_owner: z.string().max(50).optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const patch: Record<string, unknown> = { ai_model: "manual-override" };
    if (data.ai_category) patch.ai_category = data.ai_category;
    if (data.ai_severity) patch.ai_severity = data.ai_severity;
    if (data.ai_suggested_owner) patch.ai_suggested_owner = data.ai_suggested_owner;
    patch.ai_classified_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("complaints")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
