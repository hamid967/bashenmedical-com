import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerOnly } from "./_access";

export const getClinicSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerOnly(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("clinic_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { settings: data };
  });

const UpdateSchema = z.object({
  name_ar: z.string().min(1).max(200),
  name_en: z.string().min(1).max(200),
  phone: z.string().min(3).max(40),
  mobile: z.string().max(40).nullable().optional(),
  whatsapp: z.string().max(40).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  address_ar: z.string().min(1).max(400),
  address_en: z.string().min(1).max(400),
});

export const updateClinicSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("clinic_settings")
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("security_audit_log").insert({
      action: "owner.settings_update",
      actor: context.userId,
      table_name: "clinic_settings",
      metadata: data as any,
    });
    return { ok: true };
  });
