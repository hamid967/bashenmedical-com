/**
 * Patient reminder preferences — channels (in-app/email/sms/whatsapp/push) +
 * frequency + lead times.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ReminderPreferences = {
  channel_in_app: boolean;
  channel_email: boolean;
  channel_sms: boolean;
  channel_whatsapp: boolean;
  channel_push: boolean;
  frequency: "immediate" | "daily" | "weekly";
  appointment_lead_minutes: number;
  medication_lead_minutes: number;
  quiet_hours_enabled: boolean;
  wake_hour: number;
  sleep_hour: number;
};

const DEFAULTS: ReminderPreferences = {
  channel_in_app: true,
  channel_email: false,
  channel_sms: false,
  channel_whatsapp: false,
  channel_push: true,
  frequency: "immediate",
  appointment_lead_minutes: 120,
  medication_lead_minutes: 10,
  quiet_hours_enabled: true,
  wake_hour: 7,
  sleep_hour: 23,
};

export const getMyReminderPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReminderPreferences> => {
    const { data, error } = await context.supabase
      .from("reminder_preferences")
      .select(
        "channel_in_app, channel_email, channel_sms, channel_whatsapp, channel_push, frequency, appointment_lead_minutes, medication_lead_minutes, quiet_hours_enabled, wake_hour, sleep_hour",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return DEFAULTS;
    return {
      channel_in_app: data.channel_in_app,
      channel_email: data.channel_email,
      channel_sms: data.channel_sms,
      channel_whatsapp: (data as any).channel_whatsapp ?? false,
      channel_push: (data as any).channel_push ?? true,
      frequency: (data.frequency as ReminderPreferences["frequency"]) ?? "immediate",
      appointment_lead_minutes: data.appointment_lead_minutes,
      medication_lead_minutes: data.medication_lead_minutes,
      quiet_hours_enabled: data.quiet_hours_enabled,
      wake_hour: data.wake_hour,
      sleep_hour: data.sleep_hour,
    };
  });

const UpdateInput = z.object({
  channel_in_app: z.boolean(),
  channel_email: z.boolean(),
  channel_sms: z.boolean(),
  channel_whatsapp: z.boolean(),
  channel_push: z.boolean(),
  frequency: z.enum(["immediate", "daily", "weekly"]),
  appointment_lead_minutes: z.number().int().min(0).max(10080),
  medication_lead_minutes: z.number().int().min(0).max(1440),
  quiet_hours_enabled: z.boolean(),
  wake_hour: z.number().int().min(0).max(23),
  sleep_hour: z.number().int().min(0).max(23),
});

export const updateMyReminderPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("reminder_preferences")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
