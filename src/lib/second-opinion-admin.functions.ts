import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAppEvent } from "./audit-log.server";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/download-error";
import { z } from "zod";

const STATUSES = ["received", "reviewing", "accepted", "rejected"] as const;
export type SecondOpinionStatus = (typeof STATUSES)[number];

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

export const listSecondOpinionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: SecondOpinionStatus | "all" } | undefined) =>
    z
      .object({ status: z.enum([...STATUSES, "all"]).optional() })
      .optional()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("second_opinion_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateSecondOpinionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status?: SecondOpinionStatus; admin_notes?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(STATUSES).optional(),
        admin_notes: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch: { status?: SecondOpinionStatus; admin_notes?: string | null } = {};
    if (data.status) patch.status = data.status;
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("second_opinion_requests")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSecondOpinionAttachmentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paths: string[] }) =>
    z.object({ paths: z.array(z.string()).max(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const out: { path: string; url: string | null }[] = [];
    for (const p of data.paths) {
      const { data: signed } = await context.supabase.storage
        .from("second-opinion-uploads")
        .createSignedUrl(p, SIGNED_URL_TTL_SECONDS);
      out.push({ path: p, url: signed?.signedUrl ?? null });
    }
    await logAppEvent(context.supabase, "second_opinion.signed_url_issued", {
      paths: data.paths,
      count: out.length,
    });
    return out;
  });
