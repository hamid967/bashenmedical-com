import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertHasAnyRole } from "./_guard";

/**
 * Insurance approvals state machine (Batch A3, NPHIES §11).
 *
 * Allowed transitions are enforced server-side by
 * `public.transition_insurance_approval` (SECURITY DEFINER, revoked from
 * PUBLIC). Every mutation is audit-logged into
 * `public.insurance_approval_events`.
 */
export const INSURANCE_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "needs_more_docs",
  "approved",
  "partial",
  "rejected",
  "expired",
  "cancelled",
] as const;

export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

export const ALLOWED_NEXT: Record<InsuranceStatus, InsuranceStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled", "needs_more_docs"],
  under_review: ["approved", "partial", "rejected", "needs_more_docs"],
  needs_more_docs: ["submitted", "cancelled"],
  approved: ["expired", "cancelled"],
  partial: ["expired", "cancelled"],
  rejected: [],
  expired: [],
  cancelled: [],
};

const APPROVAL_COLS =
  "id, request_number, status, service_description, approved_amount, patient_share, " +
  "missing_documents, notes, submitted_at, reviewed_at, expires_at, appointment_id, " +
  "patient_id, insurance_provider_id, attachments, created_at, updated_at, is_mock, " +
  "provider:insurance_providers(id, name_ar, name_en, coverage_percent), " +
  "patient:patients(id, name_ar, name_en, phone), " +
  "appointment:appointments(id, reference_number, appointment_date, appointment_time, branch_id)";

const ROLES = ["admin", "super_admin", "reception", "branch_manager"] as const;

/** List/search approvals with pagination + filters. */
export const listInsuranceApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const v = (raw ?? {}) as Record<string, unknown>;
    return {
      status: typeof v.status === "string" && v.status ? (v.status as string) : undefined,
      provider_id:
        typeof v.provider_id === "string" && v.provider_id ? (v.provider_id as string) : undefined,
      branch_id:
        typeof v.branch_id === "string" && v.branch_id ? (v.branch_id as string) : undefined,
      patient_id:
        typeof v.patient_id === "string" && v.patient_id ? (v.patient_id as string) : undefined,
      q: typeof v.q === "string" && v.q ? (v.q as string).trim().slice(0, 100) : undefined,
      from: typeof v.from === "string" && v.from ? (v.from as string) : undefined,
      to: typeof v.to === "string" && v.to ? (v.to as string) : undefined,
      limit: Math.min(Math.max(Number(v.limit) || 25, 1), 200),
      offset: Math.max(Number(v.offset) || 0, 0),
    };
  })
  .handler(async ({ context, data }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...ROLES]);
    let q = context.supabase
      .from("insurance_approvals")
      .select(APPROVAL_COLS, { count: "exact" })
      .order("updated_at", { ascending: false });

    if (data.status) q = q.eq("status", data.status);
    if (data.provider_id) q = q.eq("insurance_provider_id", data.provider_id);
    if (data.patient_id) q = q.eq("patient_id", data.patient_id);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.q) {
      const pat = `%${data.q}%`;
      q = q.or(`request_number.ilike.${pat},service_description.ilike.${pat},notes.ilike.${pat}`);
    }
    q = q.range(data.offset, data.offset + data.limit - 1);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    let filtered = rows ?? [];
    if (data.branch_id) {
      filtered = filtered.filter((r: any) => r?.appointment?.branch_id === data.branch_id);
    }
    return { rows: filtered, total: count ?? filtered.length };
  });

// Alias expected by the existing admin route.
export const listAdminInsuranceApprovals = listInsuranceApprovals;

