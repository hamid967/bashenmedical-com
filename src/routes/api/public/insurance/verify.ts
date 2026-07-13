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
import { createClient } from "@supabase/supabase-js";

const schema = z.object({
  doctor_id: z.string().uuid("doctor غير صالح"),
  provider_id: z.string().uuid("جهة تأمين غير صالحة"),
  policy_number: z.string().trim().max(64).optional().nullable(),
  member_id: z.string().trim().max(64).optional().nullable(),
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

        const url = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !anonKey) {
          return json(500, { ok: false, message: "تعذّر التحقق حاليًا" });
        }

        const supa = createClient(url, anonKey, {
          auth: {
            storage: undefined,
            persistSession: false,
            autoRefreshToken: false,
          },
        });

        // Soft policy-shape check (max 64 chars, alnum + dashes) — a real
        // payer API would call out here.
        const policy = (parsed.data.policy_number ?? "").trim();
        if (policy && (policy.length < 4 || !/^[A-Za-z0-9\-\/]{4,64}$/.test(policy))) {
          return json(200, {
            ok: true,
            eligible: false,
            reason: "policy_invalid",
            message: "رقم البوليصة يبدو غير صالح. تحقّق منه أو تواصل مع الاستقبال.",
          });
        }

        const { data, error } = await supa.rpc("estimate_appointment_cost", {
          _doctor_id: parsed.data.doctor_id,
          _provider_id: parsed.data.provider_id,
        });
        if (error) {
          return json(500, { ok: false, message: "تعذّر التحقق حاليًا" });
        }

        const est = (data ?? {}) as {
          eligible?: boolean;
          reason?: string;
          consultation_fee?: number | null;
          coverage_percent?: number | null;
          coverage_tier?: string | null;
          covered_amount?: number | null;
          estimated_cost?: number | null;
          patient_share?: number | null;
        };

        const eligible = est.eligible === true;
        const messageByReason: Record<string, string> = {
          ok: "التأمين مؤهل. الحصة المتوقعة على المريض موضّحة أدناه.",
          fee_unknown:
            "التأمين مؤهل، وسيتم احتساب التكلفة النهائية عند الاستقبال.",
          no_provider: "لم يتم اختيار جهة تأمين.",
          provider_inactive:
            "جهة التأمين غير معتمدة حاليًا. تواصل مع الاستقبال للتأكيد.",
        };

        return json(200, {
          ok: true,
          eligible,
          reason: est.reason ?? (eligible ? "ok" : "unknown"),
          message:
            messageByReason[est.reason ?? ""] ??
            (eligible
              ? "التأمين مؤهل."
              : "لم نتمكّن من تأكيد الأهلية. تواصل مع الاستقبال."),
          coverage_percent: est.coverage_percent ?? null,
          coverage_tier: est.coverage_tier ?? null,
          consultation_fee: est.consultation_fee ?? null,
          covered_amount: est.covered_amount ?? null,
          estimated_cost: est.estimated_cost ?? null,
          patient_share: est.patient_share ?? null,
        });
      },
    },
  },
});
