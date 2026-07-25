/**
 * G3 — Analytics AI: daily smart recommendations from aggregated KPIs.
 * Reads last 30 days from `bi_daily_kpis` (no PII), asks the model for
 * up to 10 concrete operational recommendations, writes to
 * `public.ai_recommendations`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callGatewayJson } from "./gateway.server";

const MODEL = "google/gemini-3.6-flash";

interface AiRec {
  scope: "global" | "branch" | "specialty" | "daypart";
  scope_id?: string | null;
  kind: string;
  title: string;
  priority: "low" | "medium" | "high";
  payload?: Record<string, unknown>;
}

export interface RecoBatchResult {
  written: number;
  suggested: number;
  model: string;
}

export async function runGenerateRecommendations(): Promise<RecoBatchResult> {
  const { data, error } = await supabaseAdmin
    .from("bi_daily_kpis")
    .select("*")
    .order("day", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  const kpis = data ?? [];
  if (kpis.length === 0) return { written: 0, suggested: 0, model: MODEL };

  const res = await callGatewayJson<{ recommendations: AiRec[] }>({
    model: MODEL,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content:
          'أنت محلل عمليات لمركز طبي. اقرأ KPIs المجمّعة (بدون PII) وأعد JSON: {recommendations: AiRec[]} — بحد أقصى 10 عناصر. كل عنصر: {scope, scope_id?, kind, title (عربي <=90 حرف), priority (low|medium|high), payload?}. ركّز على: تقليل No-show، تحسين استخدام السعة، رضا المريض.',
      },
      { role: "user", content: JSON.stringify({ kpis_last30: kpis }) },
    ],
  });

  if (!res.ok || !res.data?.recommendations) return { written: 0, suggested: 0, model: res.model };

  const recs = res.data.recommendations.slice(0, 10);
  let written = 0;
  const now = new Date().toISOString();
  for (const r of recs) {
    const priority = ["low", "medium", "high"].includes(r.priority) ? r.priority : "medium";
    const { error: insErr } = await supabaseAdmin.from("ai_recommendations").insert({
      scope: r.scope ?? "global",
      scope_id: r.scope_id ?? null,
      kind: r.kind ?? "operational",
      title: (r.title ?? "").slice(0, 200),
      payload: (r.payload ?? {}) as never,
      priority,
      status: "open",
      model: res.model,
      generated_at: now,
    });
    if (!insErr) written++;
  }
  return { written, suggested: recs.length, model: res.model };
}
