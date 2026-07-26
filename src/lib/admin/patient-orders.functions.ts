/**
 * Patient-scoped Lab / Radiology orders — list and status updates for use
 * inside the patient record view. Access is restricted to `admin`, `doctor`
 * (and `super_admin` implicitly) matching the underlying RLS policies on
 * `lab_reports` / `radiology_reports`.
 *
 * Status lifecycle: pending → in_progress → completed
 *                             ↘ cancelled
 * Marking a row `completed` also stamps `released_at = now()`, making it
 * visible to the patient portal through the "Patients read own labs/radiology"
 * policies.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertHasAnyRole } from "./_guard";

const STAFF_ROLES = ["admin", "doctor"] as const;

const LAB_COLS =
  "id, title, test_type, summary, status, report_date, released_at, ordered_by, created_at";
const RAD_COLS =
  "id, modality, body_part, findings, status, report_date, released_at, ordered_by, created_at";

const ORDER_STATUS = z.enum(["pending", "in_progress", "completed", "cancelled"]);
type OrderStatus = z.infer<typeof ORDER_STATUS>;

const listSchema = z.object({ patient_id: z.string().uuid() });
const updateSchema = z.object({
  id: z.string().uuid(),
  status: ORDER_STATUS,
});

function patchFor(status: OrderStatus): Record<string, unknown> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === "completed") patch.released_at = now;
  if (status === "pending" || status === "in_progress" || status === "cancelled") {
    patch.released_at = null;
  }
  return patch;
}

export const listPatientLabOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const { data: rows, error } = await context.supabase
      .from("lab_reports")
      .select(LAB_COLS)
      .eq("patient_id", data.patient_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const listPatientRadOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const { data: rows, error } = await context.supabase
      .from("radiology_reports")
      .select(RAD_COLS)
      .eq("patient_id", data.patient_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const updateLabOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const { data: row, error } = await context.supabase
      .from("lab_reports")
      .update(patchFor(data.status))
      .eq("id", data.id)
      .select(LAB_COLS)
      .single();
    if (error) throw new Error(error.message);
    return { row };
  });

export const updateRadOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.supabase, context.userId, [...STAFF_ROLES]);
    const { data: row, error } = await context.supabase
      .from("radiology_reports")
      .update(patchFor(data.status))
      .eq("id", data.id)
      .select(RAD_COLS)
      .single();
    if (error) throw new Error(error.message);
    return { row };
  });
