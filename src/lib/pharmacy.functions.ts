/**
 * Pharmacy module — inventory, stock movements, prescription reviews.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type InventoryItem = {
  id: string;
  branch_id: string | null;
  name_ar: string;
  name_en: string | null;
  sku: string | null;
  barcode: string | null;
  form: string | null;
  unit: string | null;
  quantity: number;
  min_stock: number;
  expiry_date: string | null;
  price: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // derived
  expiry_status: "expired" | "expiring" | "ok" | "none";
  stock_status: "out" | "low" | "ok";
};

export type MovementType = "in" | "out" | "adjust" | "waste" | "transfer";
export type StockMovement = {
  id: string;
  item_id: string;
  branch_id: string | null;
  movement_type: MovementType;
  quantity_delta: number;
  reason: string | null;
  reference: string | null;
  created_by: string | null;
  created_at: string;
};

export type PharmacyStatus = "pending" | "approved" | "rejected" | "needs_info";
export type PharmacyPrescription = {
  id: string;
  patient_id: string;
  patient_name: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  medication: string;
  dosage: string | null;
  instructions: string | null;
  pharmacy_status: PharmacyStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  branch_id: string | null;
  item_id: string | null;
  dispense_qty: number | null;
  created_at: string;
};

const ONE_DAY = 86_400_000;
function deriveInventory(
  row: Omit<InventoryItem, "expiry_status" | "stock_status">,
): InventoryItem {
  let exp: InventoryItem["expiry_status"] = "none";
  if (row.expiry_date) {
    const days = Math.floor((new Date(row.expiry_date).getTime() - Date.now()) / ONE_DAY);
    exp = days < 0 ? "expired" : days <= 30 ? "expiring" : "ok";
  }
  const stock: InventoryItem["stock_status"] =
    row.quantity <= 0 ? "out" : row.quantity <= row.min_stock ? "low" : "ok";
  return { ...row, expiry_status: exp, stock_status: stock };
}

// -------- Inventory --------
const InvListInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    filter: z.enum(["all", "expired", "expiring", "low", "out"]).nullable().optional(),
    search: z.string().max(80).nullable().optional(),
  })
  .default({});

export const listInventoryItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => InvListInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("inventory_items" as never)
      .select("*")
      .eq("is_active", true)
      .order("name_ar")
      .limit(500);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.search) q = q.ilike("name_ar", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const enriched = (rows ?? []).map((r) => deriveInventory(r as never));
    if (!data.filter || data.filter === "all") return enriched;
    return enriched.filter((r) => {
      if (data.filter === "expired") return r.expiry_status === "expired";
      if (data.filter === "expiring") return r.expiry_status === "expiring";
      if (data.filter === "low") return r.stock_status === "low";
      if (data.filter === "out") return r.stock_status === "out";
      return true;
    });
  });

const InvUpsertInput = z.object({
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  name_ar: z.string().min(2).max(160),
  name_en: z.string().max(160).nullable().optional(),
  sku: z.string().max(40).nullable().optional(),
  barcode: z.string().max(60).nullable().optional(),
  form: z.string().max(30).nullable().optional(),
  unit: z.string().max(30).nullable().optional(),
  quantity: z.number().int().min(0).default(0),
  min_stock: z.number().int().min(0).default(0),
  expiry_date: z.string().nullable().optional(),
  price: z.number().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const upsertInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => InvUpsertInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase
        .from("inventory_items" as never)
        .update(rest as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const { data: row, error } = await context.supabase
      .from("inventory_items" as never)
      .insert(rest as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Soft-delete via is_active flag (safer against FK from movements)
    const { error } = await context.supabase
      .from("inventory_items" as never)
      .update({ is_active: false } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Stock Movements --------
const MovementListInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    itemId: z.string().uuid().nullable().optional(),
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
  })
  .default({});

export const listStockMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => MovementListInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("stock_movements" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.itemId) q = q.eq("item_id", data.itemId);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as StockMovement[];
  });

const MoveCreateInput = z.object({
  item_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  movement_type: z.enum(["in", "out", "adjust", "waste", "transfer"]),
  quantity: z.number().int().min(1),
  reason: z.string().max(300).nullable().optional(),
  reference: z.string().max(80).nullable().optional(),
});

export const createStockMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => MoveCreateInput.parse(d))
  .handler(async ({ data, context }) => {
    // Sign: in -> +, out/waste -> -, adjust/transfer keep user-signed magnitude
    let delta = data.quantity;
    if (data.movement_type === "out" || data.movement_type === "waste") delta = -Math.abs(delta);
    else if (data.movement_type === "in") delta = Math.abs(delta);
    const payload = {
      item_id: data.item_id,
      branch_id: data.branch_id ?? null,
      movement_type: data.movement_type,
      quantity_delta: delta,
      reason: data.reason ?? null,
      reference: data.reference ?? null,
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("stock_movements" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id: string }).id };
  });

// -------- Prescription reviews --------
const RxListInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    status: z.enum(["pending", "approved", "rejected", "needs_info", "all"]).default("pending"),
  })
  .default({});

export const listPharmacyPrescriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => RxListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "list_pharmacy_prescriptions" as never,
      {
        _branch_id: data.branchId ?? null,
        _status: data.status,
      } as never,
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as PharmacyPrescription[];
  });

const ReviewInput = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "needs_info"]),
  notes: z.string().max(1000).nullable().optional(),
  item_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).nullable().optional(),
});

export const reviewPrescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ReviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "pharmacy_review_prescription" as never,
      {
        _id: data.id,
        _decision: data.decision,
        _notes: data.notes ?? null,
        _item_id: data.item_id ?? null,
        _quantity: data.quantity ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
