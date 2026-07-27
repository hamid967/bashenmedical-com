/**
 * Super Admin monitoring & feature-flags server functions.
 *
 * All handlers are gated by the `system.monitor` or `system.flags.manage`
 * permission and use the authenticated user's supabase client (RLS applies).
 * Feature flags are stored under the `feature_flags` key in `system_settings`
 * — writes are already restricted to super_admin by that table's RLS policy.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------ helpers ---------------------------------- */

async function hasPermission(
  supabase: any,
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  const { data: superFlag } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (superFlag === true) return true;

  const { data: hasPerm } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission: permissionKey,
  });
  return hasPerm === true;
}

async function assertPermission(
  supabase: any,
  userId: string,
  permissionKey: string,
): Promise<void> {
  if (!(await hasPermission(supabase, userId, permissionKey))) {
    throw new Error("ليست لديك الصلاحية لعرض/إدارة هذه الإعدادات.");
  }
}

/* ---------------------------- getSystemHealth ---------------------------- */

export type IntegrationHealth = {
  integration_key: string;
  is_mock: boolean;
  total_24h: number;
  success_24h: number;
  failure_24h: number;
  pending_24h: number;
  success_rate: number; // 0..1
  avg_duration_ms: number | null;
  last_status: "success" | "failure" | "pending" | null;
  last_error: string | null;
  last_at: string | null;
};

export type BackgroundJobsHealth = {
  notifications_24h: number;
  notifications_failed_24h: number;
  notifications_failure_rate: number;
  inquiry_attachments_pending: number;
  inquiry_attachments_infected: number;
  inquiry_attachments_error: number;
};

export type SystemHealthReport = {
  generated_at: string;
  integrations: IntegrationHealth[];
  jobs: BackgroundJobsHealth;
  webhooks: IntegrationHealth[];
  activity: {
    audit_events_24h: number;
    security_events_24h: number;
    new_inquiries_24h: number;
    new_appointments_24h: number;
  };
};

const WEBHOOK_KEY_PATTERN = /(webhook|hook|callback|inbound)/i;

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SystemHealthReport> => {
    const { supabase, userId } = context;
    await assertPermission(supabase, userId, "system.monitor");

    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Integration logs (24h)
    const { data: intLogs } = await supabase
      .from("integration_logs")
      .select("integration_key, status, is_mock, duration_ms, error_message, created_at")
      .gte("created_at", since24)
      .order("created_at", { ascending: false })
      .limit(2000);

    const byKey = new Map<string, IntegrationHealth>();
    for (const row of (intLogs ?? []) as Array<{
      integration_key: string;
      status: string;
      is_mock: boolean;
      duration_ms: number | null;
      error_message: string | null;
      created_at: string;
    }>) {
      const k = row.integration_key;
      let bucket = byKey.get(k);
      if (!bucket) {
        bucket = {
          integration_key: k,
          is_mock: row.is_mock,
          total_24h: 0,
          success_24h: 0,
          failure_24h: 0,
          pending_24h: 0,
          success_rate: 0,
          avg_duration_ms: null,
          last_status: null,
          last_error: null,
          last_at: null,
        };
        byKey.set(k, bucket);
      }
      bucket.total_24h += 1;
      if (row.status === "success") bucket.success_24h += 1;
      else if (row.status === "failure") bucket.failure_24h += 1;
      else if (row.status === "pending") bucket.pending_24h += 1;
      if (bucket.last_at == null) {
        bucket.last_status = row.status as IntegrationHealth["last_status"];
        bucket.last_error = row.error_message;
        bucket.last_at = row.created_at;
      }
    }

    // Compute derived metrics + duration averages via separate pass
    const durationSum = new Map<string, { sum: number; count: number }>();
    for (const row of (intLogs ?? []) as Array<{
      integration_key: string;
      duration_ms: number | null;
    }>) {
      if (row.duration_ms == null) continue;
      const cur = durationSum.get(row.integration_key) ?? { sum: 0, count: 0 };
      cur.sum += row.duration_ms;
      cur.count += 1;
      durationSum.set(row.integration_key, cur);
    }
    for (const [k, h] of byKey) {
      const counted = h.success_24h + h.failure_24h;
      h.success_rate = counted === 0 ? 1 : h.success_24h / counted;
      const d = durationSum.get(k);
      h.avg_duration_ms = d ? Math.round(d.sum / d.count) : null;
    }

    const integrations = [...byKey.values()].sort((a, b) => b.total_24h - a.total_24h);
    const webhooks = integrations.filter((i) => WEBHOOK_KEY_PATTERN.test(i.integration_key));

    // Notifications: use send_status enum. Non-'sent' & non-'skipped' = failed-like.
    const [
      { count: notif24 },
      { count: notifSent },
      { count: notifSkipped },
      { count: attPending },
      { count: attInfected },
      { count: attError },
      { count: audit24 },
      { count: sec24 },
      { count: inq24 },
      { count: appt24 },
    ] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24)
        .eq("send_status", "sent"),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24)
        .eq("send_status", "skipped"),
      supabase
        .from("service_inquiry_attachments")
        .select("id", { count: "exact", head: true })
        .eq("scan_status", "pending"),
      supabase
        .from("service_inquiry_attachments")
        .select("id", { count: "exact", head: true })
        .eq("scan_status", "infected"),
      supabase
        .from("service_inquiry_attachments")
        .select("id", { count: "exact", head: true })
        .eq("scan_status", "error"),
      supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24),
      supabase
        .from("security_audit_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24),
      supabase
        .from("service_inquiries")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since24),
    ]);

    const total = notif24 ?? 0;
    const okOrSkipped = (notifSent ?? 0) + (notifSkipped ?? 0);
    const notifFailed = Math.max(0, total - okOrSkipped);

    return {
      generated_at: new Date().toISOString(),
      integrations,
      webhooks,
      jobs: {
        notifications_24h: total,
        notifications_failed_24h: notifFailed,
        notifications_failure_rate: total === 0 ? 0 : notifFailed / total,
        inquiry_attachments_pending: attPending ?? 0,
        inquiry_attachments_infected: attInfected ?? 0,
        inquiry_attachments_error: attError ?? 0,
      },
      activity: {
        audit_events_24h: audit24 ?? 0,
        security_events_24h: sec24 ?? 0,
        new_inquiries_24h: inq24 ?? 0,
        new_appointments_24h: appt24 ?? 0,
      },
    };
  });

