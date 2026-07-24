/**
 * Admin — Notification Center feed for the topbar bell and full page.
 *
 * Merges four operational sources with per-item deep links:
 *   - system_health    : degraded/down services from services-health snapshot
 *   - integration      : failed integration_logs rows in the window
 *   - request          : recent service_inquiries (new / status changed)
 *   - audit            : recent public.audit_logs entries
 *
 * Read-only. Guarded by has_role admin/super_admin via the shared console
 * guard. Every returned item is safe to render as a clickable Link.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertConsoleAccess } from "./_guard";

export type AdminFeedSeverity = "success" | "info" | "warning" | "danger";
export type AdminFeedCategory = "system_health" | "integration" | "request" | "audit";

export type AdminFeedItem = {
  id: string;
  at: string;
  category: AdminFeedCategory;
  severity: AdminFeedSeverity;
  title: string;
  description: string | null;
  href: string | null;
  actor_id?: string | null;
  action?: string;
  entity_type?: string | null;
  entity_id?: string | null;
};

const inputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  since: z.string().datetime().optional(),
  category: z.enum(["system_health", "integration", "request", "audit"]).optional(),
});

function classifyAudit(action: string): AdminFeedSeverity {
  const a = action.toLowerCase();
  if (/(fail|error|deny|denied|reject|revoke|delete|remove|breach|unauthorized|forbidden)/.test(a))
    return "danger";
  if (/(warn|expire|risk|suspend|block|hold|cancel)/.test(a)) return "warning";
  if (/(create|insert|add|approve|confirm|success|complete|check_in|checkin|paid|grant|login)/.test(a))
    return "success";
  return "info";
}

function auditTitle(action: string, entity: string | null): string {
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

function auditHref(entity: string | null, entityId: string | null): string | null {
  if (!entity) return "/admin/audit-logs";
  const e = entity.toLowerCase();
  if (/^(appointment|appointments)$/.test(e))
    return entityId ? `/appointments-queue?ref=${entityId}` : "/appointments-queue";
  if (/^(service_inquiry|service_inquiries)$/.test(e))
    return entityId ? `/admin/inbox?id=${entityId}` : "/admin/inbox";
  if (/^(complaint|complaints)$/.test(e)) return "/admin/inbox";
  if (/^(user|user_roles|profile|patient)$/.test(e)) return "/admin/users";
  if (/^(invoice|invoices|payment|payments)$/.test(e)) return "/admin/invoices";
  return `/admin/audit-logs?ref=${entityId ?? ""}`;
}

// ---------------------------------------------------------------------------

export const listAdminFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => inputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertConsoleAccess({ supabase: context.supabase, userId: context.userId });
    const sb = context.supabase;
    const sinceIso =
      data.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const wantAll = !data.category;
    const want = (c: AdminFeedCategory) => wantAll || data.category === c;

    const [auditRes, integrationRes, inquiryRes] = await Promise.all([
      want("audit")
        ? sb
            .from("audit_logs")
            .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
            .gt("created_at", sinceIso)
            .order("created_at", { ascending: false })
            .limit(data.limit)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      want("integration")
        ? sb
            .from("integration_logs")
            .select("id, integration_key, operation, status, error_message, created_at")
            .gt("created_at", sinceIso)
            .in("status", ["error", "failed"])
            .order("created_at", { ascending: false })
            .limit(data.limit)
        : Promise.resolve({ data: [] as unknown[], error: null }),
      want("request")
        ? sb
            .from("service_inquiries")
            .select(
              "id, request_number, full_name, service_label, internal_status, whatsapp_handoff_status, created_at, updated_at",
            )
            .gt("updated_at", sinceIso)
            .order("updated_at", { ascending: false })
            .limit(data.limit)
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);

    const items: AdminFeedItem[] = [];

    // ---- Audit ---------------------------------------------------------
    for (const r of (auditRes.data ?? []) as Array<{
      id: string;
      actor_id: string | null;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>) {
      const meta = r.metadata ?? {};
      const desc =
        (typeof meta["message"] === "string" && (meta["message"] as string)) ||
        (typeof meta["note"] === "string" && (meta["note"] as string)) ||
        (r.entity_id ? `#${r.entity_id.slice(0, 8)}` : null);
      items.push({
        id: `audit:${r.id}`,
        at: r.created_at,
        category: "audit",
        severity: classifyAudit(r.action),
        title: auditTitle(r.action, r.entity_type),
        description: desc,
        href: auditHref(r.entity_type, r.entity_id),
        actor_id: r.actor_id,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
      });
    }

    // ---- Integration failures -----------------------------------------
    for (const r of (integrationRes.data ?? []) as Array<{
      id: string;
      integration_key: string | null;
      operation: string | null;
      status: string | null;
      error_message: string | null;
      created_at: string;
    }>) {
      items.push({
        id: `integration:${r.id}`,
        at: r.created_at,
        category: "integration",
        severity: "danger",
        title: `فشل تكامل — ${r.integration_key ?? "غير معروف"}`,
        description:
          (r.error_message && r.error_message.slice(0, 140)) ||
          (r.operation ? `العملية: ${r.operation}` : "خطأ في التكامل"),
        href: `/admin/nphies-logs?key=${encodeURIComponent(r.integration_key ?? "")}`,
      });
    }

    // ---- Request updates ----------------------------------------------
    for (const r of (inquiryRes.data ?? []) as Array<{
      id: string;
      request_number: string | null;
      full_name: string | null;
      service_label: string | null;
      internal_status: string | null;
      whatsapp_handoff_status: string | null;
      created_at: string;
      updated_at: string;
    }>) {
      const isNew = r.created_at === r.updated_at;
      const status = r.internal_status ?? "pending";
      const severity: AdminFeedSeverity =
        status === "closed" || status === "resolved"
          ? "success"
          : status === "cancelled" || status === "rejected"
            ? "warning"
            : "info";
      items.push({
        id: `request:${r.id}:${r.updated_at}`,
        at: r.updated_at,
        category: "request",
        severity,
        title: isNew
          ? `طلب جديد — ${r.request_number ?? r.full_name ?? "غير معروف"}`
          : `تحديث طلب — ${r.request_number ?? r.full_name ?? "غير معروف"}`,
        description:
          [r.service_label, `الحالة: ${status}`, r.whatsapp_handoff_status]
            .filter(Boolean)
            .join(" · ") || null,
        href: `/admin/inbox?id=${r.id}`,
      });
    }

    // ---- System health snapshot ---------------------------------------
    if (want("system_health")) {
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const [{ data: streamRows }, { data: intRows }] = await Promise.all([
          sb
            .from("ai_stream_events")
            .select("completed, error_status, error_type, created_at")
            .gte("created_at", oneHourAgo)
            .limit(500),
          sb
            .from("integration_logs")
            .select("integration_key, status, created_at")
            .gte("created_at", oneHourAgo)
            .limit(1000),
        ]);
        const rows = (streamRows ?? []) as Array<{
          completed: boolean | null;
          error_status: unknown;
          error_type: unknown;
          created_at: string;
        }>;
        const ok = rows.filter((r) => r.completed && !r.error_status).length;
        const err = rows.filter((r) => r.error_status || r.error_type).length;
        const total = ok + err;
        if (total > 0 && err / total > 0.05) {
          items.push({
            id: `health:ai_streaming:${oneHourAgo}`,
            at: rows[0]?.created_at ?? new Date().toISOString(),
            category: "system_health",
            severity: err / total > 0.2 ? "danger" : "warning",
            title: "AI Streaming — تدهور الأداء",
            description: `${err} أخطاء من ${total} خلال الساعة الأخيرة`,
            href: "/admin/ai-streaming",
          });
        }
        const integrationRows = (intRows ?? []) as Array<{
          integration_key: string | null;
          status: string | null;
        }>;
        const byKey = new Map<string, { ok: number; err: number }>();
        for (const r of integrationRows) {
          const k = r.integration_key ?? "unknown";
          const cur = byKey.get(k) ?? { ok: 0, err: 0 };
          if (r.status === "error" || r.status === "failed") cur.err += 1;
          else cur.ok += 1;
          byKey.set(k, cur);
        }
        for (const [k, s] of byKey.entries()) {
          const t = s.ok + s.err;
          if (t > 0 && s.err / t > 0.2) {
            items.push({
              id: `health:integration:${k}:${oneHourAgo}`,
              at: new Date().toISOString(),
              category: "system_health",
              severity: s.err / t > 0.5 ? "danger" : "warning",
              title: `تكامل ${k} — أعطال متكررة`,
              description: `${s.err} فشل من ${t} خلال الساعة الأخيرة`,
              href: `/admin/nphies-logs?key=${encodeURIComponent(k)}`,
            });
          }
        }
      } catch {
        // Health snapshot is best-effort; never fail the feed on it.
      }
    }

    // ---- Sort + trim ---------------------------------------------------
    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const trimmed = items.slice(0, data.limit);

    return {
      items: trimmed,
      counts: {
        total: trimmed.length,
        system_health: trimmed.filter((i) => i.category === "system_health").length,
        integration: trimmed.filter((i) => i.category === "integration").length,
        request: trimmed.filter((i) => i.category === "request").length,
        audit: trimmed.filter((i) => i.category === "audit").length,
      },
      fetched_at: new Date().toISOString(),
    };
  });
