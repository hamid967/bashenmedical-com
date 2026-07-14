/**
 * Server-side Web Push test sender.
 * Signs a real Web Push message with VAPID and delivers it via the browser
 * vendor's push service (FCM / APNs / Mozilla), exercising the /sw-push.js
 * `push` event listener — unlike `registration.showNotification()`, which
 * skips the transport entirely.
 *
 * Sends to ALL of the current user's registered push subscriptions and
 * garbage-collects any that come back 404/410 (unsubscribed / expired).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TestPushInput = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).max(400).optional(),
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^\/[^\s]*$/, "Path must start with /")
    .optional(),
  requireInteraction: z.boolean().optional(),
});

type DeliveryResult = {
  endpoint: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
  removed?: boolean;
};

export const sendTestPushToMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TestPushInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!privateKey || !publicKey || !subject) {
      throw new Error("VAPID keys are not configured on the server");
    }

    const { data: subs, error } = await context.supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    if (!subs || subs.length === 0) {
      return {
        ok: false,
        sent: 0,
        removed: 0,
        results: [] as DeliveryResult[],
        message: "لا يوجد اشتراك نشط — قم بتفعيل الإشعارات أولًا",
      };
    }

    // Dynamic import: web-push relies on Node crypto/https that only exist on
    // the server side. Keeping it out of module scope also keeps it out of
    // any client-reachable chunk.
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const payload = JSON.stringify({
      title: data.title ?? "إشعار تجريبي — Test push",
      body: data.body ?? "هذا اختبار حقيقي عبر web-push من الخادم.",
      icon: "/android-chrome-192.png",
      badge: "/favicon-32.png",
      tag: "push-test-server",
      requireInteraction: data.requireInteraction ?? false,
      metadata: { url: data.url ?? "/portal/notifications" },
    });

    const results: DeliveryResult[] = [];
    const staleEndpoints: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          const resp = await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 },
          );
          results.push({ endpoint: s.endpoint, ok: true, statusCode: resp.statusCode });
        } catch (e) {
          const err = e as { statusCode?: number; body?: string; message?: string };
          const gone = err.statusCode === 404 || err.statusCode === 410;
          if (gone) staleEndpoints.push(s.endpoint);
          results.push({
            endpoint: s.endpoint,
            ok: false,
            statusCode: err.statusCode,
            error: err.body || err.message || "Delivery failed",
            removed: gone,
          });
        }
      }),
    );

    // GC unsubscribed / expired endpoints so future tests aren't noisy.
    if (staleEndpoints.length > 0) {
      await context.supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", context.userId)
        .in("endpoint", staleEndpoints);
    }

    const sent = results.filter((r) => r.ok).length;
    return {
      ok: sent > 0,
      sent,
      removed: staleEndpoints.length,
      results,
      message: sent > 0 ? `تم إرسال ${sent} إشعار` : "فشل الإرسال",
    };
  });
