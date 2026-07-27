/**
 * HIS — Pharmacy dispense workflow.
 * Marks an approved prescription as dispensed by recording an "out" stock movement
 * (which decrements inventory via existing trigger/derivation) and appending an
 * audit stamp to review_notes. Approved + item_id + dispense_qty required.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasRole } from "@/lib/admin/_guard";

async function assertPharmacyAccess(ctx: { supabase: unknown; userId: string }) {
  const [a, p] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "pharmacy" }),
  ]);
  if (a.data !== true && p.data !== true) {
    await assertHasRole(ctx.supabase, ctx.userId, "admin");
  }
}

const Input = z.object({
  prescription_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(10_000).optional(),
});

export const dispensePrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    await assertPharmacyAccess(context);
    const { data: rx, error: rxErr } = await context.supabase
      .from("prescriptions")
      .select("id, pharmacy_status, item_id, dispense_qty, branch_id, review_notes")
      .eq("id", data.prescription_id)
      .maybeSingle();
    if (rxErr) throw new Error(rxErr.message);
    if (!rx) throw new Error("الوصفة غير موجودة");
    const item_id = rx.item_id as string | null;
    const qty = (data.quantity ?? (rx.dispense_qty as number | null)) as number | null;
    if (rx.pharmacy_status !== "approved") throw new Error("لا يمكن الصرف إلا للوصفات المعتمدة");
    if (!item_id) throw new Error("لا يوجد صنف مرتبط بالوصفة");
    if (!qty || qty <= 0) throw new Error("الكمية غير صحيحة");

    // Record stock movement (out)
    const { error: mvErr } = await context.supabase.from("stock_movements").insert({
      item_id,
      branch_id: rx.branch_id ?? null,
      movement_type: "out",
      quantity_delta: -Math.abs(qty),
      reason: "dispense",
      reference: `rx:${rx.id}`,
      created_by: context.userId,
    });
    if (mvErr) throw new Error(mvErr.message);

    // Stamp audit trail on the prescription; keep pharmacy_status='approved'
    // because 'dispensed' is not part of the current enum contract.
    const stamp = `[DISPENSED @ ${new Date().toISOString()} by ${context.userId} qty=${qty}]`;
    const notes = `${(rx.review_notes as string | null) ?? ""}\n${stamp}`.trim();
    const { error: upErr } = await context.supabase
      .from("prescriptions")
      .update({ review_notes: notes, dispense_qty: qty })
      .eq("id", rx.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true };
  });
