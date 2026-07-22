import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Actions considered "sensitive" for the patient's personal audit trail.
 * These are the events surfaced by default on /portal/audit-log.
 */
export const SENSITIVE_ACTIONS = [
  "sensitive_profile_change",
  "login_success",
  "login_failed",
  "portal.session.revoked",
  "portal.sessions.revoke_others",
  "portal.sessions.revoke_all",
  "lab_report_download",
  "radiology_report_download",
  "consent.updated",
  "profile.password_changed",
] as const;

const ListSchema = z.object({
  action: z.string().trim().max(80).optional().nullable(),
  from: z.string().date().optional().nullable(),
  to: z.string().date().optional().nullable(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
});

export interface MyAuditRow {
  id: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  created_at: string;
}

export const listMyAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => ListSchema.parse(i ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;

    let q = supabase
      .from("security_audit_log")
      .select(
        "id, action, table_name, record_id, reason, ip_address, user_agent, metadata, created_at",
        { count: "exact" },
      )
      .eq("actor", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (data.action) q = q.eq("action", data.action);
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59Z`);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []) as MyAuditRow[],
      total: count ?? 0,
      limit,
      offset,
    };
  });

export const listMyAuditActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("security_audit_log")
      .select("action")
      .eq("actor", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const set = new Set<string>((data ?? []).map((r) => r.action));
    return Array.from(set).sort();
  });
