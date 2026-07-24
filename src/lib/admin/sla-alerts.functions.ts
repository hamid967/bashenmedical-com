/**
 * Admin config + manual sweep runner for SLA alerts.
 * Admin-only. See sla-alerts.server.ts for the sweep implementation.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STAFF_ROLES = ["admin", "super_admin"] as const;

async function assertAdmin(supabase: any, userId: string) {
  for (const r of STAFF_ROLES) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: r });
    if (data) return;
  }
  throw new Error("Forbidden");
}

export type SlaAlertConfig = {
  enabled: boolean;
  webhook_url: string | null;
  email_recipients: string[];
  min_priority: "urgent" | "high" | "normal" | "low";
  updated_at: string | null;
};

export const getSlaAlertConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SlaAlertConfig> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("sla_alert_config")
      .select("enabled, webhook_url, email_recipients, min_priority, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (
      (data as SlaAlertConfig) ?? {
        enabled: false,
        webhook_url: null,
        email_recipients: [],
        min_priority: "high",
        updated_at: null,
      }
    );
  });

const UpdateSchema = z.object({
  enabled: z.boolean(),
  webhook_url: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => v === "" || /^https:\/\//i.test(v), "must start with https://")
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  email_recipients: z.array(z.string().email()).max(20),
  min_priority: z.enum(["urgent", "high", "normal", "low"]),
});

export const updateSlaAlertConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("sla_alert_config")
      .update({
        enabled: data.enabled,
        webhook_url: data.webhook_url,
        email_recipients: data.email_recipients,
        min_priority: data.min_priority,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runSlaAlertSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { runSweep } = await import("./sla-alerts.server");
    return runSweep();
  });
