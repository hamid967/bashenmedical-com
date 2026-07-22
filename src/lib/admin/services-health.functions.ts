/**
 * Admin — Services Health.
 * Aggregates the latest status per internal "service" surface plus the most
 * recent error (if any). Read-only; admin/super_admin only.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertHasRole } from "./service-inquiries.functions";

export type ServiceHealthStatus = "ok" | "degraded" | "down" | "idle" | "unknown";

export interface ServiceHealth {
  key: string;
  label: string;
  status: ServiceHealthStatus;
  last_event_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  success_1h: number;
  error_1h: number;
  detail?: string | null;
}

const ONE_HOUR = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function aiStreamingHealth(sb: any): Promise<ServiceHealth> {
  const since = ONE_HOUR();
  const { data: recent } = await sb
    .from("ai_stream_events")
    .select("completed, aborted, error_status, error_type, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = recent ?? [];
  const ok = rows.filter((r: any) => r.completed && !r.error_status).length;
  const err = rows.filter((r: any) => r.error_status || r.error_type).length;
  const { data: lastErr } = await sb
    .from("ai_stream_events")
    .select("created_at, error_status, error_type")
    .or("error_status.not.is.null,error_type.not.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = rows[0];
  const total = ok + err;
  const status: ServiceHealthStatus =
    total === 0 ? "idle" : err === 0 ? "ok" : err / total > 0.2 ? "down" : "degraded";
  return {
    key: "ai_streaming",
    label: "AI Streaming",
    status,
    last_event_at: last?.created_at ?? null,
    last_error_at: lastErr?.created_at ?? null,
    last_error_message: lastErr ? `${lastErr.error_type ?? ""} ${lastErr.error_status ?? ""}`.trim() : null,
    success_1h: ok,
    error_1h: err,
  };
}

async function nphiesHealth(sb: any): Promise<ServiceHealth> {
  const since = ONE_HOUR();
  const { data: rows } = await sb
    .from("nphies_requests")
    .select("http_status, error_message, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  const list = rows ?? [];
  const ok = list.filter((r: any) => !r.error_message && (r.http_status ?? 0) < 400).length;
  const err = list.length - ok;
  const { data: lastErr } = await sb
    .from("nphies_requests")
    .select("created_at, error_message, http_status")
    .not("error_message", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const total = ok + err;
  const status: ServiceHealthStatus =
    total === 0 ? "idle" : err === 0 ? "ok" : err / total > 0.2 ? "down" : "degraded";
  return {
    key: "nphies",
    label: "NPHIES Insurance",
    status,
    last_event_at: list[0]?.created_at ?? null,
    last_error_at: lastErr?.created_at ?? null,
    last_error_message: lastErr?.error_message ?? null,
    success_1h: ok,
    error_1h: err,
  };
}

async function notificationsHealth(sb: any): Promise<ServiceHealth[]> {
  const since = ONE_HOUR();
  const { data: rows } = await sb
    .from("notification_delivery_logs")
    .select("channel, status, error_message, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  const list = rows ?? [];
  const channels = Array.from(new Set(list.map((r: any) => r.channel).filter(Boolean)));
  if (channels.length === 0) {
    return [{
      key: "notifications",
      label: "Notifications",
      status: "idle",
      last_event_at: null,
      last_error_at: null,
      last_error_message: null,
      success_1h: 0,
      error_1h: 0,
    }];
  }
  return channels.map((ch: any) => {
    const sub = list.filter((r: any) => r.channel === ch);
    const ok = sub.filter((r: any) => r.status === "sent" || r.status === "delivered").length;
    const err = sub.filter((r: any) => r.status === "failed" || r.error_message).length;
    const lastErr = sub.find((r: any) => r.error_message || r.status === "failed");
    const total = ok + err;
    const status: ServiceHealthStatus =
      total === 0 ? "idle" : err === 0 ? "ok" : err / total > 0.2 ? "down" : "degraded";
    return {
      key: `notifications:${ch}`,
      label: `Notifications — ${ch}`,
      status,
      last_event_at: sub[0]?.created_at ?? null,
      last_error_at: lastErr?.created_at ?? null,
      last_error_message: lastErr?.error_message ?? null,
      success_1h: ok,
      error_1h: err,
    };
  });
}

async function integrationsHealth(sb: any): Promise<ServiceHealth[]> {
  const since = ONE_HOUR();
  const { data: rows } = await sb
    .from("integration_logs")
    .select("integration_key, status, error_message, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  const list = rows ?? [];
  const keys = Array.from(new Set(list.map((r: any) => r.integration_key).filter(Boolean)));
  if (keys.length === 0) {
    return [{
      key: "integrations",
      label: "Integrations",
      status: "idle",
      last_event_at: null,
      last_error_at: null,
      last_error_message: null,
      success_1h: 0,
      error_1h: 0,
    }];
  }
  return keys.map((k: any) => {
    const sub = list.filter((r: any) => r.integration_key === k);
    const ok = sub.filter((r: any) => r.status === "success" || r.status === "ok").length;
    const err = sub.filter((r: any) => r.status === "error" || r.status === "failed" || r.error_message).length;
    const lastErr = sub.find((r: any) => r.error_message || r.status === "error" || r.status === "failed");
    const total = ok + err;
    const status: ServiceHealthStatus =
      total === 0 ? "idle" : err === 0 ? "ok" : err / total > 0.2 ? "down" : "degraded";
    return {
      key: `integration:${k}`,
      label: `Integration — ${k}`,
      status,
      last_event_at: sub[0]?.created_at ?? null,
      last_error_at: lastErr?.created_at ?? null,
      last_error_message: lastErr?.error_message ?? null,
      success_1h: ok,
      error_1h: err,
    };
  });
}

async function apiPermissionsHealth(sb: any): Promise<ServiceHealth> {
  const since = ONE_HOUR();
  const { data: rows } = await sb
    .from("api_permission_errors")
    .select("route, status_code, message, occurred_at")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(200);
  const list = rows ?? [];
  const err = list.length;
  const lastErr = list[0];
  const status: ServiceHealthStatus = err === 0 ? "ok" : err > 20 ? "down" : "degraded";
  return {
    key: "api_permissions",
    label: "API Permissions",
    status,
    last_event_at: lastErr?.occurred_at ?? null,
    last_error_at: lastErr?.occurred_at ?? null,
    last_error_message: lastErr ? `${lastErr.route ?? ""} — ${lastErr.message ?? lastErr.status_code}` : null,
    success_1h: 0,
    error_1h: err,
  };
}

async function aiSafetyHealth(sb: any): Promise<ServiceHealth> {
  const since = ONE_HOUR();
  const { data: rows } = await sb
    .from("ai_safety_incidents")
    .select("kind, severity, action_taken, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  const list = rows ?? [];
  const err = list.length;
  const last = list[0];
  const critical = list.filter((r: any) => r.severity === "high" || r.severity === "critical").length;
  const status: ServiceHealthStatus =
    err === 0 ? "ok" : critical > 0 ? "down" : "degraded";
  return {
    key: "ai_safety",
    label: "AI Safety",
    status,
    last_event_at: last?.created_at ?? null,
    last_error_at: last?.created_at ?? null,
    last_error_message: last ? `${last.kind ?? ""} (${last.severity ?? ""}) → ${last.action_taken ?? ""}` : null,
    success_1h: 0,
    error_1h: err,
  };
}

export const getServicesHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertHasRole(supabase, userId, "admin");

    const [ai, nphies, notifs, integ, apiPerm, safety] = await Promise.all([
      aiStreamingHealth(supabase).catch((e) => errCard("ai_streaming", "AI Streaming", e)),
      nphiesHealth(supabase).catch((e) => errCard("nphies", "NPHIES Insurance", e)),
      notificationsHealth(supabase).catch((e) => [errCard("notifications", "Notifications", e)]),
      integrationsHealth(supabase).catch((e) => [errCard("integrations", "Integrations", e)]),
      apiPermissionsHealth(supabase).catch((e) => errCard("api_permissions", "API Permissions", e)),
      aiSafetyHealth(supabase).catch((e) => errCard("ai_safety", "AI Safety", e)),
    ]);

    const list: ServiceHealth[] = [
      ai as ServiceHealth,
      nphies as ServiceHealth,
      ...(notifs as ServiceHealth[]),
      ...(integ as ServiceHealth[]),
      apiPerm as ServiceHealth,
      safety as ServiceHealth,
    ];
    return { services: list, generated_at: new Date().toISOString() };
  });

function errCard(key: string, label: string, e: unknown): ServiceHealth {
  return {
    key,
    label,
    status: "unknown",
    last_event_at: null,
    last_error_at: new Date().toISOString(),
    last_error_message: e instanceof Error ? e.message : String(e),
    success_1h: 0,
    error_1h: 0,
  };
}
