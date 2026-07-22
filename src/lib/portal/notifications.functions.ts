/**
 * Patient notifications — list + mark-read for the signed-in user.
 * Uses SECURITY DEFINER RPCs (`my_notifications`, `mark_notifications_read`)
 * so RLS on the notifications table stays strict.
 *
 * Each notification is enriched with per-channel delivery statuses pulled
 * from `notification_delivery_logs`. We only surface statuses that were
 * confirmed by the delivery provider ("delivered", "bounced", "failed").
 * Client-side / queued states ("pending", "sent", "skipped") are hidden
 * because they don't guarantee the message actually reached the recipient.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export type DeliveryChannel = "email" | "sms" | "whatsapp" | "push" | "in_app";
export type ConfirmedDeliveryStatus = "delivered" | "bounced" | "failed";

export type DeliveryStatus = {
  channel: DeliveryChannel;
  status: ConfirmedDeliveryStatus;
  provider: string | null;
  at: string; // provider-confirmation timestamp (updated_at)
};

export type PatientNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  appointment_id: string | null;
  metadata: Json | null;
  /** Provider-confirmed delivery statuses only (empty when nothing confirmed). */
  deliveries: DeliveryStatus[];
};

const CONFIRMED: readonly ConfirmedDeliveryStatus[] = ["delivered", "bounced", "failed"];

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ limit: z.number().int().min(1).max(200).optional() })
      .default({})
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PatientNotification[]> => {
    const { data: rows, error } = await context.supabase.rpc("my_notifications", {
      _limit: data.limit ?? 100,
    });
    if (error) throw new Error(error.message);
    const items = rows ?? [];
    const ids = items.map((r) => r.id);

    // Fetch only provider-confirmed delivery statuses. RLS on
    // notification_delivery_logs already limits rows to the current user.
    const byNotif = new Map<string, DeliveryStatus[]>();
    if (ids.length > 0) {
      const { data: logs, error: dErr } = await context.supabase
        .from("notification_delivery_logs")
        .select("notification_id, channel, status, provider, updated_at")
        .in("notification_id", ids)
        .in("status", CONFIRMED as unknown as string[])
        .order("updated_at", { ascending: false });
      if (dErr) throw new Error(dErr.message);
      // Keep the latest confirmed status per (notification, channel).
      const seen = new Set<string>();
      for (const l of logs ?? []) {
        const nid = l.notification_id;
        if (!nid) continue;
        const key = `${nid}::${l.channel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const list = byNotif.get(nid) ?? [];
        list.push({
          channel: l.channel as DeliveryChannel,
          status: l.status as ConfirmedDeliveryStatus,
          provider: (l.provider as string | null) ?? null,
          at: l.updated_at as string,
        });
        byNotif.set(nid, list);
      }
    }

    return items.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body ?? null,
      created_at: r.created_at,
      read_at: r.read_at ?? null,
      appointment_id: r.appointment_id ?? null,
      metadata: (r.metadata ?? null) as Json | null,
      deliveries: byNotif.get(r.id) ?? [],
    }));
  });

export const markMyNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).max(200).optional() })
      .default({})
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ updated: number }> => {
    const { data: n, error } = await context.supabase.rpc("mark_notifications_read", {
      _ids: data.ids && data.ids.length > 0 ? data.ids : undefined,
    });
    if (error) throw new Error(error.message);
    return { updated: (n as number | null) ?? 0 };
  });
