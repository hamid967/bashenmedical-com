/**
 * Public API — POST /api/public/insurance/verify
 *
 * Lightweight eligibility check for the booking wizard. Given the selected
 * doctor, an insurance provider, and (optionally) the patient's policy
 * number / member ID, returns eligibility + an estimated cost breakdown.
 *
 * The check is deliberately conservative:
 *   - The provider must exist and be active in `insurance_providers`.
 *   - The policy number must look plausible (min 4 chars) when supplied.
 * When a real payer API is wired in later, only this handler changes; the
 * response contract stays stable for the wizard.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkEligibility } from "@/lib/nphies/adapter.server";
import { applyRateLimit } from "@/lib/v3/rate-limit-unified.server";

const schema = z.object({
  doctor_id: z.string().uuid("doctor غير صالح"),
  provider_id: z.string().uuid("جهة تأمين غير صالحة"),
  policy_number: z.string().trim().max(64).optional().nullable(),
  member_id: z.string().trim().max(64).optional().nullable(),
  patient_national_id: z.string().trim().max(32).optional().nullable(),
});

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/insurance/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const _rl = await applyRateLimit(request, { category: "insurance" }); if (_rl) return _rl;
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json(400, { ok: false, message: "بيانات غير صالحة" });
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          return json(400, {
            ok: false,
            message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
          });
        }

        const policy = (parsed.data.policy_number ?? "").trim();
        if (policy && (policy.length < 4 || !/^[A-Za-z0-9\-\/]{4,64}$/.test(policy))) {
          return json(200, {
            ok: true,
            eligible: false,
            reason: "policy_invalid",
            message: "رقم البوليصة يبدو غير صالح. تحقّق منه أو تواصل مع الاستقبال.",
          });
        }

        try {
          const { mode, result } = await checkEligibility({
            doctor_id: parsed.data.doctor_id,
            provider_id: parsed.data.provider_id,
            policy_number: parsed.data.policy_number ?? null,
            member_id: parsed.data.member_id ?? null,
            patient_national_id: parsed.data.patient_national_id ?? null,
            ip: request.headers.get("x-forwarded-for"),
            user_agent: request.headers.get("user-agent"),
          });

          const messageByReason: Record<string, string> = {
            ok: "التأمين مؤهل. تفاصيل التكلفة موضّحة أدناه.",
            fee_unknown: "التأمين مؤهل، وسيتم احتساب التكلفة النهائية عند الاستقبال.",
            no_provider: "لم يتم اختيار جهة تأمين.",
            provider_inactive: "جهة التأمين غير معتمدة حاليًا. تواصل مع الاستقبال للتأكيد.",
          };

          return json(200, {
            ok: true,
            eligible: result.eligible,
            reason: result.reason,
            message:
              messageByReason[result.reason] ??
              (result.eligible
                ? "التأمين مؤهل."
                : "لم نتمكّن من تأكيد الأهلية. تواصل مع الاستقبال."),
            coverage_percent: result.coverage_percent,
            coverage_tier: result.coverage_tier ?? null,
            consultation_fee: result.consultation_fee,
            covered_amount: result.covered_amount,
            patient_share: result.patient_share,
            source: mode,
          });
        } catch {
          return json(500, { ok: false, message: "تعذّر التحقق حاليًا" });
        }
      },
    },
  },
});
