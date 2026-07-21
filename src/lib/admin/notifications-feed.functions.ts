/**
 * Admin — Notifications feed for the topbar bell.
 * Aggregates recent operational events from public.audit_logs and classifies
 * them by severity (success / info / warning / danger).
 * Guarded by has_role admin/super_admin via the shared console guard.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertConsoleAccess } from "./_guard";

export type AdminFeedSeverity = "success" | "info" | "warning" | "danger";

export type AdminFeedItem = {
  id: string;
  at: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  severity: AdminFeedSeverity;
  title: string;
  description: string | null;
};

const inputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  since: z.string().datetime().optional(),
});

function classify(action: string, entity: string | null): AdminFeedSeverity {
  const a = action.toLowerCase();
  if (/(fail|error|deny|denied|reject|revoke|delete|remove|breach|unauthorized|forbidden)/.test(a)) return "danger";
  if (/(warn|expire|risk|suspend|block|hold|cancel)/.test(a)) return "warning";
  if (/(create|insert|add|approve|confirm|success|complete|check_in|checkin|paid|grant|login)/.test(a)) return "success";
  return "info";
}

function titleFor(action: string, entity: string | null): string {
  const map: Record<string, string> = {
    appointment: "موعد",
    appointments: "موعد",
    service_inquiry: "طلب واتساب",
    complaint: "شكوى",
    user: "مستخدم",
    user_roles: "دور مستخدم",
    profile: "ملف مريض",
    patient: "مريض",
    invoice: "فاتورة",
    payment: "دفع",
    order: "طلب",
    medicine_order: "طلب دواء",
  };
  const label = (entity && map[entity]) || entity || "عملية";
  const verb = action.replace(/[_-]/g, " ");
  return `${label} — ${verb}`;
}

export const listAdminFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => inputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertConsoleAccess({ supabase: context.supabase, userId: context.userId });
    const sel = (s: string): string => s;
    let q = context.supabase
      .from("audit_logs")
      .select(sel("id, actor_id, action, entity_type, entity_id, metadata, created_at"))
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.since) q = q.gt("created_at", data.since);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const items: AdminFeedItem[] = ((rows ?? []) as Array<{
      id: string;
      actor_id: string | null;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>).map((r) => {
      const severity = classify(r.action, r.entity_type);
      const meta = r.metadata ?? {};
      const desc =
        (typeof meta["message"] === "string" && (meta["message"] as string)) ||
        (typeof meta["note"] === "string" && (meta["note"] as string)) ||
        (r.entity_id ? `#${r.entity_id.slice(0, 8)}` : null);
      return {
        id: r.id,
        at: r.created_at,
        actor_id: r.actor_id,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        severity,
        title: titleFor(r.action, r.entity_type),
        description: desc,
      };
    });

    return { items, fetched_at: new Date().toISOString() };
  });
