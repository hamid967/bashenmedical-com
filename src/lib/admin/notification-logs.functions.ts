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
};

import { assertConsoleAccess as assertAdmin } from "./_guard";

const ListInput = z.object({
  channel: z.enum(CHANNELS).nullish(),
  status: z.enum(STATUSES).nullish(),
  q: z.string().trim().max(120).nullish(),
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
        "id, user_id, notification_id, channel, provider, template, recipient, subject, status, error_message, attempt, created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.channel) q = q.eq("channel", data.channel);
    if (data.status) q = q.eq("status", data.status);
    if (data.q)
      q = q.or(
        `recipient.ilike.%${data.q}%,subject.ilike.%${data.q}%,template.ilike.%${data.q}%,error_message.ilike.%${data.q}%`,
      );

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as NotificationDeliveryLog[];
  });

const StatsInput = z.object({
  windowHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24 * 7),
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
