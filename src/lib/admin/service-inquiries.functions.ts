/**
 * Admin — WhatsApp service inquiries console.
 * List/filter, assign, change status, add notes, notify the patient,
 * close the request, and audit-trail via service_inquiry_updates.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role =
  | "admin"
  | "super_admin"
  | "support_agent"
  | "reception";

export async function assertHasRole(
  supabase: any,
  userId: string,
  role: Role = "admin",
) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: role,
  });
  if (error) throw new Error("تعذّر التحقق من الصلاحية.");
  if (!data) throw new Error("ليست لديك الصلاحية لإدارة استفسارات الخدمات.");
  return true;
}


const STATUSES = [
  "new",
  "contacted",
  "awaiting_patient",
  "appointment_created",
  "completed",
  "cancelled",
] as const;
const WA_STATUSES = ["not_opened", "opened", "delivery_unverified", "delivered", "failed"] as const;
const SOURCES = ["website", "mobile_web", "patient_portal", "campaign", "direct_link"] as const;

const listFilters = z.object({
  status: z.enum(STATUSES).optional(),
  whatsapp_status: z.enum(WA_STATUSES).optional(),
  source: z.enum(SOURCES).optional(),
  service_id: z.string().uuid().optional(),
  assigned_to: z.string().optional(), // uuid | "unassigned" | undefined
  linked: z.enum(["linked", "unlinked"]).optional(),
  search: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listAdminInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listFilters.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");

    let q = context.supabase
      .from("service_inquiries")
      .select(
        `id, request_number, full_name, mobile_number, mobile_e164,
         email, service_label, service_id, branch_id, source,
         preferred_contact_method, preferred_date, notes,
         internal_status, whatsapp_handoff_status, whatsapp_opened_at,
         assigned_to, user_id, linked_appointment_id, linked_at,
         closed_at, created_at, updated_at,
         branches:branch_id ( name_ar ),
         service:service_id ( name_ar, slug )`,
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status) q = q.eq("internal_status", data.status);
    if (data.whatsapp_status) q = q.eq("whatsapp_handoff_status", data.whatsapp_status);
    if (data.source) q = q.eq("source", data.source);
    if (data.service_id) q = q.eq("service_id", data.service_id);
    if (data.assigned_to === "unassigned") q = q.is("assigned_to", null);
    else if (data.assigned_to) q = q.eq("assigned_to", data.assigned_to);
    if (data.linked === "linked") q = q.not("user_id", "is", null);
    if (data.linked === "unlinked") q = q.is("user_id", null);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.search) {
      const s = data.search.replace(/[%,()]/g, " ");
      q = q.or(
        `request_number.ilike.%${s}%,full_name.ilike.%${s}%,mobile_e164.ilike.%${s}%,mobile_number.ilike.%${s}%,email.ilike.%${s}%`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      request_number: r.request_number,
      full_name: r.full_name,
      mobile_number: r.mobile_number,
      mobile_e164: r.mobile_e164,
      email: r.email,
      service_label: r.service_label,
      service_id: r.service_id,
      service_name_ar: r.service?.name_ar ?? null,
      branch_id: r.branch_id,
      branch_name: r.branches?.name_ar ?? null,
      source: r.source,
      preferred_contact_method: r.preferred_contact_method,
      preferred_date: r.preferred_date,
      notes: r.notes,
      internal_status: r.internal_status,
      whatsapp_handoff_status: r.whatsapp_handoff_status,
      whatsapp_opened_at: r.whatsapp_opened_at,
      assigned_to: r.assigned_to,
      user_id: r.user_id,
      linked_appointment_id: r.linked_appointment_id,
      linked_at: r.linked_at,
      closed_at: r.closed_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  });

export const getInquiryDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const [row, timeline] = await Promise.all([
      context.supabase
        .from("service_inquiries")
        .select(`*, branches:branch_id(name_ar), service:service_id(name_ar,slug)`)
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("service_inquiry_updates")
        .select("id, update_type, public_message, internal_note, metadata, created_by, created_at")
        .eq("inquiry_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (row.error) throw new Error(row.error.message);
    if (!row.data) throw new Error("الاستفسار غير موجود.");

    // Best-effort actor names for the timeline
    const actorIds = Array.from(
      new Set((timeline.data ?? []).map((u: any) => u.created_by).filter(Boolean)),
    ) as string[];
    let profiles: Record<string, string | null> = {};
    if (actorIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      profiles = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
    }

    return {
      inquiry: row.data,
      timeline: (timeline.data ?? []).map((t: any) => ({
        ...t,
        actor_name: t.created_by ? profiles[t.created_by] ?? null : null,
      })),
    };
  });

export const listAssignableStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("user_id, role, profiles:user_id(full_name)")
      .in("role", ["admin", "super_admin", "support_agent", "reception"]);
    if (error) throw new Error(error.message);
    const map = new Map<string, { user_id: string; name: string | null; roles: string[] }>();
    for (const r of data ?? []) {
      const uid = (r as any).user_id as string;
      const prev = map.get(uid);
      const name = ((r as any).profiles?.full_name as string | null) ?? null;
      if (prev) {
        if (!prev.roles.includes((r as any).role)) prev.roles.push((r as any).role);
      } else {
        map.set(uid, { user_id: uid, name, roles: [(r as any).role] });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "ar"),
    );
  });

export const assignInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        assigned_to: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;
    const { data: prev, error: readErr } = await sb
      .from("service_inquiries")
      .select("assigned_to")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!prev) throw new Error("الاستفسار غير موجود.");

    const { error } = await sb
      .from("service_inquiries")
      .update({ assigned_to: data.assigned_to })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await sb.from("service_inquiry_updates").insert({
      inquiry_id: data.id,
      update_type: "assignment",
      created_by: context.userId,
      metadata: { from: prev.assigned_to, to: data.assigned_to },
    });
    return { ok: true };
  });

export const updateInquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(STATUSES),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;
    const { data: prev, error: readErr } = await sb
      .from("service_inquiries")
      .select("internal_status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!prev) throw new Error("الاستفسار غير موجود.");

    const { error } = await sb
      .from("service_inquiries")
      .update({ internal_status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await sb.from("service_inquiry_updates").insert({
      inquiry_id: data.id,
      update_type: "status_change",
      internal_note: data.reason ?? null,
      created_by: context.userId,
      metadata: { from: prev.internal_status, to: data.status },
    });
    return { ok: true };
  });

export const addInquiryNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        text: z.string().trim().min(1).max(2000),
        visibility: z.enum(["internal", "public"]).default("internal"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const isPublic = data.visibility === "public";
    const { error } = await context.supabase.from("service_inquiry_updates").insert({
      inquiry_id: data.id,
      update_type: isPublic ? "public_message" : "note",
      public_message: isPublic ? data.text : null,
      internal_note: isPublic ? null : data.text,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const notifyInquiryPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(160),
        body: z.string().trim().min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;
    const { data: row, error } = await sb
      .from("service_inquiries")
      .select("id, user_id, request_number")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("الاستفسار غير موجود.");
    if (!row.user_id)
      throw new Error("لم يتم ربط الاستفسار بحساب مريض بعد، لا يمكن إرسال إشعار داخل التطبيق.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: nErr } = await supabaseAdmin.from("notifications").insert({
      audience: "user",
      user_id: row.user_id,
      kind: "service_inquiry_update",
      title: data.title,
      body: data.body,
      channel: "in_app",
      send_status: "sent",
      sent_at: new Date().toISOString(),
      metadata: { inquiry_id: row.id, request_number: row.request_number },
    });
    if (nErr) throw new Error(nErr.message);

    await sb.from("service_inquiry_updates").insert({
      inquiry_id: data.id,
      update_type: "public_message",
      public_message: `${data.title}\n${data.body}`,
      created_by: context.userId,
      metadata: { channel: "in_app" },
    });
    return { ok: true };
  });

export const closeInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        outcome: z.enum(["completed", "cancelled"]).default("completed"),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasRole(context.supabase, context.userId, "admin");
    const sb = context.supabase;
    const { data: prev, error: readErr } = await sb
      .from("service_inquiries")
      .select("internal_status, closed_at")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!prev) throw new Error("الاستفسار غير موجود.");

    const now = new Date().toISOString();
    const { error } = await sb
      .from("service_inquiries")
      .update({ internal_status: data.outcome, closed_at: now })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await sb.from("service_inquiry_updates").insert({
      inquiry_id: data.id,
      update_type: "closed",
      internal_note: data.reason ?? null,
      created_by: context.userId,
      metadata: { from: prev.internal_status, to: data.outcome, closed_at: now },
    });
    return { ok: true };
  });