/** Providers list for filter dropdown. */
export const listInsuranceProvidersForFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...ROLES]);
    const { data, error } = await context.supabase
      .from("insurance_providers")
      .select("id, name_ar, name_en, active, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const getInsuranceApproval = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const v = (raw ?? {}) as { id?: string };
    if (!v.id || typeof v.id !== "string") throw new Error("APPROVAL_ID_REQUIRED");
    return { id: v.id };
  })
  .handler(async ({ context, data }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...ROLES]);
    const [approvalRes, eventsRes] = await Promise.all([
      context.supabase
        .from("insurance_approvals")
        .select(APPROVAL_COLS)
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("insurance_approval_events")
        .select("id, from_status, to_status, note, meta, actor_user_id, created_at")
        .eq("approval_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (approvalRes.error) throw new Error(approvalRes.error.message);
    if (!approvalRes.data) throw new Error("NOT_FOUND");
    if (eventsRes.error) throw new Error(eventsRes.error.message);
    return { ...(approvalRes.data as any), events: eventsRes.data ?? [] };
  });

// Alias expected by the existing detail route.
export const getAdminInsuranceApproval = getInsuranceApproval;

/** Enforced state-machine transition. */
export const transitionInsuranceApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const v = (raw ?? {}) as {
      approval_id?: string;
      to_status?: string;
      note?: string;
      approved_amount?: number;
      patient_share?: number;
      missing_documents?: string[];
    };
    if (!v.approval_id || typeof v.approval_id !== "string")
      throw new Error("APPROVAL_ID_REQUIRED");
    if (!v.to_status || !(INSURANCE_STATUSES as readonly string[]).includes(v.to_status)) {
      throw new Error("INVALID_STATUS");
    }
    return {
      approval_id: v.approval_id,
      to_status: v.to_status as InsuranceStatus,
      note: typeof v.note === "string" ? v.note.slice(0, 2000) : undefined,
      approved_amount:
        typeof v.approved_amount === "number" && Number.isFinite(v.approved_amount)
          ? v.approved_amount
          : undefined,
      patient_share:
        typeof v.patient_share === "number" && Number.isFinite(v.patient_share)
          ? v.patient_share
          : undefined,
      missing_documents: Array.isArray(v.missing_documents)
        ? v.missing_documents.filter((x) => typeof x === "string").slice(0, 20)
        : undefined,
    };
  })
  .handler(async ({ context, data }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...ROLES]);
    const meta: Record<string, unknown> = {};
    if (data.approved_amount !== undefined) meta.approved_amount = data.approved_amount;
    if (data.patient_share !== undefined) meta.patient_share = data.patient_share;
    if (data.missing_documents !== undefined) meta.missing_documents = data.missing_documents;

    const { data: row, error } = await (context.supabase as any).rpc(
      "transition_insurance_approval",
      {
        _approval_id: data.approval_id,
        _to_status: data.to_status,
        _note: data.note ?? null,
        _meta: meta as unknown as any,
      },
    );
    if (error) {
      const msg = error.message || "";
      if (msg.includes("ILLEGAL_TRANSITION")) throw new Error("انتقال حالة غير مسموح.");
      if (msg.includes("FORBIDDEN")) throw new Error("ليست لديك الصلاحية لتنفيذ هذه العملية.");
      if (msg.includes("NOT_FOUND")) throw new Error("الطلب غير موجود.");
      throw new Error(msg);
    }
    return { approval: row };
  });

/**
 * Back-compat shim used by `/admin/insurance/$approvalId`: the legacy UI only
 * exposes "approve"/"reject" buttons. Approvals must have been submitted →
 * under_review before deciding; here we tolerate submitted by promoting to
 * under_review first, then applying the decision.
 */
export const decideInsuranceApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => {
    const v = (raw ?? {}) as { id?: string; decision?: string; note?: string };
    if (!v.id || typeof v.id !== "string") throw new Error("APPROVAL_ID_REQUIRED");
    if (v.decision !== "approved" && v.decision !== "rejected") throw new Error("INVALID_DECISION");
    return {
      id: v.id,
      decision: v.decision as "approved" | "rejected",
      note: typeof v.note === "string" ? v.note.slice(0, 2000) : undefined,
    };
  })
  .handler(async ({ context, data }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...ROLES]);

    // Fetch current status to know if we need an intermediate submit/review step.
    const { data: cur, error: curErr } = await context.supabase
      .from("insurance_approvals")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    if (!cur) throw new Error("الطلب غير موجود.");

    const sb = context.supabase as any;
    const rpc = (to_status: InsuranceStatus, note?: string) =>
      sb.rpc("transition_insurance_approval", {
        _approval_id: data.id,
        _to_status: to_status,
        _note: note ?? null,
        _meta: {} as unknown as any,
      });

    let status = cur.status as InsuranceStatus;
    if (status === "draft") {
      const r = await rpc("submitted");
      if (r.error) throw new Error(r.error.message);
      status = "submitted";
    }
    if (status === "submitted" || status === "needs_more_docs") {
      const r = await rpc("under_review");
      if (r.error) throw new Error(r.error.message);
      status = "under_review";
    }
    const final = await rpc(data.decision, data.note);
    if (final.error) {
      const msg = final.error.message || "";
      if (msg.includes("ILLEGAL_TRANSITION")) throw new Error("انتقال حالة غير مسموح.");
      throw new Error(msg);
    }
    return { approval: final.data };
  });
