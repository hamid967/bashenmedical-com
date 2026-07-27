/**
 * Admin — WhatsApp requests.
 *
 * Reads over `service_inquiries` (the WhatsApp handoff intake) plus the
 * per-inquiry updates trail and any related `notification_delivery_logs`
 * entries whose channel is `whatsapp`. Guarded by admin/super_admin via
 * `assertHasRole('admin')`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const INTERNAL_STATUSES = [
  "new",
  "contacted",
  "awaiting_patient",
  "appointment_created",
  "completed",
  "cancelled",
] as const;

const HANDOFF_STATUSES = [
  "not_opened",
  "opened",
  "delivery_unverified",
  "delivered",
  "failed",
] as const;

const listSchema = z.object({
  branch_id: z.string().uuid().optional(),
  internal_status: z.enum(INTERNAL_STATUSES).optional(),
  handoff_status: z.enum(HANDOFF_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const ROW_COLUMNS =
  "id, request_number, full_name, mobile_number, mobile_e164, service_label, " +
  "preferred_date, preferred_contact_method, internal_status, whatsapp_handoff_status, " +
  "whatsapp_opened_at, created_at, linked_at, linked_appointment_id, " +
  "branch:branches(id, name_ar, name_en)";

export const listAdminWhatsappRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    let q = context.supabase
      .from("service_inquiries")
      .select(ROW_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.internal_status) q = q.eq("internal_status", data.internal_status);
    if (data.handoff_status) q = q.eq("whatsapp_handoff_status", data.handoff_status);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(data.to).toISOString());
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(
        `request_number.ilike.${like},full_name.ilike.${like},mobile_number.ilike.${like},mobile_e164.ilike.${like},service_label.ilike.${like}`,
      );
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminWhatsappRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    const { data: row, error } = await context.supabase
      .from("service_inquiries")
      .select(
        ROW_COLUMNS +
          ", email, national_id, notes, source, assigned_to, closed_at, updated_at, " +
          "specialty:specialties(id, name_ar, name_en), " +
          "doctor:doctors(id, full_name_ar, full_name_en), " +
          "insurance:insurance_providers(id, name_ar, name_en)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("طلب واتساب غير موجود");

    const { data: updates, error: uErr } = await context.supabase
      .from("service_inquiry_updates")
      .select("id, update_type, public_message, internal_note, metadata, created_by, created_at")
      .eq("inquiry_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (uErr) throw new Error(uErr.message);

    let delivery: unknown[] = [];
    const phone = (row as unknown).mobile_e164 || (row as unknown).mobile_number;
    if (phone) {
      const { data: dRows } = await context.supabase
        .from("notification_delivery_logs")
        .select("id, provider, template, recipient, status, error_message, attempt, created_at")
        .eq("channel", "whatsapp")
        .eq("recipient", phone)
        .order("created_at", { ascending: false })
        .limit(20);
      delivery = dRows ?? [];
    }

    return { row, updates: updates ?? [], delivery };
  });
