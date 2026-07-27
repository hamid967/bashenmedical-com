import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerOnly } from "./_access";

export const listOwnerAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(200),
        actor: z.string().uuid().nullable().optional(),
        actor_query: z.string().max(120).nullable().optional(),
        action_like: z.string().max(120).nullable().optional(),
        action_prefix: z.string().max(60).nullable().optional(),
        from: z.string().datetime().nullable().optional(),
        to: z.string().datetime().nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOnly(context.supabase, context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve actor search term (email / name / phone / partial uuid) into a
    // concrete set of user ids we can filter on.
    let actorIds: string[] | null = null;
    if (data.actor) {
      actorIds = [data.actor];
    } else if (data.actor_query && data.actor_query.trim()) {
      const q = data.actor_query.trim().toLowerCase();
      const ids = new Set<string>();

      // Match auth users by email/phone
      const { data: page } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      (page?.users ?? []).forEach((u) => {
        if (
          u.email?.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q)
        )
          ids.add(u.id);
      });

      // Match by profile full_name
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name")
        .ilike("full_name", `%${q}%`)
        .limit(200);
      (profs ?? []).forEach((p: any) => ids.add(p.id));

      actorIds = Array.from(ids);
      if (actorIds.length === 0) {
        return {
          rows: [],
          actors: {} as Record<string, { email: string | null; full_name: string | null }>,
        };
      }
    }

    let q = supabaseAdmin
      .from("security_audit_log")
      .select("id,created_at,action,actor,record_id,table_name,metadata,ip_address")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (actorIds && actorIds.length) q = q.in("actor", actorIds);
    if (data.action_like) q = q.ilike("action", `%${data.action_like}%`);
    if (data.action_prefix) q = q.ilike("action", `${data.action_prefix}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich with actor identity for display
    const distinctActors = Array.from(
      new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean)),
    ) as string[];
    const actors: Record<string, { email: string | null; full_name: string | null }> = {};
    if (distinctActors.length) {
      const [profRes] = await Promise.all([
        supabaseAdmin.from("profiles").select("id,full_name").in("id", distinctActors),
      ]);
      const nameById = new Map<string, string | null>();
      (profRes.data ?? []).forEach((p: any) => nameById.set(p.id, p.full_name ?? null));
      await Promise.all(
        distinctActors.map(async (id) => {
          try {
            const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
            actors[id] = {
              email: u?.user?.email ?? null,
              full_name: nameById.get(id) ?? null,
            };
          } catch {
            actors[id] = { email: null, full_name: nameById.get(id) ?? null };
          }
        }),
      );
    }

    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        ip_address: r.ip_address == null ? null : String(r.ip_address),
      })),
      actors,
    };
  });
