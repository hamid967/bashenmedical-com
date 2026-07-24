/**
 * Admin: read notification delivery logs (per-channel).
 * Deduplication rule: latest row per (notification_id, channel) is what admins
 * care about when a notification retries — we ORDER BY created_at DESC and
 * cap results server-side.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CHANNELS = ["in_app", "email", "sms", "whatsapp", "push"] as const;
const STATUSES = ["pending", "sent", "delivered", "failed", "skipped", "bounced"] as const;

export type NotificationDeliveryLog = {
  id: string;
  user_id: string | null;
  notification_id: string | null;
  channel: (typeof CHANNELS)[number];
  provider: string | null;
  template: string | null;
  recipient: string | null;
  subject: string | null;
  status: (typeof STATUSES)[number];
  error_message: string | null;
  attempt: number;
  created_at: string;
  is_test?: boolean;
};

export type NotificationDeliveryLogDetail = NotificationDeliveryLog & {
  updated_at: string;
  metadata: Record<string, any> | null;
  notification: {
    id: string;
    kind: string | null;
    title: string | null;
    body: string | null;
    send_status: string | null;
    sent_at: string | null;
    audience: string | null;
    created_at: string;
    metadata: Record<string, any> | null;
  } | null;
};

import { assertConsoleAccess as assertAdmin } from "./_guard";

const ListInput = z.object({
  channel: z.enum(CHANNELS).nullish(),
  status: z.enum(STATUSES).nullish(),
  q: z.string().trim().max(120).nullish(),
  testOnly: z.boolean().nullish(),
  windowHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24 * 7),
  limit: z.number().int().min(1).max(200).default(100),
});

export const listNotificationDeliveryLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();

    let q = context.supabase
      .from("notification_delivery_logs")
      .select(
        "id, user_id, notification_id, channel, provider, template, recipient, subject, status, error_message, attempt, created_at, metadata",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.channel) q = q.eq("channel", data.channel);
    if (data.status) q = q.eq("status", data.status);
    if (data.testOnly) q = q.contains("metadata", { test: true });
    if (data.q)
      q = q.or(
        `recipient.ilike.%${data.q}%,subject.ilike.%${data.q}%,template.ilike.%${data.q}%,error_message.ilike.%${data.q}%`,
      );

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const meta = (r as { metadata?: Record<string, any> | null }).metadata;
      const is_test = !!(meta && (meta as Record<string, any>).test === true);
      return { ...(r as object), is_test } as NotificationDeliveryLog;
    });
  });

/* ------------------------------- export --------------------------------- */

const ExportInput = ListInput.extend({
  limit: z.number().int().min(1).max(5000).default(5000),
});

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  // RFC 4180: wrap when contains comma / quote / newline; escape " → ""
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const exportNotificationDeliveryLogsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ExportInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ filename: string; csv: string; count: number }> => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();

    let q = context.supabase
      .from("notification_delivery_logs")
      .select(
        "id, user_id, notification_id, channel, provider, template, recipient, subject, status, error_message, attempt, created_at, updated_at, metadata",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.channel) q = q.eq("channel", data.channel);
    if (data.status) q = q.eq("status", data.status);
    if (data.testOnly) q = q.contains("metadata", { test: true });
    if (data.q)
      q = q.or(
        `recipient.ilike.%${data.q}%,subject.ilike.%${data.q}%,template.ilike.%${data.q}%,error_message.ilike.%${data.q}%`,
      );

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const headers = [
      "id",
      "created_at",
      "updated_at",
      "channel",
      "status",
      "attempt",
      "provider",
      "template",
      "recipient",
      "subject",
      "notification_id",
      "user_id",
      "is_test",
      "error_message",
      "metadata",
    ];
    const lines: string[] = [headers.join(",")];
    for (const r of rows ?? []) {
      const meta = (r.metadata as Record<string, any> | null) ?? null;
      const isTest = !!(meta && meta.test === true);
      lines.push(
        [
          r.id,
          r.created_at,
          r.updated_at,
          r.channel,
          r.status,
          r.attempt,
          r.provider,
          r.template,
          r.recipient,
          r.subject,
          r.notification_id,
          r.user_id,
          isTest ? "true" : "false",
          r.error_message,
          meta,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    // Prepend UTF-8 BOM so Excel opens Arabic text without mojibake.
    const csv = "\uFEFF" + lines.join("\r\n");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return {
      filename: `notification-delivery-logs_${stamp}.csv`,
      csv,
      count: rows?.length ?? 0,
    };
  });

const DetailInput = z.object({ id: z.string().uuid() });

export const getNotificationDeliveryLogDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => DetailInput.parse(d))
  .handler(async ({ data, context }): Promise<NotificationDeliveryLogDetail> => {
    await assertAdmin(context);
    const { data: log, error } = await context.supabase
      .from("notification_delivery_logs")
      .select(
        "id, user_id, notification_id, channel, provider, template, recipient, subject, status, error_message, attempt, created_at, updated_at, metadata",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!log) throw new Error("السجل غير موجود.");

    let notification: NotificationDeliveryLogDetail["notification"] = null;
    if (log.notification_id) {
      const { data: n } = await context.supabase
        .from("notifications")
        .select(
          "id, kind, title, body, send_status, sent_at, audience, created_at, metadata",
        )
        .eq("id", log.notification_id)
        .maybeSingle();
      if (n) {
        notification = {
          ...n,
          metadata: (n.metadata as Record<string, any> | null) ?? null,
        };
      }
    }

    const meta = (log.metadata as Record<string, any> | null) ?? null;
    return {
      ...(log as object),
      metadata: meta,
      is_test: !!(meta && meta.test === true),
      notification,
    } as NotificationDeliveryLogDetail;
  });

