import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerOnly } from "./_access";

const ROLES = [
  "admin",
  "super_admin",
  "reception",
  "pharmacy",
  "doctor",
  "patient",
  "content_manager",
  "billing_officer",
  "insurance_officer",
  "reports_officer",
  "support_agent",
  "auditor",
] as const;
export type AppRole = (typeof ROLES)[number];

async function logAudit(
  supa: any,
  actor: string,
  action: string,
  record_id: string | null,
  metadata: Record<string, unknown>,
) {
  try {
    await supa.from("security_audit_log").insert({
      action,
      actor,
      record_id,
      table_name: "auth.users",
      metadata,
    });
  } catch (e) {
    console.error("[owner.accounts] audit insert failed", e);
  }
}

export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      page?: number;
      perPage?: number;
      search?: string;
      status?: "all" | "confirmed" | "unconfirmed" | "disabled";
      role?: "all" | "none" | AppRole;
    }) => ({
      page: Math.max(1, d?.page ?? 1),
      perPage: Math.min(200, Math.max(10, d?.perPage ?? 50)),
      search: (d?.search ?? "").trim().toLowerCase(),
      status: d?.status ?? "all",
      role: d?.role ?? "all",
    }),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const hasFilter = data.status !== "all" || data.role !== "all" || Boolean(data.search);
    const fetchPerPage = hasFilter ? Math.max(data.perPage, 200) : data.perPage;

    const { data: page, error } = await supabaseAdmin.auth.admin.listUsers({
      page: data.page,
      perPage: fetchPerPage,
    });
    if (error) throw new Error(error.message);

    const ids = page.users.map((u) => u.id);
    const [profilesRes, rolesRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,full_name,phone").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids),
    ]);
    const profiles = new Map<string, { full_name: string | null; phone: string | null }>();
    (profilesRes.data ?? []).forEach((p: any) =>
      profiles.set(p.id, { full_name: p.full_name, phone: p.phone }),
    );
    const rolesByUser = new Map<string, string[]>();
    (rolesRes.data ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });

    const now = Date.now();
    let enriched = page.users.map((u) => {
      const prof = profiles.get(u.id);
      const banned_until = (u as any).banned_until ?? null;
      const disabled = Boolean(banned_until && new Date(banned_until).getTime() > now);
      const confirmed = Boolean(u.email_confirmed_at || u.phone_confirmed_at);
      return {
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned_until,
        disabled,
        confirmed,
        full_name: prof?.full_name ?? null,
        profile_phone: prof?.phone ?? null,
        roles: rolesByUser.get(u.id) ?? [],
      };
    });

    if (data.search) {
      const s = data.search;
      enriched = enriched.filter(
        (u) =>
          u.email?.toLowerCase().includes(s) ||
          u.phone?.toLowerCase().includes(s) ||
          u.profile_phone?.toLowerCase().includes(s) ||
          u.full_name?.toLowerCase().includes(s) ||
          u.id.toLowerCase().includes(s),
      );
    }
    if (data.status !== "all") {
      enriched = enriched.filter((u) => {
        if (data.status === "disabled") return u.disabled;
        if (data.status === "confirmed") return !u.disabled && u.confirmed;
        if (data.status === "unconfirmed") return !u.disabled && !u.confirmed;
        return true;
      });
    }
    if (data.role !== "all") {
      enriched = enriched.filter((u) =>
        data.role === "none" ? u.roles.length === 0 : u.roles.includes(data.role as string),
      );
    }

    const totalFiltered = enriched.length;
    const start = hasFilter ? (data.page - 1) * data.perPage : 0;
    const paged = hasFilter ? enriched.slice(start, start + data.perPage) : enriched;

    return {
      page: data.page,
      perPage: data.perPage,
      total: page.total ?? enriched.length,
      totalFiltered,
      users: paged,
      roles: ROLES,
    };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ user_id: z.string().uuid(), role: z.enum(ROLES) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: data.user_id, role: data.role, is_global: true },
        { onConflict: "user_id,role" },
      );
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "owner.role_grant", data.user_id, {
      role: data.role,
    });
    return { ok: true };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ user_id: z.string().uuid(), role: z.enum(ROLES) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    if (data.user_id === context.userId && data.role === "super_admin") {
      throw new Error("لا يمكنك إزالة دور super_admin من حسابك.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "owner.role_revoke", data.user_id, {
      role: data.role,
    });
    return { ok: true };
  });

export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
    });
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "owner.password_reset", null, {
      email: data.email,
    });
    return { ok: true };
  });

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        password: z.string().min(8).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "owner.password_set", data.user_id, {});
    return { ok: true };
  });

export const setUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ user_id: z.string().uuid(), disable: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    if (data.user_id === context.userId && data.disable) {
      throw new Error("لا يمكنك تعطيل حسابك.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.disable ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    await logAudit(
      supabaseAdmin,
      context.userId,
      data.disable ? "owner.user_disable" : "owner.user_enable",
      data.user_id,
      {},
    );
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ user_id: z.string().uuid(), confirm_email: z.string().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    if (data.user_id === context.userId) {
      throw new Error("لا يمكنك حذف حسابك.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(
      data.user_id,
    );
    if (getErr) throw new Error(getErr.message);
    if (userRes.user?.email?.toLowerCase() !== data.confirm_email.toLowerCase()) {
      throw new Error("تأكيد البريد غير مطابق.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "owner.user_delete", data.user_id, {
      email: data.confirm_email,
    });
    return { ok: true };
  });
