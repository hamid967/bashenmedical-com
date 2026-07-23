/**
 * Admin — Searchable Audit Logs viewer.
 * Reads from public.audit_logs (entity/action/before/after) with filters,
 * full-text-ish search over metadata/entity_id/action, and pagination.
 * Guarded by has_role admin/super_admin.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertPermission } from "@/lib/rbac/enforce.server";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { recordSensitiveAccess } from "@/lib/audit/sensitive-access.server";

// Phase 3B: audit-log reads are gated on the `audit.export` permission
// (held globally by `auditor` and `super_admin`). Global-only scope —
// audit visibility spans all branches.
async function assertAuditReader(supabase: any, userId: string) {
  await assertPermission({ supabase, userId }, PERMISSIONS.AuditExport);
}

const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
  entity_type: z.string().trim().max(80).optional(),
  action: z.string().trim().max(80).optional(),
  actor_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const listAdminAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAuditReader(context.supabase, context.userId);
    const sel = (s: string): string => s;
    let q = context.supabase
      .from("audit_logs")
      .select(
        sel(
          "id, actor_id, actor_role, action, entity_type, entity_id, before_data, after_data, ip_address, user_agent, metadata, created_at",
        ),
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.entity_type) q = q.eq("entity_type", data.entity_type);
    if (data.action) q = q.eq("action", data.action);
    if (data.actor_id) q = q.eq("actor_id", data.actor_id);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(data.to).toISOString());
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(
        `entity_id.ilike.${like},action.ilike.${like},entity_type.ilike.${like},ip_address.ilike.${like}`,
      );
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const listAuditFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAuditReader(context.supabase, context.userId);
    const sel = (s: string): string => s;
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select(sel("action, entity_type"))
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    const actions = new Set<string>();
    const entities = new Set<string>();
    for (const r of (data ?? []) as unknown as Array<{ action: string; entity_type: string }>) {
      if (r.action) actions.add(r.action);
      if (r.entity_type) entities.add(r.entity_type);
    }
    return {
      actions: Array.from(actions).sort(),
      entity_types: Array.from(entities).sort(),
    };
  });