const StatsInput = z.object({
  windowHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24 * 7),
  });

/* ------------------------------- retry ---------------------------------- */

const RetryInput = z.object({ id: z.string().uuid() });

export type RetryResult = {
  ok: true;
  new_log_id: string;
  reused: boolean;
  idempotency_key: string;
};

/**
 * Re-queue a failed/bounced/skipped delivery attempt by inserting a new
 * `pending` row on the same notification+channel. Safe against double-clicks
 * and duplicate admin actions via a stable idempotency_key stored in
 * metadata (`retry:<source_log_id>`): if a retry row already exists for the
 * same source, we return it instead of inserting a duplicate.
 *
 * Actual dispatch is handled by the delivery worker that watches for
 * `status='pending'` rows — this function does not send the message itself.
 */
export const retryNotificationDeliveryLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RetryInput.parse(d))
  .handler(async ({ data, context }): Promise<RetryResult> => {
    await assertAdmin(context);

    // 1) Load source row and validate it's retryable.
    const { data: src, error: srcErr } = await context.supabase
      .from("notification_delivery_logs")
      .select(
        "id, user_id, notification_id, channel, provider, template, recipient, subject, status, attempt, metadata",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!src) throw new Error("السجل غير موجود.");
    if (!["failed", "bounced", "skipped"].includes(src.status)) {
      throw new Error("يمكن إعادة المحاولة فقط للسجلات الفاشلة أو المرفوضة أو المتخطاة.");
    }

    const idempotencyKey = `retry:${src.id}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2) Idempotency: return existing retry if we've already enqueued one.
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("notification_delivery_logs")
      .select("id")
      .contains("metadata", { idempotency_key: idempotencyKey })
      .maybeSingle();
    if (exErr && exErr.code !== "PGRST116") throw new Error(exErr.message);
    if (existing?.id) {
      return { ok: true, new_log_id: existing.id, reused: true, idempotency_key: idempotencyKey };
    }

    // 3) Insert new pending attempt on the same channel/notification.
    const srcMeta = (src.metadata as Record<string, any> | null) ?? {};
    const newMeta: Record<string, any> = {
      retry_of: src.id,
      idempotency_key: idempotencyKey,
      requested_by: context.userId,
      requested_at: new Date().toISOString(),
    };
    if (srcMeta.test === true) newMeta.test = true;
    if (typeof srcMeta.notification_kind === "string") {
      newMeta.notification_kind = srcMeta.notification_kind;
    }

    const { data: ins, error: insErr } = await supabaseAdmin
      .from("notification_delivery_logs")
      .insert({
        user_id: src.user_id,
        notification_id: src.notification_id,
        channel: src.channel,
        provider: src.provider,
        template: src.template,
        recipient: src.recipient,
        subject: src.subject,
        status: "pending",
        attempt: (src.attempt ?? 0) + 1,
        metadata: newMeta,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    return { ok: true, new_log_id: ins.id, reused: false, idempotency_key: idempotencyKey };
  });

export type NotificationDeliveryStats = {
  windowHours: number;
  totals: { channel: string; status: string; count: number }[];
  totalCount: number;
  failedCount: number;
  failureRate: number;
};

export const getNotificationDeliveryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => StatsInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<NotificationDeliveryStats> => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();

    const { data: rows, error } = await context.supabase
      .from("notification_delivery_logs")
      .select("channel, status")
      .gte("created_at", since)
      .limit(5000);
    if (error) throw new Error(error.message);

    const map = new Map<string, number>();
    let total = 0;
    let failed = 0;
    for (const r of rows ?? []) {
      const key = `${r.channel}|${r.status}`;
      map.set(key, (map.get(key) ?? 0) + 1);
      total += 1;
      if (r.status === "failed" || r.status === "bounced") failed += 1;
    }
    const totals = Array.from(map.entries()).map(([k, count]) => {
      const [channel, status] = k.split("|");
      return { channel, status, count };
    });
    return {
      windowHours: data.windowHours,
      totals,
      totalCount: total,
      failedCount: failed,
      failureRate: total > 0 ? failed / total : 0,
    };
  });

/* --------------------------- 24h KPI header ------------------------------ */

export type NotificationDeliveryKpis = {
  windowHours: number;
  total: number;
  successRate: number; // 0..1 (sent + delivered) / total
  successCount: number;
  failedCount: number;
  pendingCount: number;
  avgDeliveryMsByChannel: {
    channel: string;
    avgMs: number | null;
    sampleSize: number;
  }[];
  topFailureReasons: { reason: string; count: number }[];
};

const KpisInput = z.object({
  windowHours: z.number().int().min(1).max(24 * 30).default(24),
});

export const getNotificationDeliveryKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => KpisInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<NotificationDeliveryKpis> => {
    await assertAdmin(context);
    const since = new Date(Date.now() - data.windowHours * 3600_000).toISOString();

    const { data: rows, error } = await context.supabase
      .from("notification_delivery_logs")
      .select("channel, status, error_message, created_at, updated_at")
      .gte("created_at", since)
      .limit(10_000);
    if (error) throw new Error(error.message);

    let total = 0;
    let successCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    const durByChannel = new Map<string, { sum: number; n: number }>();
    const failReasons = new Map<string, number>();

    for (const r of rows ?? []) {
      total += 1;
      const status = r.status as string;
      const channel = r.channel as string;
      if (status === "sent" || status === "delivered") {
        successCount += 1;
        if (r.created_at && r.updated_at) {
          const ms =
            new Date(r.updated_at).getTime() - new Date(r.created_at).getTime();
          if (Number.isFinite(ms) && ms >= 0 && ms < 24 * 3600_000) {
            const cur = durByChannel.get(channel) ?? { sum: 0, n: 0 };
            cur.sum += ms;
            cur.n += 1;
            durByChannel.set(channel, cur);
          }
        }
      } else if (status === "failed" || status === "bounced") {
        failedCount += 1;
        const reason = (r.error_message || "غير محدد").toString().slice(0, 180);
        failReasons.set(reason, (failReasons.get(reason) ?? 0) + 1);
      } else if (status === "pending") {
        pendingCount += 1;
      }
    }

    const avgDeliveryMsByChannel = Array.from(durByChannel.entries())
      .map(([channel, v]) => ({
        channel,
        avgMs: v.n > 0 ? Math.round(v.sum / v.n) : null,
        sampleSize: v.n,
      }))
      .sort((a, b) => a.channel.localeCompare(b.channel));

    const topFailureReasons = Array.from(failReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      windowHours: data.windowHours,
      total,
      successRate: total > 0 ? successCount / total : 0,
      successCount,
      failedCount,
      pendingCount,
      avgDeliveryMsByChannel,
      topFailureReasons,
    };
  });
