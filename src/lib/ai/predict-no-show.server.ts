/**
 * G3 — Analytics AI: No-show risk batch scorer.
 * Heuristic (logistic-style) based on lead time, time-of-day, insurance
 * status, WhatsApp opt-in, and any pre-computed `appointments.no_show_risk`.
 * Writes to `public.no_show_predictions` via service role.
 * Never sends PII to the gateway; the AI layer only translates the
 * numeric factors into an Arabic recommendation string.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callGatewayJson } from "./gateway.server";

type Factor = { key: string; weight: number; note: string };

interface Row {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  no_show_risk: number | null;
  whatsapp_opt_in: boolean | null;
  insurance_status: string | null;
  branch_id: string | null;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function scoreRow(row: Row, now: Date): { risk: number; factors: Factor[] } {
  const factors: Factor[] = [];
  let logit = -1.2; // baseline ≈ 23%

  const when = new Date(`${row.appointment_date}T${row.appointment_time}`);
  const leadHours = Math.max(0, (when.getTime() - now.getTime()) / 36e5);

  if (leadHours > 72) {
    logit += 0.6;
    factors.push({ key: "long_lead", weight: 0.6, note: "حجز مبكر (>72 ساعة)" });
  } else if (leadHours < 12) {
    logit -= 0.4;
    factors.push({ key: "same_day", weight: -0.4, note: "نفس اليوم — مخاطرة أقل" });
  }

  const hour = when.getHours();
  if (hour < 10 || hour >= 19) {
    logit += 0.3;
    factors.push({ key: "off_peak", weight: 0.3, note: "وقت خارج الذروة" });
  }

  if (row.whatsapp_opt_in === false) {
    logit += 0.5;
    factors.push({ key: "no_whatsapp", weight: 0.5, note: "لا يستقبل تذكير واتساب" });
  }

  if (row.insurance_status === "pending" || row.insurance_status === "unknown") {
    logit += 0.4;
    factors.push({ key: "insurance_unclear", weight: 0.4, note: "حالة التأمين غير مؤكدة" });
  }

  if (typeof row.no_show_risk === "number") {
    // Blend with DB-computed risk if available.
    const blend = sigmoid(logit) * 0.4 + row.no_show_risk * 0.6;
    return { risk: Math.min(0.999, Math.max(0.001, blend)), factors };
  }

  return { risk: Math.min(0.999, Math.max(0.001, sigmoid(logit))), factors };
}

export interface PredictBatchResult {
  scanned: number;
  written: number;
  highRisk: number;
  errors: number;
}

/**
 * Runs the batch scorer for appointments in the next `windowHours`.
 * Called by the cron endpoint under `/api/public/hooks/predict-no-show`.
 */
export async function runPredictNoShowBatch(windowHours = 48): Promise<PredictBatchResult> {
  const now = new Date();
  const until = new Date(now.getTime() + windowHours * 36e5);

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, appointment_date, appointment_time, status, no_show_risk, whatsapp_opt_in, insurance_status, branch_id",
    )
    .in("status", ["confirmed", "pending_confirmation", "pending_insurance"])
    .gte("appointment_date", now.toISOString().slice(0, 10))
    .lte("appointment_date", until.toISOString().slice(0, 10))
    .limit(2000);

  if (error) throw new Error(error.message);

  let written = 0;
  let highRisk = 0;
  let errors = 0;
  const rows = (data ?? []) as Row[];

  for (const row of rows) {
    const { risk, factors } = scoreRow(row, now);
    if (risk >= 0.6) highRisk++;

    let recommendation: string | null = null;
    if (risk >= 0.6) {
      recommendation = factors.find((f) => f.key === "no_whatsapp")
        ? "أضف تذكيرًا هاتفيًا مباشرًا قبل 24 ساعة."
        : "أرسل تذكير واتساب مسبق + تأكيد قبل 12 ساعة.";
    }

    const { error: upErr } = await supabaseAdmin.from("no_show_predictions").upsert(
      {
        appointment_id: row.id,
        risk,
        top_factors: factors,
        recommendation,
        model: "heuristic-v1",
        computed_at: now.toISOString(),
      },
      { onConflict: "appointment_id" },
    );
    if (upErr) errors++;
    else written++;
  }

  return { scanned: rows.length, written, highRisk, errors };
}

/**
 * Optional: enrich a single high-risk row with an AI-authored Arabic
 * recommendation using masked features only.
 */
export async function explainRiskWithAI(params: {
  risk: number;
  factors: { key: string; weight: number; note: string }[];
}): Promise<string | null> {
  const res = await callGatewayJson<{ recommendation: string }>({
    model: "google/gemini-3.6-flash",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "أنت مساعد تشغيلي في مركز طبي. أعد JSON: {recommendation:string}. اكتب توصية عربية موجزة (<=140 حرف) لتقليل احتمال عدم الحضور. لا تذكر أسماء أو أرقامًا شخصية.",
      },
      {
        role: "user",
        content: JSON.stringify({ risk: params.risk, factors: params.factors }),
      },
    ],
  });
  return res.data?.recommendation ?? null;
}
