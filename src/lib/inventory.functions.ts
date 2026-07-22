/**
 * Inventory module — warehouse (branch) summary, low-stock alerts, purchase requests.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type WarehouseSummary = {
  branch_id: string | null;
  branch_name: string;
  items_count: number;
  low_count: number;
  out_count: number;
  expiring_count: number;
  expired_count: number;
  total_value: number;
};

export type LowStockAlert = {
  id: string;
  name_ar: string;
  branch_id: string | null;
  branch_name: string | null;
  quantity: number;
  min_stock: number;
  unit: string | null;
  status: "out" | "low";
};

export type PurchaseRequestStatus = "pending" | "approved" | "rejected" | "received" | "cancelled";
export type PurchaseRequestPriority = "low" | "normal" | "high" | "urgent";

export type PurchaseRequestItem = {
  id: string;
  request_id: string;
  item_id: string | null;
  name_ar: string;
  quantity: number;
  unit: string | null;
  estimated_price: number | null;
  notes: string | null;
};

export type PurchaseRequest = {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  request_no: string | null;
  priority: PurchaseRequestPriority;
  status: PurchaseRequestStatus;
  notes: string | null;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  items: PurchaseRequestItem[];
};

// -------- Warehouse summary --------
export const listWarehouseSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [branchesRes, itemsRes] = await Promise.all([
      context.supabase.from("branches" as never).select("id,name_ar,name_en"),
      context.supabase
        .from("inventory_items" as never)
        .select("branch_id,quantity,min_stock,price,expiry_date")
        .eq("is_active", true),
    ]);
    if (branchesRes.error) throw new Error(branchesRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);

    const branches = (branchesRes.data ?? []) as Array<{
      id: string;
      name_ar: string;
      name_en: string | null;
    }>;
    const items = (itemsRes.data ?? []) as Array<{
      branch_id: string | null;
      quantity: number;
      min_stock: number;
      price: number | null;
      expiry_date: string | null;
    }>;

    const now = Date.now();
    const DAY = 86_400_000;
    const map = new Map<string, WarehouseSummary>();
    const key = (id: string | null) => id ?? "__none__";
    for (const b of branches) {
      map.set(b.id, {
        branch_id: b.id,
        branch_name: b.name_ar || b.name_en || "فرع",
        items_count: 0,
        low_count: 0,
        out_count: 0,
        expiring_count: 0,
        expired_count: 0,
        total_value: 0,
      });
    }
    map.set("__none__", {
      branch_id: null,
      branch_name: "غير مخصص",
      items_count: 0,
      low_count: 0,
      out_count: 0,
      expiring_count: 0,
      expired_count: 0,
      total_value: 0,
    });

    for (const it of items) {
      const bucket = map.get(key(it.branch_id));
      if (!bucket) continue;
      bucket.items_count += 1;
      if (it.quantity <= 0) bucket.out_count += 1;
      else if (it.quantity <= it.min_stock) bucket.low_count += 1;
      if (it.expiry_date) {
        const days = Math.floor((new Date(it.expiry_date).getTime() - now) / DAY);
        if (days < 0) bucket.expired_count += 1;
        else if (days <= 30) bucket.expiring_count += 1;
      }
      bucket.total_value += Number(it.price ?? 0) * it.quantity;
    }
    return Array.from(map.values()).filter((w) => w.items_count > 0 || w.branch_id !== null);
  });

// -------- Low stock alerts --------
const LowStockInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
  })
  .default({});

export const listLowStockAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => LowStockInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("inventory_items" as never)
      .select("id,name_ar,branch_id,quantity,min_stock,unit")
      .eq("is_active", true)
      .order("quantity", { ascending: true })
      .limit(300);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const filtered = (
      (rows ?? []) as Array<{
        id: string;
        name_ar: string;
        branch_id: string | null;
        quantity: number;
        min_stock: number;
        unit: string | null;
      }>
    ).filter((r) => r.quantity <= r.min_stock);

    // Resolve branch names
    const branchIds = Array.from(
      new Set(filtered.map((r) => r.branch_id).filter(Boolean)),
    ) as string[];
    const names = new Map<string, string>();
    if (branchIds.length) {
      const { data: br } = await context.supabase
        .from("branches" as never)
        .select("id,name_ar,name_en")
        .in("id", branchIds);
      for (const b of (br ?? []) as Array<{
        id: string;
        name_ar: string;
        name_en: string | null;
      }>) {
        names.set(b.id, b.name_ar || b.name_en || "");
      }
    }
    return filtered.map<LowStockAlert>((r) => ({
      id: r.id,
      name_ar: r.name_ar,
      branch_id: r.branch_id,
      branch_name: r.branch_id ? (names.get(r.branch_id) ?? null) : null,
      quantity: r.quantity,
      min_stock: r.min_stock,
      unit: r.unit,
      status: r.quantity <= 0 ? "out" : "low",
    }));
  });

// -------- Purchase Requests --------
const PRListInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    status: z
      .enum(["pending", "approved", "rejected", "received", "cancelled", "all"])
      .default("all"),
  })
  .default({});

export const listPurchaseRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PRListInput.parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("purchase_requests" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<Omit<PurchaseRequest, "items" | "branch_name">>;
    if (list.length === 0) return [];

    const ids = list.map((r) => r.id);
    const branchIds = Array.from(new Set(list.map((r) => r.branch_id).filter(Boolean))) as string[];

    const [itemsRes, branchesRes] = await Promise.all([
      context.supabase
        .from("purchase_request_items" as never)
        .select("*")
        .in("request_id", ids),
      branchIds.length
        ? context.supabase
            .from("branches" as never)
            .select("id,name_ar,name_en")
            .in("id", branchIds)
        : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    ]);
    if (itemsRes.error) throw new Error(itemsRes.error.message);

    const itemsByReq = new Map<string, PurchaseRequestItem[]>();
    for (const it of (itemsRes.data ?? []) as PurchaseRequestItem[]) {
      const arr = itemsByReq.get(it.request_id) ?? [];
      arr.push(it);
      itemsByReq.set(it.request_id, arr);
    }
    const bmap = new Map<string, string>();
    for (const b of (branchesRes.data ?? []) as Array<{
      id: string;
      name_ar: string;
      name_en: string | null;
    }>) {
      bmap.set(b.id, b.name_ar || b.name_en || "");
    }

    return list.map<PurchaseRequest>((r) => ({
      ...r,
      branch_name: r.branch_id ? (bmap.get(r.branch_id) ?? null) : null,
      items: itemsByReq.get(r.id) ?? [],
    }));
  });

const PRCreateInput = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  notes: z.string().max(1000).nullable().optional(),
  items: z
    .array(
      z.object({
        item_id: z.string().uuid().nullable().optional(),
        name_ar: z.string().min(1).max(160),
        quantity: z.number().int().min(1),
        unit: z.string().max(30).nullable().optional(),
        estimated_price: z.number().min(0).nullable().optional(),
        notes: z.string().max(300).nullable().optional(),
      }),
    )
    .min(1),
});

export const createPurchaseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PRCreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const request_no = `PR-${Date.now().toString(36).toUpperCase()}`;
    const { data: pr, error } = await context.supabase
      .from("purchase_requests" as never)
      .insert({
        branch_id: data.branch_id ?? null,
        request_no,
        priority: data.priority,
        notes: data.notes ?? null,
        requested_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const requestId = (pr as { id: string }).id;

    const rows = data.items.map((i) => ({
      request_id: requestId,
      item_id: i.item_id ?? null,
      name_ar: i.name_ar,
      quantity: i.quantity,
      unit: i.unit ?? null,
      estimated_price: i.estimated_price ?? null,
      notes: i.notes ?? null,
    }));
    const { error: iErr } = await context.supabase
      .from("purchase_request_items" as never)
      .insert(rows as never);
    if (iErr) throw new Error(iErr.message);
    return { ok: true, id: requestId, request_no };
  });

const PRUpdateStatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "received", "cancelled"]),
  review_notes: z.string().max(1000).nullable().optional(),
});

export const updatePurchaseRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => PRUpdateStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      status: data.status,
      review_notes: data.review_notes ?? null,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("purchase_requests" as never)
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // On "received", auto-add stock movements for linked items
    if (data.status === "received") {
      const { data: items } = await context.supabase
        .from("purchase_request_items" as never)
        .select("item_id,quantity")
        .eq("request_id", data.id);
      const { data: prRow } = await context.supabase
        .from("purchase_requests" as never)
        .select("branch_id,request_no")
        .eq("id", data.id)
        .single();
      const branchId = (prRow as { branch_id: string | null } | null)?.branch_id ?? null;
      const refNo = (prRow as { request_no: string | null } | null)?.request_no ?? null;
      const moves = ((items ?? []) as Array<{ item_id: string | null; quantity: number }>)
        .filter((r) => r.item_id)
        .map((r) => ({
          item_id: r.item_id,
          branch_id: branchId,
          movement_type: "in",
          quantity_delta: Math.abs(r.quantity),
          reason: "purchase received",
          reference: refNo,
          created_by: context.userId,
        }));
      if (moves.length) {
        await context.supabase.from("stock_movements" as never).insert(moves as never);
      }
    }
    return { ok: true };
  });

export const deletePurchaseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("purchase_requests" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
