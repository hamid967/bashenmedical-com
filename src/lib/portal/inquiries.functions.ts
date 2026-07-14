/**
 * Patient portal — service inquiries (Jazan WhatsApp widget) linked
 * to the currently signed-in user.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type MyInquiry = {
  id: string;
  request_number: string;
  full_name: string;
  mobile_number: string;
  service_label: string | null;
  branch_id: string | null;
  branch_name: string | null;
  preferred_date: string | null;
  preferred_contact_method: string;
  notes: string | null;
  internal_status: string;
  whatsapp_handoff_status: string;
  whatsapp_opened_at: string | null;
  created_at: string;
  linked_at: string | null;
};

export const listMyInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyInquiry[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("service_inquiries")
      .select(
        `id, request_number, full_name, mobile_number, service_label,
         branch_id, preferred_date, preferred_contact_method, notes,
         internal_status, whatsapp_handoff_status, whatsapp_opened_at,
         created_at, linked_at,
         branches:branch_id ( name_ar )`
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      request_number: r.request_number,
      full_name: r.full_name,
      mobile_number: r.mobile_number,
      service_label: r.service_label,
      branch_id: r.branch_id,
      branch_name: r.branches?.name_ar ?? null,
      preferred_date: r.preferred_date,
      preferred_contact_method: r.preferred_contact_method,
      notes: r.notes,
      internal_status: r.internal_status,
      whatsapp_handoff_status: r.whatsapp_handoff_status,
      whatsapp_opened_at: r.whatsapp_opened_at,
      created_at: r.created_at,
      linked_at: r.linked_at,
    }));
  });

const claimSchema = z.object({
  request_number: z.string().trim().min(6).max(64),
  link_token: z.string().uuid(),
});

export const claimMyInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => claimSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("claim_service_inquiry", {
      _request_number: data.request_number,
      _link_token: data.link_token,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      claimed: !!row,
      request_number: row?.request_number ?? null,
    };
  });
