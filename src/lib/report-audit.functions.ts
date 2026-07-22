import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ACTIONS = ["lab_report_download", "radiology_report_download"] as const;

const filterSchema = z.object({
  user_id: z.string().uuid().optional(),
  report_id: z.string().trim().max(120).optional(),
  bucket: z.enum(["all", "lab-reports", "radiology-reports"]).default("all"),
  action: z.enum(["all", ...ACTIONS]).default("all"),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function humanize(err: any) {
  const msg = String(err?.message ?? "");
  if (/forbidden|42501|permission/i.test(msg)) return "ليست لديك الصلاحية لعرض سجل التنزيلات.";
  return msg || "تعذّر تحميل السجل.";
}

export const listReportDownloadAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rls } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roles = (rls ?? []).map((r: any) => r.role as string);
    if (!roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new Error("ليست لديك الصلاحية لعرض سجل التنزيلات.");
    }

    const actions = data.action === "all" ? (ACTIONS as unknown as string[]) : [data.action];

    let q = supabase
      .from("security_audit_log")
      .select("id, action, actor, metadata, ip_address, user_agent, created_at")
      .in("action", actions)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.user_id) q = q.eq("actor", data.user_id);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.bucket !== "all") q = q.eq("metadata->>bucket", data.bucket);
    if (data.report_id) q = q.eq("metadata->>report_id", data.report_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(humanize(error));

    const actorIds = Array.from(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean)),
    ) as string[];
    const actorMap = new Map<string, { name: string | null; phone: string | null }>();
    if (actorIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", actorIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (profs ?? []) as any[]) {
        actorMap.set(p.id, { name: p.full_name ?? null, phone: p.phone ?? null });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []).map((r: any) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id as string,
        action: r.action as string,
        actor: r.actor as string | null,
        actor_name: r.actor ? (actorMap.get(r.actor)?.name ?? null) : null,
        actor_phone: r.actor ? (actorMap.get(r.actor)?.phone ?? null) : null,
        report_id: (meta.report_id as string | null) ?? null,
        patient_id: (meta.patient_id as string | null) ?? null,
        bucket: (meta.bucket as string | null) ?? null,
        file_path: (meta.file_path as string | null) ?? null,
        ip_address: r.ip_address as string | null,
        user_agent: r.user_agent as string | null,
        created_at: r.created_at as string,
      };
    });
  });

export const listReportDownloadActors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rls } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roles = (rls ?? []).map((r: any) => r.role as string);
    if (!roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new Error("ليست لديك الصلاحية.");
    }
    const { data, error } = await context.supabase
      .from("security_audit_log")
      .select("actor")
      .in("action", ACTIONS as unknown as string[])
      .not("actor", "is", null)
      .limit(2000);
    if (error) throw new Error(humanize(error));
    const ids = Array.from(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new Set((data ?? []).map((r: any) => r.actor as string).filter(Boolean)),
    );
    if (!ids.length) return [] as Array<{ id: string; name: string | null; phone: string | null }>;
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", ids);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (profs ?? []).map((p: any) => ({
      id: p.id as string,
      name: (p.full_name as string | null) ?? null,
      phone: (p.phone as string | null) ?? null,
    }));
  });
