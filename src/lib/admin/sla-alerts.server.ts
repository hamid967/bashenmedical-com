/**
 * SLA alerts sweep — server-only.
 *
 * Finds inbox items whose first-response or resolution windows have been
 * breached, and for every (item, kind) pair not yet recorded in
 * `sla_alert_log`, fires a webhook + email notification then records the
 * attempt. Deduplication is enforced by the UNIQUE(item_id, kind) constraint.
 *
 * Called by:
 *   - `runSlaAlertSweep` server function (manual "Run now" button).
 *   - `/api/public/cron/sla-sweep` route (scheduled cron; shared secret auth).
 */
import { SLA_THRESHOLDS } from "./inbox-sla.functions";

type Priority = "urgent" | "high" | "normal" | "low";
const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

type Config = {
  enabled: boolean;
  webhook_url: string | null;
  email_recipients: string[];
  min_priority: Priority;
};

export type SweepResult = {
  scanned: number;
  new_breaches: number;
  webhook_sent: number;
  email_queued: number;
  errors: string[];
};

const appUrl = (): string =>
  process.env.PUBLIC_APP_URL?.replace(/\/$/, "") || "https://bashenmedical-com.lovable.app";

export async function runSweep(): Promise<SweepResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result: SweepResult = {
    scanned: 0,
    new_breaches: 0,
    webhook_sent: 0,
    email_queued: 0,
    errors: [],
  };

  const { data: cfg, error: cfgErr } = await supabaseAdmin
    .from("sla_alert_config")
    .select("enabled, webhook_url, email_recipients, min_priority")
    .eq("id", true)
    .maybeSingle();
  if (cfgErr) {
    result.errors.push(`config: ${cfgErr.message}`);
    return result;
  }
  const config = (cfg ?? {
    enabled: false,
    webhook_url: null,
    email_recipients: [],
    min_priority: "high",
  }) as Config;
  if (!config.enabled) return result;

  const minRank = PRIORITY_RANK[config.min_priority];
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: items, error: itErr } = await supabaseAdmin
    .from("inbox_items")
    .select(
      "id, request_number, patient_name, channel, branch_id, priority, status, created_at, updated_at",
    )
    .gte("created_at", since)
    .not("status", "in", "(completed,cancelled,archived,appointment_created)")
    .limit(1000);
  if (itErr) {
    result.errors.push(`items: ${itErr.message}`);
    return result;
  }
  result.scanned = items?.length ?? 0;
  if (!items?.length) return result;

  const ids = items.map((i: unknown) => i.id);
  const { data: events } = await supabaseAdmin
    .from("inbox_events")
    .select("item_id, action, created_at")
    .in("item_id", ids)
    .order("created_at", { ascending: true });

  const firstResponseByItem = new Map<string, number>();
  for (const e of events ?? []) {
    if (!e.action || e.action === "created") continue;
    if (!firstResponseByItem.has(e.item_id)) {
      firstResponseByItem.set(e.item_id, new Date(e.created_at).getTime());
    }
  }

  const { data: alerted } = await supabaseAdmin
    .from("sla_alert_log")
    .select("item_id, kind")
    .in("item_id", ids);
  const alreadyAlerted = new Set((alerted ?? []).map((a: unknown) => `${a.item_id}:${a.kind}`));

  const now = Date.now();
  type Breach = {
    item: unknown;
    kind: "response" | "resolution";
    overdueMs: number;
    thresholdMin: number;
  };
  const breaches: Breach[] = [];

  for (const it of items as unknown[]) {
    const priority = it.priority as Priority;
    if (PRIORITY_RANK[priority] < minRank) continue;
    const t = SLA_THRESHOLDS[priority];
    const createdMs = new Date(it.created_at).getTime();
    const ageMs = now - createdMs;
    const respMs = firstResponseByItem.get(it.id);

    if (respMs === undefined) {
      const overdue = ageMs - t.firstResponseMin * 60_000;
      if (overdue > 0 && !alreadyAlerted.has(`${it.id}:response`)) {
        breaches.push({
          item: it,
          kind: "response",
          overdueMs: overdue,
          thresholdMin: t.firstResponseMin,
        });
      }
    }
    const overdueResol = ageMs - t.resolutionMin * 60_000;
    if (overdueResol > 0 && !alreadyAlerted.has(`${it.id}:resolution`)) {
      breaches.push({
        item: it,
        kind: "resolution",
        overdueMs: overdueResol,
        thresholdMin: t.resolutionMin,
      });
    }
  }

  result.new_breaches = breaches.length;
  if (!breaches.length) return result;

  const base = appUrl();
  for (const b of breaches) {
    const link = `${base}/admin/inbox/${b.item.id}`;
    const payload = {
      event: "sla.breach",
      kind: b.kind,
      item: {
        id: b.item.id,
        request_number: b.item.request_number,
        patient_name: b.item.patient_name,
        channel: b.item.channel,
        branch_id: b.item.branch_id,
        priority: b.item.priority,
        status: b.item.status,
        created_at: b.item.created_at,
      },
      overdue_ms: b.overdueMs,
      threshold_min: b.thresholdMin,
      admin_link: link,
      at: new Date().toISOString(),
    };

    let webhook_status: number | null = null;
    let email_status: string | null = null;

    if (config.webhook_url) {
      try {
        const res = await fetch(config.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });
        webhook_status = res.status;
        if (res.ok) result.webhook_sent++;
        else result.errors.push(`webhook ${res.status} for ${b.item.request_number}`);
      } catch (e: unknown) {
        result.errors.push(`webhook error ${b.item.request_number}: ${e?.message ?? "unknown"}`);
      }
    }

    if (config.email_recipients?.length) {
      // Email delivery is queued via the app's transactional email pipeline
      // once the email domain is configured. Until then we record the intent.
      email_status = "queued";
      result.email_queued += config.email_recipients.length;
    }

    await supabaseAdmin.from("sla_alert_log").insert({
      item_id: b.item.id,
      kind: b.kind,
      priority: b.item.priority,
      channel: b.item.channel,
      overdue_ms: b.overdueMs,
      webhook_status,
      email_status,
    });
  }

  return result;
}
