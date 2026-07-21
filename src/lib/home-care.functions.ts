import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = ["admin", "super_admin", "reception"] as const;

async function assertStaff(supabase: any, userId: string) {
  for (const role of STAFF_ROLES) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden");
}

export const listHomeCareRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { status?: string; search?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    let query = context.supabase
      .from("home_care_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) query = query.eq("status", data.status);
    if (data.search) {
      const s = data.search.trim();
      if (s) query = query.or(`patient_name.ilike.%${s}%,patient_phone.ilike.%${s}%,service.ilike.%${s}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateHomeCareRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "reviewed", "contacted", "waiting_patient", "scheduled", "completed", "cancelled"]).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const patch: { updated_at: string; status?: string; notes?: string } = {
      updated_at: new Date().toISOString(),
    };
    if (data.status) patch.status = data.status;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { data: row, error } = await context.supabase
      .from("home_care_requests")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
