/**
 * Phase 8 — Unified Operations Inbox.
 *
 * Canonical read + operational actions against `public.inbox_items` with
 * every mutation persisted as an immutable `inbox_events` audit row via the
 * `inbox_log_event` SQL helper. No operational request is ever deleted —
 * archival flips status to `archived` and stamps `archived_at`.
 *
 * Access is gated to staff roles (admin / super_admin / reception /
 * support_agent). Non-privileged callers get an Arabic "forbidden" error.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------------- Types ----------------
export const INBOX_STATUSES = [
  "new",
  "reviewed",
  "contacted",
  "awaiting_patient",
  "awaiting_approval",
  "appointment_created",
  "in_progress",
  "completed",
  "cancelled",
  "duplicate",
  "archived",
] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

export const INBOX_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type InboxPriority = (typeof INBOX_PRIORITIES)[number];

export const INBOX_CHANNELS = [
  "website",
  "booking",
  "patient_portal",
  "whatsapp",
  "contact_form",
  "reception",
  "phone",
  "campaign",
  "support",
  "other",
] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

export const INBOX_ACTIONS = [
  "created",
  "assign",
  "transfer",
  "change_priority",
  "change_status",
  "add_note",
  "contact_patient",
  "request_documents",
  "link_appointment",
  "send_notification",
  "merge_duplicate",
  "archive",
  "reopen",
] as const;
export type InboxActionKind = (typeof INBOX_ACTIONS)[number];

export type InboxItem = {
  id: string;
  request_number: string;
  source_table: string;
  source_id: string | null;
  channel: InboxChannel;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  service_label: string | null;
  subject: string | null;
  branch_id: string | null;
  department: string | null;
  priority: InboxPriority;
  status: InboxStatus;
  assigned_to: string | null;
  linked_appointment_id: string | null;
  required_action: string | null;
  metadata: Record<string, any>;
  last_action_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type InboxEvent = {
  id: string;
  item_id: string;
  actor_user_id: string | null;
  action: InboxActionKind;
  from_value: any;
  to_value: any;
  note: string | null;
  created_at: string;
};

// ---------------- Auth helpers ----------------
const STAFF_ROLES = ["admin", "super_admin", "reception", "support_agent"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

async function assertInboxStaff(
  supabase: any,
  userId: string,
): Promise<StaffRole[]> {
  const checks = await Promise.all(
    STAFF_ROLES.map((role) =>
      supabase.rpc("has_role", { _user_id: userId, _role: role }),
    ),
  );
  const held = STAFF_ROLES.filter((_, i) => checks[i]?.data === true);
  if (!held.length) throw new Error("ليست لديك صلاحية الوصول للصندوق الموحّد.");
  return held as StaffRole[];
}

/** Actions that only admins/super_admins may perform. */
const ADMIN_ONLY_ACTIONS = new Set<InboxActionKind>([
  "merge_duplicate",
  "archive",
  "reopen",
]);

function assertAllowed(roles: StaffRole[], action: InboxActionKind) {
  if (!ADMIN_ONLY_ACTIONS.has(action)) return;
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");
  if (!isAdmin) throw new Error("هذا الإجراء يتطلب صلاحية مسؤول.");
}

async function logEvent(
  supabase: any,
  itemId: string,
  action: InboxActionKind,
  from: unknown,
  to: unknown,
  note: string | null,
) {
  const { error } = await supabase.rpc("inbox_log_event", {
    _item_id: itemId,
    _action: action,
    _from: from ?? null,
    _to: to ?? null,
    _note: note ?? null,
  });
  if (error) throw new Error(error.message);
}

// ---------------- Reads ----------------
const ListInput = z
  .object({
    status: z.enum(INBOX_STATUSES).optional(),
    channel: z.enum(INBOX_CHANNELS).optional(),
    priority: z.enum(INBOX_PRIORITIES).optional(),
    branch_id: z.string().uuid().optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    search: z.string().max(200).optional(),
    include_archived: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(500).optional().default(200),
  })
  .default({});

export const listInboxItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<InboxItem[]> => {
    await assertInboxStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("inbox_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.assigned_to === null) q = q.is("assigned_to", null);
    else if (data.assigned_to) q = q.eq("assigned_to", data.assigned_to);
    if (!data.include_archived && !data.status) q = q.neq("status", "archived");
    if (data.search?.trim()) {
      const s = data.search.trim().replace(/[,()]/g, " ");
      q = q.or(
        [
          `request_number.ilike.%${s}%`,
          `patient_name.ilike.%${s}%`,
          `patient_phone.ilike.%${s}%`,
          `subject.ilike.%${s}%`,
          `service_label.ilike.%${s}%`,
        ].join(","),
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as InboxItem[];
  });

export const getInboxItem = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ item: InboxItem; events: InboxEvent[] }> => {
      await assertInboxStaff(context.supabase, context.userId);
      const [{ data: item, error: e1 }, { data: events, error: e2 }] =
        await Promise.all([
          context.supabase
            .from("inbox_items")
            .select("*")
            .eq("id", data.id)
            .maybeSingle(),
          context.supabase
            .from("inbox_events")
            .select("*")
            .eq("item_id", data.id)
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
      if (e1) throw new Error(e1.message);
      if (!item) throw new Error("الطلب غير موجود.");
      if (e2) throw new Error(e2.message);
      return {
        item: item as InboxItem,
        events: (events ?? []) as InboxEvent[],
      };
    },
  );

export const getInboxCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertInboxStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("inbox_items")
      .select("status,priority");
    if (error) throw new Error(error.message);
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const r of (data ?? []) as { status: string; priority: string }[]) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
    }
    return { total: data?.length ?? 0, byStatus, byPriority };
  });

