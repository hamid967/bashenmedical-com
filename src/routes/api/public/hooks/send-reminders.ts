/**
 * Public cron endpoint — called every few minutes by pg_cron.
 *
 * 1) Calls `enqueue_appointment_reminders()` to insert reminder rows.
 * 2) Reads pending web_push rows, sends VAPID push to each subscription,
 *    marks the row `sent` or `failed`.
 *
 * Auth: requires a server-only `CRON_SECRET` (compared in constant time)
 * via the `x-cron-secret` header (or `Authorization: Bearer …`). The
 * Supabase publishable/anon key is explicitly NOT accepted here because it
 * is shipped to every browser and would leave the endpoint effectively open.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type PendingRow = {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  kind: string;
  audience: string;
  metadata: Record<string, unknown> | null;
  appointment_id: string | null;
};

type Sub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
  failure_count: number;
};

const DEFAULT_STAFF_ROLES = ["admin", "reception", "super_admin"] as const;

const MAX_PENDING_PER_RUN = 200;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+966${digits.slice(1)}`;
  return `+${digits}`;
}

async function sendTwilioMessage(opts: {
  to: string;
  body: string;
  channel: "sms" | "whatsapp";
}): Promise<{ ok: true } | { ok: false; error: string; skipped?: boolean }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromSms = process.env.TWILIO_SMS_FROM;
  const fromWa = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token) {
    return { ok: false, error: "twilio credentials not configured", skipped: true };
  }
  const from = opts.channel === "whatsapp" ? fromWa : fromSms;
  if (!from) {
    return {
      ok: false,
      error: `sender number missing (${opts.channel})`,
      skipped: true,
    };
  }
  const to = normalizePhone(opts.to);
  if (!to) return { ok: false, error: "empty recipient", skipped: true };

  const params = new URLSearchParams({
    To: opts.channel === "whatsapp" ? `whatsapp:${to}` : to,
    From: opts.channel === "whatsapp" ? (from.startsWith("whatsapp:") ? from : `whatsapp:${from}`) : from,
    Body: opts.body,
  });

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `twilio ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendMessagingRun(admin: any): Promise<{
  sms_sent: number;
  sms_failed: number;
  sms_skipped: number;
  whatsapp_sent: number;
  whatsapp_failed: number;
  whatsapp_skipped: number;
}> {
  const stats = {
    sms_sent: 0,
    sms_failed: 0,
    sms_skipped: 0,
    whatsapp_sent: 0,
    whatsapp_failed: 0,
    whatsapp_skipped: 0,
  };

  const { data: pending, error } = await admin
    .from("notifications")
    .select("id, channel, body, recipient")
    .in("channel", ["sms", "whatsapp"])
    .eq("send_status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_PENDING_PER_RUN);
  if (error) {
    console.error("messaging pending fetch failed:", error);
    return stats;
  }

  for (const row of pending ?? []) {
    const channel = row.channel as "sms" | "whatsapp";
    const to = (row.recipient as string | null) ?? "";
    const body = (row.body as string | null) ?? "";
    if (!to || !body) {
      await admin
        .from("notifications")
        .update({ send_status: "skipped", last_error: "missing recipient or body" })
        .eq("id", row.id as string);
      if (channel === "sms") stats.sms_skipped++;
      else stats.whatsapp_skipped++;
      continue;
    }

    const result = await sendTwilioMessage({ to, body, channel });
    if (result.ok) {
      await admin
        .from("notifications")
        .update({ send_status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id as string);
      if (channel === "sms") stats.sms_sent++;
      else stats.whatsapp_sent++;
    } else if (result.skipped) {
      await admin
        .from("notifications")
        .update({ send_status: "skipped", last_error: result.error })
        .eq("id", row.id as string);
      if (channel === "sms") stats.sms_skipped++;
      else stats.whatsapp_skipped++;
    } else {
      await admin
        .from("notifications")
        .update({ send_status: "failed", last_error: result.error })
        .eq("id", row.id as string);
      if (channel === "sms") stats.sms_failed++;
      else stats.whatsapp_failed++;
    }
  }
  return stats;
}

async function sendPushRun(): Promise<{
  enqueue: unknown;
  sent: number;
  failed: number;
  expired: number;
  no_subscription: number;
  messaging: Awaited<ReturnType<typeof sendMessagingRun>>;
}> {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY!;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY!;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:notifications@example.com";

  if (!url || !serviceKey) throw new Error("Supabase env missing");
  if (!vapidPublic || !vapidPrivate) throw new Error("VAPID env missing");

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Enqueue any due reminders
  const { data: enqueueResult, error: enqueueError } = await admin.rpc(
    "enqueue_appointment_reminders",
  );
  if (enqueueError) {
    console.error("enqueue_appointment_reminders failed:", enqueueError);
  }

  // 2) Fetch pending web_push rows (user + staff)
  const { data: pending, error: pendErr } = await admin
    .from("notifications")
    .select("id, user_id, title, body, kind, audience, metadata, appointment_id")
    .eq("channel", "web_push")
    .eq("send_status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_PENDING_PER_RUN);
  if (pendErr) throw new Error(pendErr.message);

  const rows = (pending ?? []) as PendingRow[];
  let sent = 0;
  let failed = 0;
  let expired = 0;
  let noSub = 0;

  // Cache: staff-roles key -> user ids
  const staffUsersCache = new Map<string, string[]>();
  async function resolveStaffUserIds(roles: string[]): Promise<string[]> {
    const key = [...roles].sort().join(",");
    const cached = staffUsersCache.get(key);
    if (cached) return cached;
    const { data, error } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", roles);
    if (error) {
      console.error("staff role lookup failed:", error);
      staffUsersCache.set(key, []);
      return [];
    }
    const ids = Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
    staffUsersCache.set(key, ids);
    return ids;
  }

  for (const row of rows) {
    // Resolve target user id list
    let targetUserIds: string[] = [];
    if (row.audience === "staff") {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const rolesRaw = Array.isArray(meta.staff_roles) ? (meta.staff_roles as unknown[]) : [];
      const roles = rolesRaw.filter((r): r is string => typeof r === "string");
      targetUserIds = await resolveStaffUserIds(
        roles.length > 0 ? roles : [...DEFAULT_STAFF_ROLES],
      );
    } else if (row.user_id) {
      targetUserIds = [row.user_id];
    }

    if (targetUserIds.length === 0) {
      await admin
        .from("notifications")
        .update({ send_status: "skipped", last_error: "no target user" })
        .eq("id", row.id);
      noSub++;
      continue;
    }

    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id, failure_count")
      .in("user_id", targetUserIds);
    if (subsErr) {
      await admin
        .from("notifications")
        .update({ send_status: "failed", last_error: subsErr.message })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const subList = (subs ?? []) as Sub[];
    if (subList.length === 0) {
      await admin
        .from("notifications")
        .update({ send_status: "skipped", last_error: "no push subscription" })
        .eq("id", row.id);
      noSub++;
      continue;
    }

    const payload = JSON.stringify({
      title: row.title,
      body: row.body ?? "",
      kind: row.kind,
      metadata: row.metadata ?? {},
    });

    let anySent = false;
    let lastError: string | null = null;

    for (const s of subList) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        anySent = true;
        await admin
          .from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString(), failure_count: 0 })
          .eq("id", s.id);
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        const status = e.statusCode ?? 0;
        lastError = e.message || String(err);
        if (status === 404 || status === 410) {
          // Gone / not registered — delete subscription
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          expired++;
        } else {
          await admin
            .from("push_subscriptions")
            .update({ failure_count: (s.failure_count ?? 0) + 1 })
            .eq("id", s.id);
        }
      }
    }

    await admin
      .from("notifications")
      .update(
        anySent
          ? { send_status: "sent", sent_at: new Date().toISOString(), last_error: null }
          : { send_status: "failed", last_error: lastError ?? "no delivery" },
      )
      .eq("id", row.id);
    if (anySent) sent++;
    else failed++;
  }

  return { enqueue: enqueueResult ?? null, sent, failed, expired, no_subscription: noSub };
}

async function handle(request: Request): Promise<Response> {
  // Auth: require a dedicated server-only CRON_SECRET (accepted via
  // `x-cron-secret` header or `Authorization: Bearer …`). We deliberately
  // do NOT accept the Supabase publishable/anon key here — that value ships
  // in every browser bundle, so anyone could otherwise trigger this endpoint
  // and spam push notifications / exhaust VAPID quota.
  const expected = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await sendPushRun();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("send-reminders failed:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
