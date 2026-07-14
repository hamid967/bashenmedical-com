import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ROLES = [
  "super_admin",
  "admin",
  "center_admin",
  "branch_manager",
  "doctor",
  "reception",
  "pharmacy",
  "reports_officer",
  "billing_officer",
  "insurance_officer",
  "support_agent",
  "content_manager",
  "auditor",
  "patient",
] as const;
export type AppRole = (typeof ROLES)[number];

function humanize(err: any, fallback = "تعذّر تنفيذ الطلب.") {
  if (!err) return fallback;
  const msg = String(err.message ?? "");
  if (/forbidden|42501|permission denied/i.test(msg))
    return "ليست لديك الصلاحية لتنفيذ هذا الإجراء.";
  if (/only super_admin/i.test(msg))
    return "هذا الدور يتطلب صلاحية المسؤول الأعلى (super_admin).";
  if (/last super_admin/i.test(msg))
    return "لا يمكن حذف آخر مستخدم بصلاحية المسؤول الأعلى.";
  return msg || fallback;
}

async function getRoles(supabase: any, userId: string): Promise<AppRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as AppRole);
}

function getClientMeta() {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ua = getRequestHeader("user-agent") ?? null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) ?? null;
    } catch {}
    if (!ip) {
      const fwd = getRequestHeader("x-forwarded-for");
      const real = getRequestHeader("x-real-ip");
      const cf = getRequestHeader("cf-connecting-ip");
      ip = (cf ?? real ?? (fwd ? fwd.split(",")[0]?.trim() : null)) ?? null;
    }
  } catch {}
  return { ip, ua };
}

export const listUsersWithRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_users_with_roles" as any);
    if (error) throw new Error(humanize(error));
    return (data ?? []) as Array<{
      user_id: string;
      full_name: string | null;
      phone: string | null;
      email: string | null;
      created_at: string | null;
      roles: Array<{ role: AppRole; branch_id: string | null }>;
    }>;
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(ROLES),
        branch_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ip, ua } = getClientMeta();
    const { error } = await context.supabase.rpc("assign_user_role" as any, {
      _user_id: data.user_id,
      _role: data.role,
      _branch_id: data.branch_id ?? null,
      _ip: ip,
      _ua: ua,
    } as any);
    if (error) throw new Error(humanize(error));
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ user_id: z.string().uuid(), role: z.enum(ROLES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ip, ua } = getClientMeta();
    const { error } = await context.supabase.rpc("revoke_user_role" as any, {
      _user_id: data.user_id,
      _role: data.role,
      _ip: ip,
      _ua: ua,
    } as any);
    if (error) throw new Error(humanize(error));
    return { ok: true };
  });

export const listBranchesForRbac = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("branches")
      .select("id, name_ar, name_en")
      .order("name_ar", { ascending: true });
    if (error) throw new Error(humanize(error));
    return data ?? [];
  });

/* ---------------- Permissions catalog & role matrix ---------------- */

export const listPermissionsCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_permissions_catalog" as any);
    if (error) throw new Error(humanize(error));
    return (data ?? []) as Array<{
      key: string;
      category: string;
      description_ar: string;
      description_en: string | null;
    }>;
  });

export const listRolePermissionsMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_role_permissions_matrix" as any);
    if (error) throw new Error(humanize(error));
    return (data ?? []) as Array<{ role: AppRole; permission_key: string }>;
  });

export const setRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        role: z.enum(ROLES),
        permission_key: z.string().min(1).max(120),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_role_permission" as any, {
      _role: data.role,
      _permission_key: data.permission_key,
      _enabled: data.enabled,
    } as any);
    if (error) throw new Error(humanize(error));
    return { ok: true };
  });

export type RolePermissionAuditRow = {
  id: string;
  created_at: string;
  action: "role_permission_granted" | "role_permission_revoked";
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  role_key: AppRole | null;
  permission_key: string | null;
  permission_label_ar: string | null;
  permission_label_en: string | null;
  previous_enabled: boolean | null;
  new_enabled: boolean | null;
};

export const listRolePermissionAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "list_role_permission_audit" as any,
      { _limit: data.limit, _offset: data.offset } as any,
    );
    if (error) throw new Error(humanize(error));
    return (rows ?? []) as RolePermissionAuditRow[];
  });

/* ---------------- Export / Import role-permission settings ---------------- */

export const exportRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    if (!roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new Error("ليست لديك الصلاحية.");
    }
    const [{ data: matrix, error: e1 }, { data: catalog, error: e2 }] = await Promise.all([
      context.supabase.rpc("list_role_permissions_matrix" as any),
      context.supabase.rpc("list_permissions_catalog" as any),
    ]);
    if (e1) throw new Error(humanize(e1));
    if (e2) throw new Error(humanize(e2));

    const grouped: Record<string, string[]> = {};
    for (const r of (matrix ?? []) as any[]) {
      (grouped[r.role] ??= []).push(r.permission_key);
    }
    for (const k of Object.keys(grouped)) grouped[k].sort();

    return {
      version: 1 as const,
      exported_at: new Date().toISOString(),
      exported_by: context.userId,
      known_permissions: ((catalog ?? []) as any[]).map((c) => c.key).sort(),
      roles: grouped,
    };
  });