// ---------------- Mutations (each = 1 audit event) ----------------
const IdOnly = z.object({ id: z.string().uuid() });

async function loadItem(supabase: any, id: string): Promise<InboxItem> {
  const { data, error } = await supabase
    .from("inbox_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("الطلب غير موجود.");
  return data as InboxItem;
}

/** 1) Assign to a user (or clear with assignee = null). */
export const assignInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      assignee: z.string().uuid().nullable(),
      note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertInboxStaff(context.supabase, context.userId);
    assertAllowed(roles, "assign");
    const before = await loadItem(context.supabase, data.id);
    const { error } = await context.supabase
      .from("inbox_items")
      .update({ assigned_to: data.assignee })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(
      context.supabase,
      data.id,
      "assign",
      { assigned_to: before.assigned_to },
      { assigned_to: data.assignee },
      data.note ?? null,
    );
    return { ok: true };
  });

/** 2) Transfer department / branch. */
export const transferInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      department: z.string().max(80).nullable().optional(),
      branch_id: z.string().uuid().nullable().optional(),
      note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertInboxStaff(context.supabase, context.userId);
    assertAllowed(roles, "transfer");
    const before = await loadItem(context.supabase, data.id);
    const patch: Record<string, any> = {};
    if (data.department !== undefined) patch.department = data.department;
    if (data.branch_id !== undefined) patch.branch_id = data.branch_id;
    if (!Object.keys(patch).length) throw new Error("لا يوجد تحويل صالح.");
    const { error } = await context.supabase
      .from("inbox_items")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(
      context.supabase,
      data.id,
      "transfer",
      { department: before.department, branch_id: before.branch_id },
      patch,
      data.note ?? null,
    );
    return { ok: true };
  });

/** 3) Change priority. */
export const changeInboxPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      priority: z.enum(INBOX_PRIORITIES),
      note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertInboxStaff(context.supabase, context.userId);
    assertAllowed(roles, "change_priority");
    const before = await loadItem(context.supabase, data.id);
    if (before.priority === data.priority) return { ok: true, noop: true };
    const { error } = await context.supabase
      .from("inbox_items")
      .update({ priority: data.priority })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(
      context.supabase,
      data.id,
      "change_priority",
      { priority: before.priority },
      { priority: data.priority },
      data.note ?? null,
    );
    return { ok: true };
  });

/** 4) Change status. Blocks explicit archive/reopen — use dedicated fns. */
export const changeInboxStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      status: z.enum(INBOX_STATUSES),
      note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertInboxStaff(context.supabase, context.userId);
    assertAllowed(roles, "change_status");
    if (data.status === "archived")
      throw new Error("استخدم إجراء «الأرشفة» بدل تغيير الحالة مباشرة.");
    const before = await loadItem(context.supabase, data.id);
    if ((before.status as string) === "archived") {
      throw new Error("لا يمكن تغيير حالة طلب مؤرشف — استخدم إعادة الفتح.");
    }
    if (before.status === data.status) return { ok: true, noop: true };
    const { error } = await context.supabase
      .from("inbox_items")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(
      context.supabase,
      data.id,
      "change_status",
      { status: before.status },
      { status: data.status },
      data.note ?? null,
    );
    return { ok: true };
  });

/** 5) Add an internal note (no field change; still audited). */
export const addInboxNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({ note: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertInboxStaff(context.supabase, context.userId);
    await loadItem(context.supabase, data.id); // existence check
    await logEvent(
      context.supabase,
      data.id,
      "add_note",
      null,
      null,
      data.note,
    );
    return { ok: true };
  });

/** 6) Mark that we contacted the patient (channel = phone/whatsapp/sms/email). */
export const contactPatientOnInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      channel: z.enum(["phone", "whatsapp", "sms", "email", "in_person"]),
      outcome: z.enum(["no_answer", "reached", "left_message", "other"]),
      note: z.string().max(2000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertInboxStaff(context.supabase, context.userId);
    const before = await loadItem(context.supabase, data.id);
    // Move to "contacted" only when we actually reached the patient.
    if (
      data.outcome === "reached" &&
      before.status !== "contacted" &&
      before.status !== "appointment_created" &&
      before.status !== "completed"
    ) {
      await context.supabase
        .from("inbox_items")
        .update({ status: "contacted" })
        .eq("id", data.id);
    }
    await logEvent(
      context.supabase,
      data.id,
      "contact_patient",
      null,
      { channel: data.channel, outcome: data.outcome },
      data.note ?? null,
    );
    return { ok: true };
  });

