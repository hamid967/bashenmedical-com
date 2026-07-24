/**
 * Server-only helper that filters a pending notification against the
 * target user's reminder_preferences. Used by every code path that inserts
 * into public.notifications for a specific patient/user so that the
 * Preferences Center is the single source of truth.
 *
 * Never import this file from a component or a client-imported .functions.ts
 * module scope — always dynamically import it inside a server-fn handler.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type NotificationChannel = "in_app" | "email" | "sms" | "whatsapp" | "push";

export type PendingNotification = {
  user_id: string;
  kind: string;
  channel?: NotificationChannel; // default in_app
  audience?: string;
};

export type DeliveryDecision = {
  allow: boolean;
  reason?: "channel_muted" | "kind_muted" | "quiet_hours" | "no_prefs_but_default_off";
  channel: NotificationChannel;
};

/**
 * Kinds that are always allowed — critical/transactional flows that patients
 * cannot mute (verification codes, security, appointment confirmations, and
 * the test channel button).
 */
const ALWAYS_ALLOWED_KINDS = new Set<string>([
  "test.channel",
  "auth.otp",
  "auth.security",
  "appointment.confirmed",
  "appointment.cancelled",
  "appointment.rescheduled",
  "payment.receipt",
]);

/** Kinds/categories the user MAY mute. Prefix match, longest first. */
const MUTABLE_CATEGORY_PREFIXES: readonly string[] = [
  "marketing.",
  "campaign.",
  "reminder_",
  "medication_reminder",
  "lab_shared",
  "results.",
  "service_inquiry.",
];

/** Return the mutable category key for a kind, or null when the kind is
 * always allowed / not user-mutable. */
export function categoryForKind(kind: string): string | null {
  if (ALWAYS_ALLOWED_KINDS.has(kind)) return null;
  const match = MUTABLE_CATEGORY_PREFIXES.find((p) =>
    p.endsWith(".") ? kind.startsWith(p) : kind === p,
  );
  return match ?? null;
}

type Prefs = {
  channel_in_app: boolean;
  channel_email: boolean;
  channel_sms: boolean;
  channel_whatsapp: boolean;
  channel_push: boolean;
  quiet_hours_enabled: boolean;
  wake_hour: number;
  sleep_hour: number;
  muted_kinds: string[] | null;
};

function isQuietNow(prefs: Prefs, at: Date = new Date()): boolean {
  if (!prefs.quiet_hours_enabled) return false;
  // Preferences are stored in the clinic timezone (Asia/Riyadh, UTC+3).
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Riyadh",
    }).format(at),
  );
  const { wake_hour: wake, sleep_hour: sleep } = prefs;
  if (wake === sleep) return false;
  // active window [wake, sleep) with wraparound
  return wake < sleep ? hour < wake || hour >= sleep : hour < wake && hour >= sleep;
}

function channelAllowed(prefs: Prefs, ch: NotificationChannel): boolean {
  switch (ch) {
    case "in_app":
      return prefs.channel_in_app;
    case "email":
      return prefs.channel_email;
    case "sms":
      return prefs.channel_sms;
    case "whatsapp":
      return prefs.channel_whatsapp;
    case "push":
      return prefs.channel_push;
  }
}

/**
 * Fetch preferences for a user via the passed (admin or authenticated) client.
 * When no row exists we fall back to the same defaults as the Preferences
 * Center — in_app + push on, external channels off, quiet hours 07:00–23:00.
 */
export async function loadPrefs(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Prefs> {
  const { data } = await client
    .from("reminder_preferences")
    .select(
      "channel_in_app, channel_email, channel_sms, channel_whatsapp, channel_push, quiet_hours_enabled, wake_hour, sleep_hour, muted_kinds",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return {
    channel_in_app: data?.channel_in_app ?? true,
    channel_email: data?.channel_email ?? false,
    channel_sms: data?.channel_sms ?? false,
    channel_whatsapp: (data as { channel_whatsapp?: boolean } | null)?.channel_whatsapp ?? false,
    channel_push: (data as { channel_push?: boolean } | null)?.channel_push ?? true,
    quiet_hours_enabled: data?.quiet_hours_enabled ?? true,
    wake_hour: data?.wake_hour ?? 7,
    sleep_hour: data?.sleep_hour ?? 23,
    muted_kinds: (data as { muted_kinds?: string[] } | null)?.muted_kinds ?? [],
  };
}

/**
 * Decide whether a single notification should be delivered on a given
 * channel. Non-patient audiences are always allowed (staff/branch alerts
 * bypass the patient's preferences).
 */
export function decide(
  prefs: Prefs,
  pending: PendingNotification,
  at: Date = new Date(),
): DeliveryDecision {
  const channel: NotificationChannel = pending.channel ?? "in_app";
  if (pending.audience && pending.audience !== "patient" && pending.audience !== "user") {
    return { allow: true, channel };
  }
  const category = categoryForKind(pending.kind);
  if (category === null) return { allow: true, channel };

  if ((prefs.muted_kinds ?? []).some((m) => m === category || m === pending.kind)) {
    return { allow: false, reason: "kind_muted", channel };
  }
  if (!channelAllowed(prefs, channel)) {
    return { allow: false, reason: "channel_muted", channel };
  }
  // Quiet hours apply to intrusive channels only; in_app is silent.
  if (channel !== "in_app" && isQuietNow(prefs, at)) {
    return { allow: false, reason: "quiet_hours", channel };
  }
  return { allow: true, channel };
}

/**
 * Convenience: filter a batch of rows targeting the SAME user_id, returning
 * only the rows allowed by the user's preferences. Skipped rows are logged
 * on `dropped` with their reason for observability.
 */
export async function filterRowsForUser<
  T extends { user_id: string; kind: string; channel?: NotificationChannel; audience?: string },
>(
  client: SupabaseClient<Database>,
  userId: string,
  rows: T[],
): Promise<{ delivered: T[]; dropped: Array<{ row: T; reason: DeliveryDecision["reason"] }> }> {
  const prefs = await loadPrefs(client, userId);
  const delivered: T[] = [];
  const dropped: Array<{ row: T; reason: DeliveryDecision["reason"] }> = [];
  const now = new Date();
  for (const row of rows) {
    const d = decide(prefs, { ...row, user_id: userId }, now);
    if (d.allow) delivered.push(row);
    else dropped.push({ row, reason: d.reason });
  }
  return { delivered, dropped };
}