const importSchema = z.object({
  mode: z.enum(["merge", "replace"]).default("merge"),
  payload: z.object({
    version: z.literal(1),
    roles: z.record(z.string(), z.array(z.string().min(1).max(120))),
  }),
});

export const importRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => importSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const myRoles = await getRoles(supabase, context.userId);
    const isSuper = myRoles.includes("super_admin");
    if (!isSuper && !myRoles.includes("admin")) {
      throw new Error("ليست لديك الصلاحية لاستيراد الإعدادات.");
    }

    // Fetch known permission keys to reject unknown entries
    const { data: cat } = await supabase.from("permissions").select("key");
    const known = new Set<string>(((cat ?? []) as any[]).map((r) => r.key));

    // Current matrix
    const { data: current } = await supabase.rpc("list_role_permissions_matrix" as any);
    const currentByRole = new Map<string, Set<string>>();
    for (const r of ((current ?? []) as any[])) {
      const s = currentByRole.get(r.role) ?? new Set<string>();
      s.add(r.permission_key);
      currentByRole.set(r.role, s);
    }

    const stats = {
      added: 0,
      removed: 0,
      skipped_unknown: [] as string[],
      skipped_roles: [] as string[],
      errors: [] as string[],
    };

    const targetRoles = Object.keys(data.payload.roles);
    for (const role of targetRoles) {
      if (!ROLES.includes(role as AppRole)) {
        stats.skipped_roles.push(role);
        continue;
      }
      if (role === "super_admin") {
        stats.skipped_roles.push(role); // never modify super_admin
        continue;
      }
      if (!isSuper && role === "admin") {
        stats.skipped_roles.push(role);
        continue;
      }

      const desired = new Set<string>();
      for (const k of data.payload.roles[role] ?? []) {
        if (!known.has(k)) {
          stats.skipped_unknown.push(`${role}:${k}`);
          continue;
        }
        desired.add(k);
      }
      const existing = currentByRole.get(role) ?? new Set<string>();

      // Add missing
      for (const k of desired) {
        if (existing.has(k)) continue;
        const { error } = await supabase.rpc("set_role_permission" as any, {
          _role: role,
          _permission_key: k,
          _enabled: true,
        } as any);
        if (error) stats.errors.push(`+${role}:${k}: ${error.message}`);
        else stats.added++;
      }

      // Remove extras (replace mode only)
      if (data.mode === "replace") {
        for (const k of existing) {
          if (desired.has(k)) continue;
          const { error } = await supabase.rpc("set_role_permission" as any, {
            _role: role,
            _permission_key: k,
            _enabled: false,
          } as any);
          if (error) stats.errors.push(`-${role}:${k}: ${error.message}`);
          else stats.removed++;
        }
      }
    }

    return { ok: true, mode: data.mode, ...stats };
  });

export const getMyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase, userId);
    const isSuper = roles.includes("super_admin");
    if (isSuper) {
      const { data } = await supabase.from("permissions").select("key");
      return {
        userId,
        roles,
        isSuper: true,
        permissions: (data ?? []).map((p: any) => p.key as string),
      };
    }
    if (roles.length === 0) {
      return { userId, roles, isSuper: false, permissions: [] as string[] };
    }
    const { data } = await supabase
      .from("role_permissions")
      .select("permission_key")
      .in("role", roles as any);
    const perms = Array.from(
      new Set((data ?? []).map((r: any) => r.permission_key as string)),
    );
    return { userId, roles, isSuper: false, permissions: perms };
  });

/* ---------------- Audit log (extended with IP/UA) ---------------- */

const auditFilterSchema = z.object({
  action: z.string().trim().max(64).optional(),
  actor: z.string().uuid().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => auditFilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase, userId);
    if (!roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new Error("ليست لديك الصلاحية لعرض سجل التدقيق.");
    }

    let q = supabase
      .from("security_audit_log")
      .select(
        "id, action, actor, appointment_id, from_status, to_status, reason, metadata, ip_address, user_agent, created_at, branch_id, table_name, record_id",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) q = q.eq("action", data.action);
    if (data.actor) q = q.eq("actor", data.actor);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(humanize(error));

    const actorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean)),
    ) as string[];
    let actorMap = new Map<string, { name: string | null; phone: string | null }>();
    if (actorIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", actorIds);
      for (const p of (profs ?? []) as any[]) {
        actorMap.set(p.id, { name: p.full_name ?? null, phone: p.phone ?? null });
      }
    }

    const branchIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.branch_id).filter(Boolean)),
    ) as string[];
    let branchMap = new Map<string, string>();
    if (branchIds.length) {
      const { data: brs } = await supabase
        .from("branches")
        .select("id, name_ar, name_en")
        .in("id", branchIds);
      for (const b of (brs ?? []) as any[]) {
        branchMap.set(b.id, b.name_ar ?? b.name_en ?? b.id);
      }
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      action: r.action as string,
      actor: r.actor as string | null,
      actor_name: r.actor ? actorMap.get(r.actor)?.name ?? null : null,
      actor_phone: r.actor ? actorMap.get(r.actor)?.phone ?? null : null,
      appointment_id: r.appointment_id as string | null,
      from_status: r.from_status as string | null,
      to_status: r.to_status as string | null,
      reason: r.reason as string | null,
      metadata: r.metadata as any,
      ip_address: r.ip_address as string | null,
      user_agent: r.user_agent as string | null,
      created_at: r.created_at as string,
      branch_id: (r.branch_id as string | null) ?? null,
      branch_name: r.branch_id ? branchMap.get(r.branch_id) ?? null : null,
      table_name: (r.table_name as string | null) ?? null,
      record_id: (r.record_id as string | null) ?? null,
    }));
  });

