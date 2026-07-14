/**
 * Patient notifications — list + mark-read for the signed-in user.
 * Uses SECURITY DEFINER RPCs (`my_notifications`, `mark_notifications_read`)
 * so RLS on the notifications table stays strict.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export type PatientNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  appointment_id: string | null;
  metadata: Json | null;
};

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).optional() }).default({}).parse(d),
  )
  .handler(async ({ data, context }): Promise<PatientNotification[]> => {
    const { data: rows, error } = await context.supabase.rpc("my_notifications", {
      _limit: data.limit ?? 100,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body ?? null,
      created_at: r.created_at,
      read_at: r.read_at ?? null,
      appointment_id: r.appointment_id ?? null,
      metadata: (r.metadata ?? null) as Json | null,
    }));
  });

export const markMyNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
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
