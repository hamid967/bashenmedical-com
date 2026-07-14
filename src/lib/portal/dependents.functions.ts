/**
 * Dependents (family members) — guardian-scoped CRUD.
 * All server fns require an authenticated user; RLS on public.dependents
 * scopes rows to auth.uid() = guardian_user_id.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Dependent = {
  id: string;
  guardian_user_id: string;
  patient_id: string | null;
  full_name: string;
  relationship: "child" | "spouse" | "parent" | "sibling" | "other";
  national_id: string | null;
  phone: string | null;
  gender: "male" | "female" | null;
  date_of_birth: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
};

const RELATIONSHIPS = ["child", "spouse", "parent", "sibling", "other"] as const;

const RelationshipEnum = z.enum(RELATIONSHIPS);
const GenderEnum = z.enum(["male", "female"]);

// Accepts a plain 10-digit Saudi ID or leaves it optional.
const NationalId = z
  .string()
  .trim()
  .regex(/^\d{10}$/, "national_id_invalid")
  .optional()
  .nullable();

// Saudi mobile — accepts +9665XXXXXXXX, 009665XXXXXXXX, or 05XXXXXXXX.
const Phone = z
  .string()
  .trim()
  .regex(/^(?:\+?966|0)?5\d{8}$/, "phone_invalid")
  .optional()
  .nullable();

const BaseSchema = z.object({
  full_name: z.string().trim().min(2, "name_too_short").max(120, "name_too_long"),
  relationship: RelationshipEnum,
  gender: GenderEnum.optional().nullable(),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_invalid")
    .optional()
    .nullable(),
  national_id: NationalId,
  phone: Phone,
});

/* ------------------------------ list ------------------------------ */

export const listDependents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("dependents")
      .select(
        "id, guardian_user_id, patient_id, full_name, relationship, national_id, phone, gender, date_of_birth, verified, created_at, updated_at",
      )
      .eq("guardian_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Dependent[];
  });

/* ------------------------------ getById ------------------------------ */

export const getDependent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("dependents")
      .select(
        "id, guardian_user_id, patient_id, full_name, relationship, national_id, phone, gender, date_of_birth, verified, created_at, updated_at",
      )
      .eq("id", data.id)
      .eq("guardian_user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as Dependent | null;
  });

/* ------------------------------ create ------------------------------ */

export const createDependent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => BaseSchema.parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("dependents")
      .insert({
        guardian_user_id: userId,
        full_name: data.full_name,
        relationship: data.relationship,
        gender: data.gender ?? null,
        date_of_birth: data.date_of_birth ?? null,
        national_id: data.national_id ?? null,
        phone: data.phone ?? null,
      })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as Dependent;
  });

/* ------------------------------ update ------------------------------ */

export const updateDependent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    BaseSchema.extend({ id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    const { data: row, error } = await supabase
      .from("dependents")
      .update({
        full_name: patch.full_name,
        relationship: patch.relationship,
        gender: patch.gender ?? null,
        date_of_birth: patch.date_of_birth ?? null,
        national_id: patch.national_id ?? null,
        phone: patch.phone ?? null,
      })
      .eq("id", id)
      .eq("guardian_user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as Dependent;
  });

/* ------------------------------ delete ------------------------------ */

export const deleteDependent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("dependents")
      .delete()
      .eq("id", data.id)
      .eq("guardian_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
