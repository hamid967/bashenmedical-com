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
  preauth_required: "يلزم الحصول على موافقة مسبقة من شركة التأمين قبل تنفيذ الخدمة.",
  out_of_network: "الطبيب خارج شبكة هذه الوثيقة. الحساب سيكون بالسعر النقدي.",
  policy_expired: "الوثيقة منتهية أو غير مفعّلة. تحقّق من تجديدها مع شركة التأمين.",
  limit_exceeded: "تم استنفاد سقف التغطية السنوي. الحصة على المريض بالكامل.",
  waiting_period: "الخدمة ضمن فترة الانتظار المنصوص عليها في الوثيقة.",
};

function maskPolicy(p: string | null | undefined): string | null {
  const s = (p ?? "").trim();
  if (!s) return null;
  if (s.length <= 4) return "•".repeat(s.length);
  return `${"•".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

// Small deterministic hash so the same (doctor, provider, policy) pair always
// yields the same mocked jitter — makes the adapter reproducible for QA.
function seedFrom(...parts: (string | null | undefined)[]): number {
  const s = parts.filter(Boolean).join("|");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

type MockResult = {
  eligible: boolean;
  reason: string;
  message: string;
  notes: string[];
  consultation_fee: number | null;
  coverage_percent: number | null;
  covered_amount: number | null;
  estimated_cost: number | null;
  patient_share: number | null;
  copay: number | null;
  deductible: number | null;
  plan_label: string | null;
};

function planLabel(tier: string | null): string | null {
  switch ((tier ?? "").toLowerCase()) {
    case "limited": return "خطة محدودة";
    case "basic": return "خطة أساسية";
    case "comprehensive": return "خطة شاملة";
    case "vip":
    case "premium": return "خطة مميّزة";
    default: return tier ? "خطة قياسية" : null;
  }
}

/**
 * Mock adapter — extends the RPC estimate with realistic payer scenarios:
 *  - deterministic partial-coverage jitter per (doctor, provider, policy)
 *  - tier-specific narrative + copay / deductible modifiers
 *  - policy-suffix hooks for QA/demo cases (preauth, out-of-network, expired…)
 *
 * When a real payer API replaces this, only this function changes.
 */
function applyMockAdapter(
  base: {
    eligible: boolean;
    reason: string;
    consultation_fee: number | null;
    coverage_percent: number | null;
    covered_amount: number | null;
    estimated_cost: number | null;
    patient_share: number | null;
    coverage_tier: string | null;
  },
  ctx: { policy: string; doctor_id: string; provider_id: string },
): MockResult {
  const tier = (base.coverage_tier ?? "").toLowerCase();
  const label = planLabel(base.coverage_tier);
  const notes: string[] = [];
  let eligible = base.eligible;
  let reason = base.reason;
  let coverage = base.coverage_percent ?? 0;
  const fee = base.consultation_fee ?? null;
  let copay: number | null = null;
  let deductible: number | null = null;

  const upPolicy = ctx.policy.toUpperCase();

  // 1) Policy-driven overrides (only when a policy was actually supplied).
  //    Ordered from hardest failure to softest.
  if (ctx.policy) {
    if (upPolicy.includes("EXP")) {
      return finalize({
        eligible: false, reason: "policy_expired", coverage: 0, fee,
        copay: null, deductible: null, tier, label,
        notes: ["يمكنك تجديد الوثيقة ثم إعادة التحقق."],
      });
    }
    if (upPolicy.endsWith("99")) {
      return finalize({
        eligible: false, reason: "out_of_network", coverage: 0, fee,
        copay: null, deductible: null, tier, label,
        notes: ["اسأل عن طبيب داخل الشبكة، أو تواصل مع خدمة العملاء."],
      });
    }
    if (upPolicy.endsWith("LMT")) {
      return finalize({
        eligible: false, reason: "limit_exceeded", coverage: 0, fee,
        copay: null, deductible: null, tier, label,
        notes: ["تم استخدام كامل المخصص السنوي لهذه الوثيقة."],
      });
    }
    if (upPolicy.endsWith("WAIT")) {
      return finalize({
        eligible: false, reason: "waiting_period", coverage: 0, fee,
        copay: null, deductible: null, tier, label,
        notes: ["يمكن تفعيل التغطية بعد انتهاء فترة الانتظار."],
      });
    }
    if (upPolicy.endsWith("00")) {
      eligible = true;
      reason = "preauth_required";
      notes.push("يلزم إرسال طلب موافقة مسبقة قبل الحجز الفعلي.");
    }
  }

  // 2) Deterministic partial-coverage jitter (variable partial coverage).
  //    ±7 percentage points, clamped to a sane range for the tier.
  if (eligible && reason !== "fee_unknown" && coverage > 0) {
    const seed = seedFrom(ctx.doctor_id, ctx.provider_id, ctx.policy);
    const jitter = (seed % 15) - 7; // -7..+7
    coverage = Math.max(20, Math.min(100, coverage + jitter));
  }

  // 3) Tier-specific modifiers + narrative.
  if (eligible && reason !== "fee_unknown" && fee !== null) {
    switch (tier) {
      case "limited":
        copay = 30;
        notes.push("تغطية محدودة — رسم مشاركة ثابت 30 ر.س.");
        break;
      case "basic":
        deductible = 50;
        notes.push("تُطبَّق نسبة الخصم بعد أول 50 ر.س من التكلفة.");
        break;
      case "comprehensive":
        copay = 15;
        notes.push("خطة شاملة — رسم رمزي 15 ر.س فقط.");
        break;
      case "vip":
      case "premium":
        coverage = 100;
        notes.push("خطة مميّزة — تغطية كاملة بلا مشاركة.");
        break;
      default:
        if (coverage >= 90) notes.push("تغطية عالية — الحصة على المريض رمزية.");
    }
  }

  return finalize({
    eligible, reason, coverage, fee,
    copay, deductible, tier, label,
    notes,
  });
}

function finalize(x: {
  eligible: boolean; reason: string; coverage: number; fee: number | null;
  copay: number | null; deductible: number | null; tier: string | null; label: string | null;
  notes: string[];
}): MockResult {
  let covered: number | null = null;
  let share: number | null = null;

  if (x.fee !== null) {
    if (!x.eligible) {
      covered = 0;
      share = x.fee;
    } else {
      // deductible first, then coverage %, then copay
      const afterDeductible = Math.max(0, x.fee - (x.deductible ?? 0));
      const cov = Math.round(((afterDeductible * x.coverage) / 100) * 100) / 100;
      covered = Math.min(x.fee, cov);
      share = Math.round((x.fee - covered + (x.copay ?? 0)) * 100) / 100;
      if (share < 0) share = 0;
    }
  }

  const base = REASON_MESSAGES[x.reason] ??
    (x.eligible ? "التأمين مؤهل." : "لم نتمكّن من تأكيد الأهلية. تواصل مع الاستقبال.");
  const prefix = x.label ? `${x.label}: ` : "";

  return {
    eligible: x.eligible,
    reason: x.reason,
    message: `${prefix}${base}`,
    notes: x.notes,
    consultation_fee: x.fee,
    coverage_percent: x.eligible ? x.coverage : 0,
    covered_amount: covered,
    estimated_cost: x.fee,
    patient_share: share,
    copay: x.copay,
    deductible: x.deductible,
    plan_label: x.label,
  };
}

export const verifyMyInsurance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VerifySchema.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const policy = (data.policy_number ?? "").trim();

    // Policy-shape early-out (unchanged contract).
    if (policy && (policy.length < 4 || !/^[A-Za-z0-9\-\/]{4,64}$/.test(policy))) {
      const result: MockResult = {
        eligible: false,
        reason: "policy_invalid",
        message: REASON_MESSAGES.policy_invalid,
        notes: [],
        consultation_fee: null,
        coverage_percent: null,
        covered_amount: null,
        estimated_cost: null,
        patient_share: null,
        copay: null,
        deductible: null,
        plan_label: null,
      };
      const id = await logAttempt(supabase, userId, data, policy, result);
      return { ok: true, id, ...result };
    }

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
      coverage_tier?: string | null;
      covered_amount?: number | null;
      estimated_cost?: number | null;
      patient_share?: number | null;
    };

    const result = applyMockAdapter(
      {
        eligible: r.eligible === true,
        reason: r.reason ?? (r.eligible ? "ok" : "unknown"),
        consultation_fee: r.consultation_fee ?? null,
        coverage_percent: r.coverage_percent ?? null,
        covered_amount: r.covered_amount ?? null,
        estimated_cost: r.estimated_cost ?? null,
        patient_share: r.patient_share ?? null,
        coverage_tier: r.coverage_tier ?? null,
      },
      { policy, doctor_id: data.doctor_id, provider_id: data.provider_id },
    );

    const id = await logAttempt(supabase, userId, data, policy, result);
    return { ok: true, id, ...result };
  });


async function logAttempt(
  supabase: any,
  userId: string,
  data: z.infer<typeof VerifySchema>,
  policy: string,
  r: MockResult,
) {
  const messageForLog = r.notes.length
    ? `${r.message} — ${r.notes.join(" · ")}`
    : r.message;
  const { error } = await supabase.from("insurance_verifications").insert({
    user_id: userId,
    doctor_id: data.doctor_id,
    provider_id: data.provider_id,
    appointment_id: data.appointment_id ?? null,
    policy_hint: maskPolicy(policy || null),
    eligible: r.eligible,
    reason: r.reason,
    message: messageForLog,
    consultation_fee: r.consultation_fee,
    coverage_percent: r.coverage_percent,
    covered_amount: r.covered_amount,
    estimated_cost: r.estimated_cost,
    patient_share: r.patient_share,
  });
  if (error) console.warn("[verifyMyInsurance] log failed:", error.message);
}


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
