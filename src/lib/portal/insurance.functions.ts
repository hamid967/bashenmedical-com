import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* --------------------------- verifyMyInsurance ---------------------------- */

const VerifySchema = z.object({
  doctor_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  policy_number: z.string().trim().max(64).optional().nullable(),
  appointment_id: z.string().uuid().optional().nullable(),
});

const REASON_MESSAGES: Record<string, string> = {
  ok: "التأمين مؤهل. الحصة المتوقعة على المريض موضّحة أدناه.",
  fee_unknown: "التأمين مؤهل، وسيتم احتساب التكلفة النهائية عند الاستقبال.",
  no_provider: "لم يتم اختيار جهة تأمين.",
  provider_inactive: "جهة التأمين غير معتمدة حاليًا. تواصل مع الاستقبال للتأكيد.",
  policy_invalid: "رقم البوليصة يبدو غير صالح. تحقّق منه أو تواصل مع الاستقبال.",
};

function maskPolicy(p: string | null | undefined): string | null {
  const s = (p ?? "").trim();
  if (!s) return null;
  if (s.length <= 4) return "•".repeat(s.length);
  return `${"•".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

export const verifyMyInsurance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VerifySchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const policy = (data.policy_number ?? "").trim();
    let eligible = false;
    let reason = "unknown";
    let message = "لم نتمكّن من تأكيد الأهلية. تواصل مع الاستقبال.";
    let consultation_fee: number | null = null;
    let coverage_percent: number | null = null;
    let covered_amount: number | null = null;
    let estimated_cost: number | null = null;
    let patient_share: number | null = null;

    if (policy && (policy.length < 4 || !/^[A-Za-z0-9\-\/]{4,64}$/.test(policy))) {
      reason = "policy_invalid";
      message = REASON_MESSAGES.policy_invalid;
    } else {
      const { data: est, error } = await supabase.rpc("estimate_appointment_cost", {
        _doctor_id: data.doctor_id,
        _provider_id: data.provider_id,
      });
      if (error) throw new Error("تعذّر التحقق حاليًا");
      const r = (est ?? {}) as {
        eligible?: boolean;
        reason?: string;
        consultation_fee?: number | null;
        coverage_percent?: number | null;
        covered_amount?: number | null;
        estimated_cost?: number | null;
        patient_share?: number | null;
      };
      eligible = r.eligible === true;
      reason = r.reason ?? (eligible ? "ok" : "unknown");
      message =
        REASON_MESSAGES[reason] ??
        (eligible ? "التأمين مؤهل." : "لم نتمكّن من تأكيد الأهلية. تواصل مع الاستقبال.");
      consultation_fee = r.consultation_fee ?? null;
      coverage_percent = r.coverage_percent ?? null;
      covered_amount = r.covered_amount ?? null;
      estimated_cost = r.estimated_cost ?? null;
      patient_share = r.patient_share ?? null;
    }

    // Log the verification attempt (RLS: user_id = auth.uid()).
    const { error: logErr } = await supabase.from("insurance_verifications").insert({
      user_id: userId,
      doctor_id: data.doctor_id,
      provider_id: data.provider_id,
      appointment_id: data.appointment_id ?? null,
      policy_hint: maskPolicy(policy || null),
      eligible,
      reason,
      message,
      consultation_fee,
      coverage_percent,
      covered_amount,
      estimated_cost,
      patient_share,
    });
    if (logErr) {
      // Non-fatal: return the verification even if logging fails.
      console.warn("[verifyMyInsurance] log failed:", logErr.message);
    }

    return {
      ok: true,
      eligible,
      reason,
      message,
      consultation_fee,
      coverage_percent,
      covered_amount,
      estimated_cost,
      patient_share,
    };
  });

/* --------------------------- listMyVerifications -------------------------- */

const ListSchema = z.object({
  doctor_id: z.string().uuid().optional().nullable(),
  provider_id: z.string().uuid().optional().nullable(),
  appointment_id: z.string().uuid().optional().nullable(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const listMyInsuranceVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListSchema.parse(i ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("insurance_verifications")
      .select(
        "id, created_at, doctor_id, provider_id, appointment_id, policy_hint, eligible, reason, message, consultation_fee, coverage_percent, covered_amount, estimated_cost, patient_share",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (data.doctor_id) q = q.eq("doctor_id", data.doctor_id);
    if (data.provider_id) q = q.eq("provider_id", data.provider_id);
    if (data.appointment_id) q = q.eq("appointment_id", data.appointment_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich provider name (small in-memory lookup — providers list is short).
    const providerIds = Array.from(new Set((rows ?? []).map((r) => r.provider_id).filter(Boolean))) as string[];
    let providerMap = new Map<string, { name_ar: string | null }>();
    if (providerIds.length) {
      const { data: provs } = await supabase
        .from("insurance_providers")
        .select("id, name_ar")
        .in("id", providerIds);
      providerMap = new Map((provs ?? []).map((p) => [p.id, { name_ar: p.name_ar }]));
    }

    return (rows ?? []).map((r) => ({
      ...r,
      provider_name_ar: r.provider_id ? providerMap.get(r.provider_id)?.name_ar ?? null : null,
    }));
  });