/* ------------------------------ Feature flags ---------------------------- */

const FLAGS_KEY = "feature_flags";

export type FeatureFlag = {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

type FlagsPayload = Record<string, { enabled: boolean; description?: string | null }>;

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeatureFlag[]> => {
    const { supabase, userId } = context;
    await assertPermission(supabase, userId, "system.monitor");

    const { data, error } = await supabase
      .from("system_settings")
      .select("value, updated_at, updated_by")
      .eq("key", FLAGS_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const payload = (data?.value ?? {}) as FlagsPayload;
    return Object.entries(payload)
      .map(([key, v]) => ({
        key,
        enabled: !!v.enabled,
        description: v.description ?? null,
        updated_at: data?.updated_at ?? null,
        updated_by: data?.updated_by ?? null,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  });

const SetFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_.]+$/i, "المفتاح يقبل أحرفًا وأرقامًا و _ . فقط"),
  enabled: z.boolean(),
  description: z.string().trim().max(240).optional().nullable(),
});

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SetFlagSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPermission(supabase, userId, "system.flags.manage");

    const { data: existing, error: readErr } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", FLAGS_KEY)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const current = (existing?.value ?? {}) as FlagsPayload;
    const next: FlagsPayload = {
      ...current,
      [data.key]: {
        enabled: data.enabled,
        description: data.description ?? current[data.key]?.description ?? null,
      },
    };

    const { error } = await supabase.from("system_settings").upsert(
      {
        key: FLAGS_KEY,
        value: next as any,
        description: "Runtime feature flags managed by Super Admin",
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const DeleteFlagSchema = z.object({ key: z.string().trim().min(1) });

export const deleteFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeleteFlagSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPermission(supabase, userId, "system.flags.manage");

    const { data: existing, error: readErr } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", FLAGS_KEY)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const current = (existing?.value ?? {}) as FlagsPayload;
    if (!(data.key in current)) return { ok: true as const };
    delete current[data.key];

    const { error } = await supabase.from("system_settings").upsert(
      {
        key: FLAGS_KEY,
        value: current as any,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
