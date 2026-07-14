/**
 * Message templates management — CRUD for reusable message bodies
 * across in-app / web push / SMS / WhatsApp / email channels.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "admin" | "super_admin" | "reception" | "doctor" | "pharmacy";

async function getRoles(sb: any, userId: string): Promise<Role[]> {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}
function ensureStaff(roles: Role[]) {
  if (!roles.some((r) => (["admin", "super_admin", "reception"] as Role[]).includes(r)))
    throw new Error("ليست لديك الصلاحية.");
}
function ensureAdmin(roles: Role[]) {
  if (!roles.some((r) => (["admin", "super_admin"] as Role[]).includes(r)))
    throw new Error("هذه العملية مخصصة للمدير فقط.");
}

export type MessageChannel = "in_app" | "web_push" | "sms" | "whatsapp" | "email";

export type MessageTemplate = {
  id: string;
  template_key: string;
  channel: MessageChannel;
  name: string;
  title: string | null;
  body: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/* -------- Available template variables (for preview + hint) -------- */
export const TEMPLATE_VARIABLES: Array<{
  key: string;
  label: string;
  sample: string;
}> = [
  { key: "patient_name", label: "اسم المريض", sample: "أحمد محمد العلي" },
  { key: "patient_phone", label: "هاتف المريض", sample: "0555123456" },
  { key: "patient_mrn", label: "رقم الملف الطبي", sample: "MRN-001234" },
  { key: "appointment_date", label: "تاريخ الموعد", sample: "الأربعاء 15/07/2026" },
  { key: "appointment_time", label: "وقت الموعد", sample: "10:30 صباحًا" },
  { key: "doctor_name", label: "اسم الطبيب", sample: "د. سارة عبدالله" },
  { key: "specialty_name", label: "التخصص", sample: "طب الأسنان" },
  { key: "branch_name", label: "اسم الفرع", sample: "فرع الرياض" },
  { key: "branch_phone", label: "هاتف الفرع", sample: "0112345678" },
  { key: "clinic_name", label: "اسم المجمع", sample: "مجمع باعشن الطبي" },
  { key: "booking_link", label: "رابط الحجز", sample: "https://example.com/b/xyz" },
];

const CHANNEL = z.enum(["in_app", "web_push", "sms", "whatsapp", "email"]);

/* -------- List templates -------- */
export const listMessageTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        channel: CHANNEL.nullable().optional(),
        activeOnly: z.boolean().optional(),
      })
      .default({})
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<MessageTemplate[]> => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureStaff(roles);
    let q = context.supabase
      .from("message_templates")
      .select("id, template_key, channel, name, title, body, description, is_active, created_at, updated_at")
      .order("channel", { ascending: true })
      .order("template_key", { ascending: true });
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.activeOnly) q = q.eq("is_active", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as MessageTemplate[];
  });

/* -------- Upsert template -------- */
const UpsertInput = z.object({
  id: z.string().uuid().nullable().optional(),
  template_key: z
    .string()
    .trim()
    .min(2, "المفتاح قصير جدًا")
    .max(80, "المفتاح طويل جدًا")
    .regex(/^[a-z0-9_]+$/i, "استخدم أحرف لاتينية وأرقام و _ فقط"),
  channel: CHANNEL,
  name: z.string().trim().min(2, "الاسم مطلوب").max(120),
  title: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1, "النص مطلوب").max(4000, "النص طويل جدًا"),
  description: z.string().trim().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const upsertMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ data, context }): Promise<MessageTemplate> => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureStaff(roles);
    const payload = {
      template_key: data.template_key.toLowerCase(),
      channel: data.channel,
      name: data.name,
      title: data.title || null,
      body: data.body,
      description: data.description || null,
      is_active: data.is_active ?? true,
      updated_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("message_templates")
        .update(payload)
        .eq("id", data.id)
        .select("id, template_key, channel, name, title, body, description, is_active, created_at, updated_at")
        .single();
      if (error) throw new Error(error.message);
      return row as unknown as MessageTemplate;
    }
    const { data: row, error } = await context.supabase
      .from("message_templates")
      .insert({ ...payload, created_by: context.userId })
      .select("id, template_key, channel, name, title, body, description, is_active, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as MessageTemplate;
  });

/* -------- Delete template -------- */
export const deleteMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    ensureAdmin(roles);
    const { error } = await context.supabase
      .from("message_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------- Render helper (also usable client-side) -------- */
export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => {
    const v = values[key.toLowerCase()];
    return typeof v === "string" ? v : `{{${key}}}`;
  });
}
