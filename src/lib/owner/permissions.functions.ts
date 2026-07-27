import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerOnly } from "./_access";

const KIND = z.enum(["service", "page"]);
const PERM = z.enum(["view", "edit", "manage"]);

async function audit(supa: any, actor: string, action: string, record_id: string, meta: any) {
  try {
    await supa.from("security_audit_log").insert({
      action,
      actor,
      record_id,
      table_name: "user_resource_permissions",
      metadata: meta,
    });
  } catch (e) {
    console.error("[owner.perms] audit failed", e);
  }
}

export const listResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [services, pages] = await Promise.all([
      supabaseAdmin.from("service_catalog").select("id,name_ar,name_en,slug").order("name_ar"),
      supabaseAdmin.from("custom_pages").select("id,title,slug,status").order("title"),
    ]);
    return {
      services: (services.data ?? []).map((s: any) => ({
        id: s.id,
        label: s.name_ar || s.name_en || s.slug,
        slug: s.slug,
      })),
      pages: (pages.data ?? []).map((p: any) => ({
        id: p.id,
        label: p.title || p.slug,
        slug: p.slug,
        status: p.status,
      })),
    };
  });

export const listUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("user_resource_permissions")
      .select("id,resource_kind,resource_id,permission,created_at,granted_by")
      .eq("user_id", data.user_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const grantPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        user_id: z.string().uuid(),
        resource_kind: KIND,
        resource_id: z.string().uuid(),
        permission: PERM,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove weaker perms on the same resource so we keep a single row per resource.
    await supabaseAdmin
      .from("user_resource_permissions")
      .delete()
      .eq("user_id", data.user_id)
      .eq("resource_kind", data.resource_kind)
      .eq("resource_id", data.resource_id);
    const { error } = await supabaseAdmin.from("user_resource_permissions").insert({
      user_id: data.user_id,
      resource_kind: data.resource_kind,
      resource_id: data.resource_id,
      permission: data.permission,
      granted_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, context.userId, "owner.perm_grant", data.user_id, data);
    return { ok: true };
  });

export const revokePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("user_resource_permissions")
      .select("user_id,resource_kind,resource_id,permission")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("user_resource_permissions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(
      supabaseAdmin,
      context.userId,
      "owner.perm_revoke",
      row?.user_id ?? data.id,
      row ?? {},
    );
    return { ok: true };
  });
