/**
 * Messaging settings server functions — WhatsApp number + SMS/OTP provider status.
 *
 * Admin-only. `getMessagingConfig` returns the WhatsApp number stored in
 * `clinic_settings` plus a snapshot of which SMS-related secrets are wired
 * into the runtime, so the UI can flag missing configuration clearly.
 * `updateMessagingConfig` patches only the WhatsApp field on row id=1.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "reception" | "pharmacy" | "super_admin";

async function getRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}

function ensureAdmin(roles: Role[]) {
  if (roles.includes("super_admin") || roles.includes("admin")) return;
  throw new Error("ليست لديك الصلاحية لتنفيذ هذا الإجراء.");
}

export type MessagingConfig = {
  whatsapp: string | null;
  providers: {
    /** Any of the known SMS provider secrets present on the server. */
    sms_any_configured: boolean;
    gatewayapi: boolean;
    twilio: boolean;
    messagebird: boolean;
    /** Email OTP path — always available via Supabase Auth. */
    email_otp_available: boolean;
    /** Optional external email provider (Resend) as a hint for branded emails. */
    resend: boolean;
  };
};

export const getMessagingConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MessagingConfig> => {
    ensureAdmin(await getRoles(context.supabase, context.userId));

    const { data, error } = await context.supabase
      .from("clinic_settings")
      .select("whatsapp")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const env = process.env;
    return {
      whatsapp: data?.whatsapp ?? null,
      providers: {
        gatewayapi: Boolean(env.GATEWAYAPI_API_KEY),
        twilio: Boolean(env.TWILIO_AUTH_TOKEN || env.TWILIO_API_KEY),
        messagebird: Boolean(env.MESSAGEBIRD_API_KEY),
        sms_any_configured: Boolean(
          env.GATEWAYAPI_API_KEY ||
          env.TWILIO_AUTH_TOKEN ||
          env.TWILIO_API_KEY ||
          env.MESSAGEBIRD_API_KEY,
        ),
        email_otp_available: true,
        resend: Boolean(env.RESEND_API_KEY),
      },
    };
  });

const UpdateSchema = z.object({
  whatsapp: z
    .string()
    .trim()
    .regex(/^[+0-9\s\-()]{6,20}$/i, "رقم واتساب غير صالح")
    .nullable()
    .transform((v) => (v ? v.replace(/[\s\-()]/g, "") : v))
    .or(z.literal("").transform(() => null))
    .or(z.null()),
});

export const updateMessagingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    ensureAdmin(await getRoles(context.supabase, context.userId));
    const { error } = await context.supabase
      .from("clinic_settings")
      .update({ whatsapp: data.whatsapp })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