export const listAuditActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    if (!roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new Error("ليست لديك الصلاحية.");
    }
    const { data, error } = await context.supabase
      .from("security_audit_log")
      .select("action")
      .limit(2000);
    if (error) throw new Error(humanize(error));
    return Array.from(new Set((data ?? []).map((r: any) => r.action))).sort();
  });

/* ---------------- RBAC-focused audit log ---------------- */

const RBAC_TABLES = ["user_roles", "role_permissions", "permissions"] as const;

const rbacAuditFilterSchema = z.object({
  table: z.enum(["all", ...RBAC_TABLES]).default("all"),
  actor: z.string().uuid().optional(),
  target_user: z.string().uuid().optional(),
  role: z.string().trim().max(64).optional(),
  permission_key: z.string().trim().max(120).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

function extractTargets(row: any): {
  target_user_id: string | null;
  role: string | null;
  permission_key: string | null;
  branch_id: string | null;
} {
  const meta = row.metadata ?? {};
  const src = meta.new ?? meta.old ?? {};
  const changes = meta.changes ?? {};
  const pick = (k: string) =>
    src?.[k] ?? changes?.[k]?.new ?? changes?.[k]?.old ?? null;
  return {
    target_user_id: pick("user_id"),
    role: pick("role"),
    permission_key: pick("permission_key") ?? pick("key"),
    branch_id: pick("branch_id"),
  };
}

export const listRbacAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => rbacAuditFilterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await getRoles(supabase, userId);
    if (!roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new Error("ليست لديك الصلاحية لعرض سجل التدقيق.");
    }

    const tables =
      data.table === "all" ? (RBAC_TABLES as unknown as string[]) : [data.table];

    let q = supabase
      .from("security_audit_log")
      .select(
        "id, action, actor, metadata, ip_address, user_agent, created_at, table_name, record_id",
      )
      .in("table_name", tables)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.actor) q = q.eq("actor", data.actor);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(humanize(error));

    let filtered = (rows ?? []) as any[];
    if (data.target_user || data.role || data.permission_key || data.q) {
      const needle = data.q?.toLowerCase() ?? "";
      filtered = filtered.filter((r) => {
        const t = extractTargets(r);
        if (data.target_user && t.target_user_id !== data.target_user) return false;
        if (data.role && String(t.role ?? "") !== data.role) return false;
        if (
          data.permission_key &&
          String(t.permission_key ?? "") !== data.permission_key
        )
          return false;
        if (needle) {
          const hay = JSON.stringify(r.metadata ?? {}).toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      });
    }

    // Resolve actor + target user profiles
    const userIds = new Set<string>();
    for (const r of filtered) {
      if (r.actor) userIds.add(r.actor);
      const t = extractTargets(r);
      if (t.target_user_id) userIds.add(t.target_user_id);
    }
    const profileMap = new Map<string, { name: string | null; phone: string | null }>();
    if (userIds.size) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", Array.from(userIds));
      for (const p of (profs ?? []) as any[]) {
        profileMap.set(p.id, { name: p.full_name ?? null, phone: p.phone ?? null });
      }
    }

    return filtered.map((r) => {
      const t = extractTargets(r);
      const meta = r.metadata ?? {};
      const isUpdate = !!meta.changes;
      const isInsert = !meta.changes && !!meta.new;
      const isDelete = !meta.changes && !meta.new && !!meta.old;
      const op = isUpdate ? "update" : isInsert ? "insert" : isDelete ? "delete" : "other";
      return {
        id: r.id as string,
        action: r.action as string,
        op,
        table_name: r.table_name as string,
        record_id: (r.record_id as string | null) ?? null,
        created_at: r.created_at as string,
        actor: r.actor as string | null,
        actor_name: r.actor ? profileMap.get(r.actor)?.name ?? null : null,
        actor_phone: r.actor ? profileMap.get(r.actor)?.phone ?? null : null,
        target_user_id: t.target_user_id,
        target_user_name: t.target_user_id
          ? profileMap.get(t.target_user_id)?.name ?? null
          : null,
        target_user_phone: t.target_user_id
          ? profileMap.get(t.target_user_id)?.phone ?? null
          : null,
        role: t.role,
        permission_key: t.permission_key,
        branch_id: t.branch_id,
        metadata: meta,
        ip_address: r.ip_address as string | null,
        user_agent: r.user_agent as string | null,
      };
    });
  });
