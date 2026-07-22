import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/download-error";

/**
 * Complaints & suggestions system.
 * - submitComplaint: public, accepts anon or attaches auth uid when signed in.
 * - listMyComplaints: authenticated patient's own list.
 * - listAllComplaints: staff (admin/reception).
 * - updateComplaint: staff status/notes updates.
 * - trackComplaint: public lookup by reference + phone.
 */

function serverPublicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const complaintTypes = ["complaint", "suggestion", "thanks", "inquiry"] as const;
const complaintStatuses = [
  "submitted",
  "under_review",
  "waiting_patient",
  "resolved",
  "closed",
] as const;

// ---------------------------------------------------------------------------
// Submit (public — attaches user_id if signed in via optional bearer)
// ---------------------------------------------------------------------------
const attachmentSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(255),
  type: z.string().max(120).optional().or(z.literal("")),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(20 * 1024 * 1024),
});

const submitSchema = z.object({
  name: z.string().trim().min(2, "الاسم قصير جداً").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{7,20}$/u, "رقم الجوال غير صالح"),
  email: z.string().email("البريد الإلكتروني غير صالح").optional().or(z.literal("")),
  type: z.enum(complaintTypes),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  message: z.string().trim().min(10, "الرسالة قصيرة جداً — 10 أحرف على الأقل").max(4000),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

export const submitComplaint = createServerFn({ method: "POST" })
  .validator((raw: unknown) => submitSchema.parse(raw))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const insertRow = {
      patient_name: data.name,
      patient_phone: data.phone.replace(/\s+/g, ""),
      patient_email: data.email || null,
      type: data.type,
      department: data.department || null,
      message: data.message,
    };
    // Use admin client so anonymous submissions bypass the authenticated-only
    // INSERT policy. Public write is intentional — everyone can file a complaint.
    const { data: row, error } = await supabaseAdmin
      .from("complaints")
      .insert(insertRow)
      .select("id, reference")
      .single();
    if (error) throw new Error("تعذّر إرسال الرسالة، حاول مرة أخرى.");
    void supabase; // reserved for future public reads
    return { id: row.id, reference: row.reference };
  });

// Authenticated variant — attaches patient_user_id so the row shows up under
// listMyComplaints and RLS lets the patient read it back.
export const submitMyComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => submitSchema.parse(raw))
  .handler(async ({ data, context }) => {
    // Enforce path ownership on attachments — every stored path must live
    // under the caller's uid folder. Prevents cross-user path forgery.
    const atts = (data.attachments ?? []).filter((a) => a.path.startsWith(`${context.userId}/`));
    const { data: row, error } = await context.supabase
      .from("complaints")
      .insert({
        patient_user_id: context.userId,
        patient_name: data.name,
        patient_phone: data.phone.replace(/\s+/g, ""),
        patient_email: data.email || null,
        type: data.type,
        department: data.department || null,
        message: data.message,
        attachments: atts,
      })
      .select("id, reference")
      .single();
    if (error) throw new Error("تعذّر إرسال الرسالة، حاول مرة أخرى.");
    return { id: row.id, reference: row.reference };
  });

// ---------------------------------------------------------------------------
// Patient: edit own complaint message — only while still "submitted"
// ---------------------------------------------------------------------------
const editMySchema = z.object({
  id: z.string().uuid(),
  message: z.string().trim().min(10, "الرسالة قصيرة جداً — 10 أحرف على الأقل").max(4000),
  department: z.string().trim().max(120).optional().or(z.literal("")),
});

export const editMyComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => editMySchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("complaints")
      .select("id, status, patient_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing || existing.patient_user_id !== context.userId) {
      throw new Error("لم نعثر على البلاغ.");
    }
    if (existing.status !== "submitted") {
      throw new Error("لا يمكن تعديل البلاغ بعد بدء المراجعة.");
    }
    const { error } = await context.supabase
      .from("complaints")
      .update({
        message: data.message,
        department: data.department || null,
      })
      .eq("id", data.id)
      .eq("status", "submitted");
    if (error) throw new Error("تعذّر تعديل البلاغ، حاول مرة أخرى.");
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Track (public by reference + phone)
// ---------------------------------------------------------------------------
const trackSchema = z.object({
  reference: z.string().trim().min(6),
  phone: z.string().trim().min(6),
});

export const trackComplaint = createServerFn({ method: "POST" })
  .validator((raw: unknown) => trackSchema.parse(raw))
  .handler(async ({ data }) => {
    const supabase = serverPublicClient();
    const { data: rows, error } = await supabase.rpc("lookup_complaint", {
      _ref: data.reference.toUpperCase(),
      _phone: data.phone,
    });
    if (error) throw new Error("تعذّر البحث الآن، حاول لاحقاً.");
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("لم نعثر على بلاغ بهذه البيانات.");
    return row;
  });

// ---------------------------------------------------------------------------
// Patient's own list
// ---------------------------------------------------------------------------
export const listMyComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("complaints")
      .select(
        "id, reference, type, department, message, status, attachments, created_at, updated_at",
      )
      .eq("patient_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------------------------------------------------------------------------
// Patient: signed URLs for the attachments of one of my complaints
// ---------------------------------------------------------------------------
const signUrlsSchema = z.object({ id: z.string().uuid() });

export const getMyComplaintAttachmentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => signUrlsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("complaints")
      .select("attachments, patient_user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row || row.patient_user_id !== context.userId) {
      throw new Error("لم نعثر على البلاغ.");
    }
    const items = Array.isArray(row.attachments)
      ? (row.attachments as Array<{ path: string; name: string; type?: string; size?: number }>)
      : [];
    const signed = await Promise.all(
      items.map(async (a) => {
        const { data: s } = await context.supabase.storage
          .from("complaint-attachments")
          .createSignedUrl(a.path, SIGNED_URL_TTL_SECONDS);
        return { ...a, url: s?.signedUrl ?? null };
      }),
    );
    return signed;
  });

// ---------------------------------------------------------------------------
// Staff: list all
// ---------------------------------------------------------------------------
const listAllSchema = z
  .object({
    status: z.enum(complaintStatuses).optional(),
    type: z.enum(complaintTypes).optional(),
    search: z.string().trim().max(200).optional(),
  })
  .optional();

export const listAllComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => listAllSchema.parse(raw) ?? {})
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isReception } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "reception",
    });
    if (!allowed && !isReception) throw new Error("Forbidden");

    let q = context.supabase
      .from("complaints")
      .select(
        "id, reference, patient_name, patient_phone, patient_email, type, department, message, status, internal_notes, assigned_to, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data?.status) q = q.eq("status", data.status);
    if (data?.type) q = q.eq("type", data.type);
    if (data?.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(
        `reference.ilike.%${s}%,patient_name.ilike.%${s}%,patient_phone.ilike.%${s}%,message.ilike.%${s}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------------------------------------------------------------------------
// Staff: update status / internal notes
// ---------------------------------------------------------------------------
const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(complaintStatuses).optional(),
  internal_notes: z.string().max(4000).optional().nullable(),
});

export const updateComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => updateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isReception } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "reception",
    });
    if (!isAdmin && !isReception) throw new Error("Forbidden");

    const patch: {
      status?: (typeof complaintStatuses)[number];
      internal_notes?: string | null;
    } = {};
    if (data.status) patch.status = data.status;
    if (data.internal_notes !== undefined) patch.internal_notes = data.internal_notes;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase.from("complaints").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