/** 7) Request supporting documents from the patient. */
export const requestInboxDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      documents: z.array(z.string().max(120)).min(1).max(20),
      note: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertInboxStaff(context.supabase, context.userId);
    await loadItem(context.supabase, data.id);
    await context.supabase
      .from("inbox_items")
      .update({ status: "awaiting_patient" })
      .eq("id", data.id);
    await logEvent(
      context.supabase,
      data.id,
      "request_documents",
      null,
      { documents: data.documents },
      data.note ?? null,
    );
    return { ok: true };
  });

/** 8) Link an existing appointment (or clear the link). */
export const linkInboxAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      appointment_id: z.string().uuid().nullable(),
      note: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertInboxStaff(context.supabase, context.userId);
    const before = await loadItem(context.supabase, data.id);
    // Verify the appointment exists (RLS keeps this scoped).
    if (data.appointment_id) {
      const { data: appt, error } = await context.supabase
        .from("appointments")
        .select("id")
        .eq("id", data.appointment_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!appt) throw new Error("الموعد غير موجود.");
    }
    const patch: Record<string, any> = {
      linked_appointment_id: data.appointment_id,
    };
    if (data.appointment_id && before.status !== "appointment_created") {
      patch.status = "appointment_created";
    }
    const { error } = await context.supabase
      .from("inbox_items")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(
      context.supabase,
      data.id,
      "link_appointment",
      { linked_appointment_id: before.linked_appointment_id },
      { linked_appointment_id: data.appointment_id },
      data.note ?? null,
    );
    return { ok: true };
  });

/** 9) Record that a notification was sent (SMS/WhatsApp/email). */
export const notifyInboxPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      channel: z.enum(["sms", "whatsapp", "email", "push"]),
      template: z.string().max(80).optional(),
      note: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertInboxStaff(context.supabase, context.userId);
    await loadItem(context.supabase, data.id);
    await logEvent(
      context.supabase,
      data.id,
      "send_notification",
      null,
      { channel: data.channel, template: data.template ?? null },
      data.note ?? null,
    );
    return { ok: true };
  });

/**
 * 10) Merge a duplicate into a primary request.
 *     Both rows are preserved; duplicate is flagged `duplicate` and points
 *     to the primary via `metadata.merged_into`. Never delete.
 */
export const mergeInboxDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({
      into_id: z.string().uuid(),
      note: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertInboxStaff(context.supabase, context.userId);
    assertAllowed(roles, "merge_duplicate");
    if (data.id === data.into_id)
      throw new Error("لا يمكن دمج طلب مع نفسه.");
    const [dup, primary] = await Promise.all([
      loadItem(context.supabase, data.id),
      loadItem(context.supabase, data.into_id),
    ]);
    const meta = { ...(dup.metadata ?? {}), merged_into: primary.id };
    const { error } = await context.supabase
      .from("inbox_items")
      .update({ status: "duplicate", metadata: meta })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(
      context.supabase,
      data.id,
      "merge_duplicate",
      { status: dup.status },
      { status: "duplicate", merged_into: primary.id },
      data.note ?? null,
    );
    // Also log a companion event on the primary so its history shows the merge.
    await logEvent(
      context.supabase,
      primary.id,
      "merge_duplicate",
      null,
      { merged_from: dup.id },
      data.note ?? null,
    );
    return { ok: true };
  });

/** 11) Archive (soft) — never a hard delete. */
export const archiveInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({ note: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertInboxStaff(context.supabase, context.userId);
    assertAllowed(roles, "archive");
    const before = await loadItem(context.supabase, data.id);
    if (before.status === "archived") return { ok: true, noop: true };
    const { error } = await context.supabase
      .from("inbox_items")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(
      context.supabase,
      data.id,
      "archive",
      { status: before.status },
      { status: "archived" },
      data.note ?? null,
    );
    return { ok: true };
  });

/** 12) Reopen from any non-active state back to `new`. */
export const reopenInboxItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    IdOnly.extend({ note: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertInboxStaff(context.supabase, context.userId);
    assertAllowed(roles, "reopen");
    const before = await loadItem(context.supabase, data.id);
    const { error } = await context.supabase
      .from("inbox_items")
      .update({ status: "new", archived_at: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logEvent(
      context.supabase,
      data.id,
      "reopen",
      { status: before.status, archived_at: before.archived_at },
      { status: "new", archived_at: null },
      data.note ?? null,
    );
    return { ok: true };
  });
