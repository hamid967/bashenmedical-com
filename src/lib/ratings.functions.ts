/**
 * Ratings server functions — staff-side aggregates and lists.
 * Public submission uses browser client with anon key (see rate.tsx).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (name: string, args?: Record<string, unknown>) => any;

export type RatingSummaryRow = {
  scope: "doctor" | "branch";
  entity_id: string;
  entity_name: string;
  ratings_count: number;
  avg_rating: number;
  stars_1: number;
  stars_2: number;
  stars_3: number;
  stars_4: number;
  stars_5: number;
};

export type RatingRow = {
  id: string;
  branch_id: string | null;
  doctor_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  rating: number;
  comment: string | null;
  source: string;
  created_at: string;
  staff_reply: string | null;
  staff_reply_at: string | null;
  staff_reply_by: string | null;
  branch_name?: string | null;
  doctor_name?: string | null;
};

const SummaryInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    doctorId: z.string().uuid().nullable().optional(),
    days: z.number().int().min(1).max(365).optional(),
  })
  .default({});

const ListInput = z
  .object({
    branchId: z.string().uuid().nullable().optional(),
    doctorId: z.string().uuid().nullable().optional(),
    minRating: z.number().int().min(1).max(5).nullable().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .default({});

export const getRatingsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(SummaryInput.parse)
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc as unknown as Rpc;
    const { data: rows, error } = await rpc("get_ratings_summary", {
      _branch_id: data.branchId ?? null,
      _doctor_id: data.doctorId ?? null,
      _days: data.days ?? 90,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as RatingSummaryRow[];
  });

export const listRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(ListInput.parse)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("patient_ratings" as never)
      .select(
        "id, branch_id, doctor_id, patient_name, patient_phone, rating, comment, source, created_at, staff_reply, staff_reply_at, staff_reply_by",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.branchId) q = q.eq("branch_id", data.branchId);
    if (data.doctorId) q = q.eq("doctor_id", data.doctorId);
    if (data.minRating != null) q = q.gte("rating", data.minRating);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as RatingRow[];

    // Enrich with names
    const branchIds = [...new Set(list.map((r) => r.branch_id).filter(Boolean) as string[])];
    const doctorIds = [...new Set(list.map((r) => r.doctor_id).filter(Boolean) as string[])];
    const [branches, doctors] = await Promise.all([
      branchIds.length
        ? context.supabase
            .from("branches" as never)
            .select("id, name_ar")
            .in("id", branchIds)
        : Promise.resolve({ data: [] as { id: string; name_ar: string }[] }),
      doctorIds.length
        ? context.supabase
            .from("doctors" as never)
            .select("id, name_ar")
            .in("id", doctorIds)
        : Promise.resolve({ data: [] as { id: string; name_ar: string }[] }),
    ]);
    const bMap = new Map(
      (branches.data ?? []).map((b: { id: string; name_ar: string }) => [b.id, b.name_ar]),
    );
    const dMap = new Map(
      (doctors.data ?? []).map((d: { id: string; name_ar: string }) => [d.id, d.name_ar]),
    );
    return list.map((r) => ({
      ...r,
      branch_name: r.branch_id ? (bMap.get(r.branch_id) ?? null) : null,
      doctor_name: r.doctor_id ? (dMap.get(r.doctor_id) ?? null) : null,
      // Mask phone: show last 4 digits only
      patient_phone: r.patient_phone
        ? r.patient_phone.length > 4
          ? "•••" + r.patient_phone.slice(-4)
          : r.patient_phone
        : null,
    }));
  });

export const deleteRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("patient_ratings" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replyToRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; reply: string | null }) =>
    z.object({ id: z.string().uuid(), reply: z.string().max(1000).nullable() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc as unknown as Rpc;
    const { error } = await rpc("reply_to_rating", { _id: data.id, _reply: data.reply });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// For QR cards & staff pickers
export const listBranchesForRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("branches" as never)
      .select("id, name_ar, name_en, slug")
      .order("name_ar");
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string;
      name_ar: string;
      name_en: string | null;
      slug: string | null;
    }[];
  });

export const listDoctorsForRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("doctors" as never)
      .select("id, name_ar, name_en, branch_id, slug")
      .order("name_ar");
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string;
      name_ar: string;
      name_en: string | null;
      branch_id: string | null;
      slug: string | null;
    }[];
  });
