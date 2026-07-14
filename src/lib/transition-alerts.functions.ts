/**
 * Server functions for managing transition alert rules.
 * Rules live in the `transition_alert_rules` table with RLS:
 * - owners see/modify their own
 * - shared rules are readable by all staff
 * - update/delete of shared rules restricted to owner or super_admin
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { AlertRule, AlertScope, AlertStatus } from "./transition-alerts";

const ScopeSchema = z.enum(["branch", "actor", "any"]);
const StatusSchema = z.enum(["active", "inactive", "archived", "deceased", "any"]);

const RuleInput = z.object({
  label: z.string().trim().max(120).optional().nullable(),
  scope: ScopeSchema,
  status: StatusSchema,
  threshold: z.number().int().min(1).max(100000),
  enabled: z.boolean().default(true),
  is_shared: z.boolean().default(false),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRule(r: any): AlertRule {
  return {
    id: String(r.id),
    label: r.label ?? undefined,
    scope: r.scope as AlertScope,
    status: r.status as AlertStatus,
    threshold: Number(r.threshold) || 1,
    enabled: r.enabled !== false,
    is_shared: r.is_shared === true,
    user_id: r.user_id ? String(r.user_id) : undefined,
    is_owner: false, // filled in below
  };
}

export const listAlertRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AlertRule[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const { data, error } = await sb
      .from("transition_alert_rules")
      .select("id, user_id, label, scope, status, threshold, enabled, is_shared, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((r) => ({
      ...rowToRule(r),
      is_owner: r.user_id === context.userId,
    }));
  });

export const createAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => RuleInput.parse(d))
  .handler(async ({ data, context }): Promise<AlertRule> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("transition_alert_rules")
      .insert({
        user_id: context.userId,
        label: data.label?.trim() || null,
        scope: data.scope,
        status: data.status,
        threshold: data.threshold,
        enabled: data.enabled,
        is_shared: data.is_shared,
      })
      .select("id, user_id, label, scope, status, threshold, enabled, is_shared")
      .single();
    if (error) throw new Error(error.message);
    return { ...rowToRule(row), is_owner: true };
  });

const UpdateInput = RuleInput.partial().extend({ id: z.string().uuid() });

export const updateAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => UpdateInput.parse(d))
  .handler(async ({ data, context }): Promise<AlertRule> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch.label = data.label?.trim() || null;
    if (data.scope !== undefined) patch.scope = data.scope;
    if (data.status !== undefined) patch.status = data.status;
    if (data.threshold !== undefined) patch.threshold = data.threshold;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.is_shared !== undefined) patch.is_shared = data.is_shared;
    const { data: row, error } = await sb
      .from("transition_alert_rules")
      .update(patch)
      .eq("id", data.id)
      .select("id, user_id, label, scope, status, threshold, enabled, is_shared")
      .single();
    if (error) throw new Error(error.message);
    return { ...rowToRule(row), is_owner: row.user_id === context.userId };
  });

export const deleteAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = context.supabase;
    const { error } = await sb
      .from("transition_alert_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
