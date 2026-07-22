import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAppEvent } from "./audit-log.server";
import { z } from "zod";

const MAX_ROWS = 10000;

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.some((r: string) => ["admin", "super_admin", "reception"].includes(r))) {
    throw new Error("ليست لديك الصلاحية لعرض/تصدير السجلات.");
  }
  return roles;
}

const filterSchema = z.object({
  kind: z.enum([
    "appointment_audit",
    "security_audit_log",
    "reminder_preference_audit",
    "dashboard_recent_activity",
  ]),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  actor_id: z.string().uuid().nullable().optional(),
  event: z.string().trim().max(64).nullable().optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).default(MAX_ROWS),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuditRow = Record<string, any>;

async function fetchAppointmentAudit(supabase: any, f: z.infer<typeof filterSchema>) {
  let q = supabase
    .from("appointment_audit")
    .select(
      "id, appointment_id, changed_at, changed_by, old_status, new_status, old_notes, new_notes, reason",
    )
    .order("changed_at", { ascending: false })
    .limit(f.limit);
  if (f.from) q = q.gte("changed_at", f.from);
  if (f.to) q = q.lte("changed_at", f.to);
  if (f.actor_id) q = q.eq("changed_by", f.actor_id);
  if (f.event) q = q.eq("new_status", f.event);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const apptIds = Array.from(
    new Set((rows ?? []).map((r: any) => r.appointment_id).filter(Boolean)),
  ) as string[];
  const actorIds = Array.from(
    new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)),
  ) as string[];

  const apptMap = new Map<string, any>();
  if (apptIds.length) {
    const { data: appts } = await supabase
      .from("appointments")
      .select("id, patient_name, patient_phone, branch_id")
      .in("id", apptIds);
    for (const a of (appts ?? []) as any[]) apptMap.set(a.id, a);
  }

  const actorMap = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of (profs ?? []) as any[]) actorMap.set(p.id, p.full_name ?? p.id);
  }

  let filtered = (rows ?? []) as any[];
  if (f.branch_id) {
    filtered = filtered.filter((r) => apptMap.get(r.appointment_id)?.branch_id === f.branch_id);
  }

  return filtered.map((r) => {
    const a = apptMap.get(r.appointment_id) ?? {};
    return {
      changed_at: r.changed_at,
      patient_name: a.patient_name ?? "",
      patient_phone: a.patient_phone ?? "",
      old_status: r.old_status ?? "",
      new_status: r.new_status ?? "",
      old_notes: r.old_notes ?? "",
      new_notes: r.new_notes ?? "",
      reason: r.reason ?? "",
      actor: r.changed_by ? (actorMap.get(r.changed_by) ?? r.changed_by) : "",
    } as AuditRow;
  });
}

async function fetchSecurityAudit(supabase: any, f: z.infer<typeof filterSchema>) {
  let q = supabase
    .from("security_audit_log")
    .select(
      "id, created_at, action, actor, appointment_id, from_status, to_status, reason, metadata, ip_address, user_agent, branch_id, table_name, record_id",
    )
    .order("created_at", { ascending: false })
    .limit(f.limit);
  if (f.from) q = q.gte("created_at", f.from);
  if (f.to) q = q.lte("created_at", f.to);
  if (f.actor_id) q = q.eq("actor", f.actor_id);
  if (f.event) q = q.eq("action", f.event);
  if (f.branch_id) q = q.eq("branch_id", f.branch_id);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const actorIds = Array.from(
    new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean)),
  ) as string[];
  const actorMap = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of (profs ?? []) as any[]) actorMap.set(p.id, p.full_name ?? p.id);
  }

  return (rows ?? []).map(
    (r: any) =>
      ({
        created_at: r.created_at,
        action: r.action,
        actor: r.actor ? (actorMap.get(r.actor) ?? r.actor) : "",
        table_name: r.table_name ?? "",
        record_id: r.record_id ?? "",
        from_status: r.from_status ?? "",
        to_status: r.to_status ?? "",
        reason: r.reason ?? "",
        ip_address: r.ip_address ?? "",
        user_agent: r.user_agent ?? "",
        metadata: r.metadata ? JSON.stringify(r.metadata) : "",
      }) as AuditRow,
  );
}

