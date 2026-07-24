/**
 * Admin — Users module.
 *
 * Read-only surface over `profiles` + `user_roles` for the /admin/users
 * console. All handlers are guarded by `assertHasRole('admin')`. Role
 * grants/revokes are super_admin-only and audit-logged.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "./_guard";

const APP_ROLES = [
  "admin",
  "super_admin",
  "reception",
  "pharmacy",
  "doctor",
  "patient",
  "center_admin",
  "branch_manager",
  "reports_officer",
  "billing_officer",
  "insurance_officer",
  "support_agent",
  "content_manager",
  "auditor",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(APP_ROLES).optional(),
  branch_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

const PROFILE_COLUMNS =
  "id, full_name, phone, verified_phone, preferred_language, avatar_url, " +
  "default_branch_id, created_at, updated_at";

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    let q = sb
      .from("profiles")
      .select(PROFILE_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);

    if (data.branch_id) q = q.eq("default_branch_id", data.branch_id);
    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(
        `full_name.ilike.${like},phone.ilike.${like},verified_phone.ilike.${like}`,
      );
    }

    const { data: rowsRaw, error, count } = await q;
    if (error) throw new Error(error.message);
    const rows = (rowsRaw ?? []) as Array<Record<string, unknown> & { id: string }>;

    const ids = rows.map((r) => r.id);
    let rolesByUser: Record<string, string[]> = {};
    if (ids.length > 0) {
      const { data: roleRows, error: rErr } = await sb
        .from("user_roles")
        .select("user_id, role, branch_id, is_global")
        .in("user_id", ids);
      if (rErr) throw new Error(rErr.message);
      rolesByUser = ((roleRows ?? []) as Array<{ user_id: string; role: string }>).reduce(
        (acc: Record<string, string[]>, r) => {
          (acc[r.user_id] ||= []).push(r.role);
          return acc;
        },
        {},
      );
    }

    const merged = rows.map((r) => ({
      ...r,
      roles: rolesByUser[r.id] ?? [],
    }));

    const filtered = data.role
      ? merged.filter((r) => r.roles.includes(data.role as string))
      : merged;

    return { rows: filtered, total: count ?? 0 };
  });

const detailSchema = z.object({ id: z.string().uuid() });

export const getAdminUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => detailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;

    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select(
        `${PROFILE_COLUMNS}, national_id, date_of_birth, gender, ` +
          `emergency_contact_name, emergency_contact_phone, ` +
          `insurance_provider, insurance_policy_no, phone_verified_at, ` +
          `branch:branches!profiles_default_branch_id_fkey(id, name_ar, name_en)`,
      )
      .eq("id", data.id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("المستخدم غير موجود");

    const { data: roles, error: rErr } = await sb
      .from("user_roles")
      .select("id, role, branch_id, is_global, created_at")
      .eq("user_id", data.id)
      .order("created_at", { ascending: false });
    if (rErr) throw new Error(rErr.message);

    // Recent appointments (RLS applies as caller = admin)
    const { data: appointments } = await sb
      .from("appointments")
      .select("id, appointment_date, status, doctor_id, branch_id, created_at")
      .eq("patient_id", data.id)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      profile,
      roles: roles ?? [],
      recent_appointments: appointments ?? [],
    };
  });
