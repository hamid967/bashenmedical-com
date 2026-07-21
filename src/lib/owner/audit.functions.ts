import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerOnly } from "./_access";

export const listOwnerAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        actor: z.string().uuid().nullable().optional(),
        action_like: z.string().max(120).nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("security_audit_log")
      .select("id,created_at,action,actor,record_id,table_name,metadata,ip_address")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.actor) q = q.eq("actor", data.actor);
    if (data.action_like) q = q.ilike("action", `%${data.action_like}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
