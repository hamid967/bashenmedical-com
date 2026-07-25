/**
 * Audit trail for tenant/organization switches inside /admin.
 * Records who switched, from/to which organization_id, and when.
 * Verifies the caller belongs to the target org before logging.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertConsoleAccess } from "./_guard";
import { recordSensitiveAccess } from "@/lib/audit/sensitive-access.server";

const InputSchema = z.object({
  fromOrganizationId: z.string().uuid().nullable().optional(),
  toOrganizationId: z.string().uuid().nullable().optional(),
  toOrganizationName: z.string().max(200).nullable().optional(),
  source: z.string().max(64).optional(),
});

export const logTenantSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertConsoleAccess({ supabase, userId });

    // Verify target membership so a forged organization_id can't be logged
    // as if the user had access to it.
    let membershipVerified = false;
    if (data.toOrganizationId) {
      const { data: mem } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", data.toOrganizationId)
        .eq("user_id", userId)
        .maybeSingle();
      membershipVerified = Boolean(mem);
    } else {
      // Switching to "All Organizations" is always allowed.
      membershipVerified = true;
    }

    await recordSensitiveAccess({
      supabase,
      actorId: userId,
      action: "admin.tenant_switch",
      entityType: "organization",
      entityId: data.toOrganizationId ?? null,
      permission: "admin.console.access",
      kind: "read",
      status: membershipVerified ? "success" : "failure",
      metadata: {
        from_organization_id: data.fromOrganizationId ?? null,
        to_organization_id: data.toOrganizationId ?? null,
        to_organization_name: data.toOrganizationName ?? null,
        source: data.source ?? "tenant_switcher",
        occurred_at: new Date().toISOString(),
      },
    });

    return { ok: true, verified: membershipVerified };
  });
