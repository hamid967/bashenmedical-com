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
