/**
 * Server-only sweep that publishes every `scheduled` cms_entry whose
 * `scheduled_at <= now()`. Called by the /api/public/cron/cms-publish
 * route. Uses supabaseAdmin because RLS on cms_entries only allows
 * updates from staff sessions; the cron runs unauthenticated.
 */
export type CmsPublishResult = {
  scanned: number;
  published: number;
  errors: string[];
};

export async function runCmsPublishSweep(): Promise<CmsPublishResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: CmsPublishResult = { scanned: 0, published: 0, errors: [] };
  const now = new Date().toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("cms_entries")
    .select("id, current_version_id, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .limit(500);
  if (error) {
    out.errors.push(error.message);
    return out;
  }
  out.scanned = due?.length ?? 0;

  for (const entry of due ?? []) {
    try {
      const { error: uerr } = await supabaseAdmin
        .from("cms_entries")
        .update({
          status: "published",
          published_at: now,
          scheduled_at: null,
        })
        .eq("id", (entry as any).id);
      if (uerr) throw new Error(uerr.message);

      await supabaseAdmin
        .from("cms_schedule")
        .update({ job_state: "done", ran_at: now })
        .eq("entry_id", (entry as any).id)
        .eq("job_state", "pending");

      await supabaseAdmin.from("cms_audit").insert({
        entry_id: (entry as any).id,
        version_id: (entry as any).current_version_id,
        actor_id: null,
        action: "publish_scheduled",
        metadata: { source: "cron" },
      });
      out.published++;
    } catch (e: any) {
      out.errors.push(`${(entry as any).id}: ${e?.message ?? "unknown"}`);
      await supabaseAdmin
        .from("cms_schedule")
        .update({ job_state: "error", ran_at: now, error: e?.message ?? "unknown" })
        .eq("entry_id", (entry as any).id)
        .eq("job_state", "pending");
    }
  }
  return out;
}
