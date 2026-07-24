/**
 * Batch B1 — Prescription lifecycle.
 *
 * Doctor / admin transitions: active → completed | cancelled.
 * Pharmacy review transitions: pending → approved | rejected | needs_info.
 *
 * All writes require `patients.clinical.write` (clinical staff) or
 * `pharmacy.manage` (pharmacy staff) as appropriate.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasAnyRole } from "./_guard";

async function requirePermission(
  supabase: any,
  userId: string,
  key: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission_key: key,
  });
  if (error) throw new Error("تعذّر التحقق من الصلاحية.");
  if (data !== true) throw new Error("ليست لديك صلاحية تنفيذ هذه العملية.");
}

// ---------------- Complete ----------------
export const completePrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "doctor"]);
    await requirePermission(
      context.supabase,
      context.userId,
      "patients.clinical.write",
    );
    const { data: before } = await context.supabase
      .from("prescriptions")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("الوصفة غير موجودة.");
    if (before.status !== "active") throw new Error("الوصفة ليست فعّالة.");
    const { error } = await context.supabase
      .from("prescriptions")
      .update({
        status: "completed",
        notes: data.note ?? undefined,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------- Cancel ----------------
export const cancelPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin", "doctor"]);
    await requirePermission(
      context.supabase,
      context.userId,
      "patients.clinical.write",
    );
    const { data: before } = await context.supabase
      .from("prescriptions")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!before) throw new Error("الوصفة غير موجودة.");
    if (before.status === "cancelled")
      throw new Error("الوصفة ملغاة مسبقاً.");
    const { error } = await context.supabase
      .from("prescriptions")
      .update({
        status: "cancelled",
        notes: data.reason,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------- Pharmacy review ----------------
export const reviewPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "needs_info"]),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, ["admin"]);
    await requirePermission(
      context.supabase,
      context.userId,
      "pharmacy.manage",
    );
    const { error } = await context.supabase
      .from("prescriptions")
      .update({
        pharmacy_status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_notes: data.note ?? null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
