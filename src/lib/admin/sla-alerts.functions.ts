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

const TestWebhookSchema = z.object({
  webhook_url: z
    .string()
    .trim()
    .max(2048)
    .regex(/^https:\/\//i, "must start with https://"),
});

export type TestWebhookResult = {
  ok: boolean;
  status: number | null;
  duration_ms: number;
  response_body: string | null;
  error: string | null;
};

export const testSlaAlertWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => TestWebhookSchema.parse(d))
  .handler(async ({ data, context }): Promise<TestWebhookResult> => {
    await assertAdmin(context.supabase, context.userId);
    const payload = {
      event: "sla.breach.test",
      kind: "response",
      item: {
        id: "00000000-0000-0000-0000-000000000000",
        request_number: "TEST-0001",
        patient_name: "اختبار Webhook",
        channel: "website",
        branch_id: null,
        priority: "high",
        status: "new",
        created_at: new Date(Date.now() - 3600_000).toISOString(),
      },
      overdue_ms: 1_800_000,
      threshold_min: 60,
      admin_link:
        (process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
          "https://bashenmedical-com.lovable.app") + "/admin/inbox",
      at: new Date().toISOString(),
      note: "This is a test event triggered from the SLA dashboard.",
    };
    const started = Date.now();
    try {
      const res = await fetch(data.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text().catch(() => "");
      return {
        ok: res.ok,
        status: res.status,
        duration_ms: Date.now() - started,
        response_body: text.slice(0, 2000),
        error: res.ok ? null : `HTTP ${res.status}`,
      };
    } catch (e: any) {
      return {
        ok: false,
        status: null,
        duration_ms: Date.now() - started,
        response_body: null,
        error: e?.message ?? "network error",
      };
    }
  });
