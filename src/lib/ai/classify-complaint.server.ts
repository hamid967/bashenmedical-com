/**
 * G3 — Analytics AI: complaint auto-classification.
 * Server-only. Called by the hook route or by admin fn override.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callGatewayJson } from "./gateway.server";
import { maskText } from "./pii-mask";

const MODEL = "google/gemini-3.6-flash";

const CATEGORIES = [
  "appointment_delay",
  "billing",
  "staff_behavior",
  "clinical_quality",
  "cleanliness",
  "communication",
  "other",
] as const;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const OWNERS = ["reception", "billing", "clinical", "operations", "management"] as const;

export interface ClassificationResult {
  ai_category: string;
  ai_severity: string;
  ai_suggested_owner: string;
}

export async function classifyComplaint(complaintId: string): Promise<ClassificationResult | null> {
  const { data: c, error } = await supabaseAdmin
    .from("complaints")
    .select("id, type, message, department")
    .eq("id", complaintId)
    .maybeSingle();
  if (error || !c) return null;

  const masked = maskText(c.message, 1500);

  const res = await callGatewayJson<ClassificationResult>({
    model: MODEL,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          `صنّف الشكوى الطبية. أعد JSON فقط بالحقول: ai_category (${CATEGORIES.join("|")}), ai_severity (${SEVERITIES.join("|")}), ai_suggested_owner (${OWNERS.join("|")}). بدون أي نص إضافي.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          type: c.type,
          department: c.department ?? null,
          message: masked,
        }),
      },
    ],
  });

  if (!res.ok || !res.data) return null;

  const clamp = <T extends readonly string[]>(v: string, list: T, fallback: T[number]) =>
    (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;

  const out: ClassificationResult = {
    ai_category: clamp(res.data.ai_category, CATEGORIES, "other"),
    ai_severity: clamp(res.data.ai_severity, SEVERITIES, "medium"),
    ai_suggested_owner: clamp(res.data.ai_suggested_owner, OWNERS, "operations"),
  };

  await supabaseAdmin
    .from("complaints")
    .update({
      ai_category: out.ai_category,
      ai_severity: out.ai_severity,
      ai_suggested_owner: out.ai_suggested_owner,
      ai_classified_at: new Date().toISOString(),
      ai_model: res.model,
    })
    .eq("id", complaintId);

  return out;
}