async function fetchReminderAudit(supabase: any, f: z.infer<typeof filterSchema>) {
  let q = supabase
    .from("reminder_preference_audit")
    .select(
      "id, appointment_id, reminder_kind, changed_by, source, old_value, new_value, reason, changed_at",
    )
    .order("changed_at", { ascending: false })
    .limit(f.limit);
  if (f.from) q = q.gte("changed_at", f.from);
  if (f.to) q = q.lte("changed_at", f.to);
  if (f.actor_id) q = q.eq("changed_by", f.actor_id);
  if (f.event) q = q.eq("reminder_kind", f.event);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const apptIds = Array.from(
    new Set((rows ?? []).map((r: any) => r.appointment_id).filter(Boolean)),
  ) as string[];
  const actorIds = Array.from(
    new Set((rows ?? []).map((r: any) => r.changed_by).filter(Boolean)),
  ) as string[];

  const apptMap = new Map<string, any>();
  if (apptIds.length) {
    const { data: appts } = await supabase
      .from("appointments")
      .select("id, patient_name, patient_phone, branch_id")
      .in("id", apptIds);
    for (const a of (appts ?? []) as any[]) apptMap.set(a.id, a);
  }

  const actorMap = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of (profs ?? []) as any[]) actorMap.set(p.id, p.full_name ?? p.id);
  }

  let filtered = (rows ?? []) as any[];
  if (f.branch_id) {
    filtered = filtered.filter((r) => apptMap.get(r.appointment_id)?.branch_id === f.branch_id);
  }

  return filtered.map((r) => {
    const a = apptMap.get(r.appointment_id) ?? {};
    return {
      changed_at: r.changed_at,
      patient_name: a.patient_name ?? "",
      patient_phone: a.patient_phone ?? "",
      reminder_kind: r.reminder_kind,
      old_value: r.old_value === null ? "" : r.old_value ? "مفعّل" : "متوقف",
      new_value: r.new_value === null ? "" : r.new_value ? "مفعّل" : "متوقف",
      source: r.source ?? "",
      reason: r.reason ?? "",
      actor: r.changed_by ? (actorMap.get(r.changed_by) ?? r.changed_by) : "",
    } as AuditRow;
  });
}

async function fetchDashboardRecent(supabase: any, f: z.infer<typeof filterSchema>) {
  const { data, error } = await supabase.rpc(
    "dashboard_recent_activity" as any,
    {
      _branch_id: f.branch_id ?? null,
      _limit: Math.min(f.limit, 500),
    } as any,
  );
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as any[];
  if (f.from) rows = rows.filter((r) => r.changed_at >= f.from!);
  if (f.to) rows = rows.filter((r) => r.changed_at <= f.to!);
  if (f.event) rows = rows.filter((r) => r.new_status === f.event);
  return rows.map(
    (r) =>
      ({
        changed_at: r.changed_at,
        patient_name: r.patient_name ?? "",
        old_status: r.old_status ?? "",
        new_status: r.new_status ?? "",
        reason: r.reason ?? "",
      }) as AuditRow,
  );
}

export const fetchAuditExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<AuditRow[]> => {
    await assertStaff(context.supabase, context.userId);
    const supabase = context.supabase;
    let rows: AuditRow[] = [];
    switch (data.kind) {
      case "appointment_audit":
        rows = await fetchAppointmentAudit(supabase, data);
        break;
      case "security_audit_log":
        rows = await fetchSecurityAudit(supabase, data);
        break;
      case "reminder_preference_audit":
        rows = await fetchReminderAudit(supabase, data);
        break;
      case "dashboard_recent_activity":
        rows = await fetchDashboardRecent(supabase, data);
        break;
    }
    await logAppEvent(supabase, "audit.export", {
      kind: data.kind,
      from: data.from ?? null,
      to: data.to ?? null,
      branch_id: data.branch_id ?? null,
      actor_id: data.actor_id ?? null,
      event: data.event ?? null,
      row_count: rows.length,
    });
    return rows;
  });

export const listBranchesForAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("branches")
      .select("id, name_ar, name_en")
      .order("name_ar", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; name_ar: string | null; name_en: string | null }>;
  });
